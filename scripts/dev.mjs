#!/usr/bin/env node
// One command to run the demo on http://localhost:8000. Safe to re-run: finished steps are skipped.
//   node scripts/dev.mjs            set up venv + web build if missing, then serve (dataset is yours to drop in)
//   node scripts/dev.mjs --check    only report what is missing
//   node scripts/dev.mjs --no-build skip the web build
//   node scripts/dev.mjs --demo     final demo: full dataset first, only the demo projects (docs/demo.md)
import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "web");
const win = process.platform === "win32";
const args = new Set(process.argv.slice(2));
const DATA_HOME = resolve(ROOT, "..", "junction-data");

const log = (m) => console.log(`==> ${m}`);
const die = (m) => {
  console.error(`FIX  ${m}`);
  process.exit(1);
};
// npm is npm.cmd on Windows and needs a shell; args are constants, so one command string is safe
const run = (cmd, a, opts = {}) =>
  cmd === "npm"
    ? spawnSync(`npm ${a.join(" ")}`, { stdio: "inherit", cwd: ROOT, shell: true, ...opts })
    : spawnSync(cmd, a, { stdio: "inherit", cwd: ROOT, ...opts });
const ok = (cmd, a) => spawnSync(cmd, a, { stdio: "ignore" }).status === 0;

function newest(dir) {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}

// .env is gitignored; load it so GEMINI_API_KEY etc. reach the server
function loadEnv() {
  const f = join(ROOT, ".env");
  const env = {};
  if (!existsSync(f)) return env;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}

const venvPy = join(ROOT, ".venv", win ? "Scripts" : "bin", win ? "python.exe" : "python");

// any folder under DATA_HOME holding questions.jsonl counts, so a drag-and-drop of the unzipped folder just works
function findData(dir, depth = 3) {
  if (existsSync(join(dir, "questions.jsonl"))) return dir;
  if (depth === 0 || !existsSync(dir)) return null;
  const subs = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    // the demo needs the full dataset (Vitoria revisions, whole sheet sets); otherwise the small preview loads faster
    .sort((x, y) => (Number(/preview/i.test(y)) - Number(/preview/i.test(x))) * (args.has("--demo") ? -1 : 1));
  for (const n of subs) {
    const hit = findData(join(dir, n), depth - 1);
    if (hit) return hit;
  }
  return null;
}
const envData = process.env.STOA_DATA || loadEnv().STOA_DATA;
const dataDir = envData ? resolve(envData) : findData(DATA_HOME);
// stamp is written only after pip succeeds, so an interrupted install is retried
const depsStamp = join(ROOT, ".venv", ".deps-ok");
const reqFile = join(ROOT, "requirements.txt");
const needVenv =
  !existsSync(venvPy) || !existsSync(depsStamp) || statSync(reqFile).mtimeMs > statSync(depsStamp).mtimeMs;
const needData = !dataDir || !existsSync(join(dataDir, "questions.jsonl"));
const distIndex = join(WEB, "dist", "index.html");
// npm writes this file on every install; older than the lockfile means deps changed (e.g. a merged PR added one)
const webStamp = join(WEB, "node_modules", ".package-lock.json");
const needWebDeps =
  !existsSync(webStamp) || statSync(join(WEB, "package-lock.json")).mtimeMs > statSync(webStamp).mtimeMs;
const needBuild =
  !args.has("--no-build") &&
  (needWebDeps ||
    !existsSync(distIndex) ||
    newest(join(WEB, "src")) > statSync(distIndex).mtimeMs ||
    statSync(join(WEB, "package.json")).mtimeMs > statSync(distIndex).mtimeMs);

if (args.has("--check")) {
  console.log(`venv:    ${needVenv ? "missing or deps not installed" : "ok"}`);
  console.log(`dataset: ${needData ? "MISSING" : "ok"}  (${dataDir ?? DATA_HOME})`);
  console.log(`web/dist: ${needBuild ? "missing or stale" : "ok"}`);
  process.exit(needVenv || needData || needBuild ? 1 : 0);
}

if (!ok("node", ["--version"])) die("node missing: install Node 18+");

if (needData) {
  const where = envData ? resolve(envData) : DATA_HOME;
  mkdirSync(where, { recursive: true });
  console.error("FIX  dataset not found. Unzip it and drag the unzipped folder (the one that contains questions.jsonl) into:");
  console.error(`
     ${where}
`);
  console.error("     then run this script again. Data is large: it stays outside the repo and is never committed.");
  process.exit(1);
}

if (args.has("--demo") && /preview/i.test(dataDir))
  console.error("WARN --demo on the preview dataset: the Vitoria revisions and whole sheet sets need the full one (set STOA_DATA)");

// fail here, not after minutes of install, when another copy of the server holds the port
const PORT = 8000;
const portFree = await new Promise((done) => {
  const t = createServer();
  t.once("error", () => done(false));
  t.listen(PORT, "127.0.0.1", () => t.close(() => done(true)));
});
if (!portFree) {
  console.error(`FIX  port ${PORT} is already in use, probably another copy of this server.`);
  console.error(`     Open http://localhost:${PORT}: it may already be serving. Otherwise find and stop it:`);
  console.error(win ? `       netstat -ano | findstr :${PORT}      then      taskkill /PID <pid> /F` : `       lsof -i :${PORT}      then      kill <pid>`);
  process.exit(1);
}

if (needVenv) {
  if (!existsSync(venvPy)) {
    const py = ["python", "python3", "py"].find((c) => ok(c, ["--version"]));
    if (!py) die("Python 3.11+ missing: install it, then re-run");
    log("creating .venv");
    if (run(py, ["-m", "venv", ".venv"]).status !== 0) die("venv creation failed");
  }
  log("installing requirements");
  if (run(venvPy, ["-m", "pip", "install", "-r", "requirements.txt"]).status !== 0)
    die("pip install failed");
  writeFileSync(depsStamp, new Date().toISOString());
}

if (needBuild) {
  if (needWebDeps) {
    log("npm ci (web)");
    if (run("npm", ["ci"], { cwd: WEB }).status !== 0) die("npm ci failed");
  }
  log("building web UI");
  if (run("npm", ["run", "build"], { cwd: WEB }).status !== 0) die("web build failed");
}

log(`serving http://localhost:8000  (STOA_DATA=${dataDir})`);
const child = spawn(venvPy, ["-m", "sitelens.server"], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, ...loadEnv(), STOA_DATA: dataDir, ...(args.has("--demo") ? { SITELENS_DEMO: "1" } : {}) },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));
