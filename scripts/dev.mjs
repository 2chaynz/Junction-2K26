#!/usr/bin/env node
// One command to run the demo on http://localhost:8000. Safe to re-run: finished steps are skipped.
//   node scripts/dev.mjs            set up whatever is missing, then serve
//   node scripts/dev.mjs --check    only report what is missing
//   node scripts/dev.mjs --no-build skip the web build
import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "web");
const win = process.platform === "win32";
const args = new Set(process.argv.slice(2));
const ZIP_URL =
  "https://fwjydgxpttajiqpfmqtj.supabase.co/storage/v1/object/public/stoa-junction-2026/junction-dataset-preview.zip";
const DEFAULT_DATA = resolve(ROOT, "..", "junction-data", "preview", "junction-dataset-preview");

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
const dataDir = resolve(process.env.STOA_DATA || loadEnv().STOA_DATA || DEFAULT_DATA);
// stamp is written only after pip succeeds, so an interrupted install is retried
const depsStamp = join(ROOT, ".venv", ".deps-ok");
const reqFile = join(ROOT, "requirements.txt");
const needVenv =
  !existsSync(venvPy) || !existsSync(depsStamp) || statSync(reqFile).mtimeMs > statSync(depsStamp).mtimeMs;
const needData = !existsSync(join(dataDir, "questions.jsonl"));
const distIndex = join(WEB, "dist", "index.html");
const needBuild =
  !args.has("--no-build") &&
  (!existsSync(distIndex) ||
    newest(join(WEB, "src")) > statSync(distIndex).mtimeMs ||
    statSync(join(WEB, "package.json")).mtimeMs > statSync(distIndex).mtimeMs);

if (args.has("--check")) {
  console.log(`venv:    ${needVenv ? "missing or deps not installed" : "ok"}`);
  console.log(`dataset: ${needData ? "MISSING" : "ok"}  (${dataDir})`);
  console.log(`web/dist: ${needBuild ? "missing or stale" : "ok"}`);
  process.exit(needVenv || needData || needBuild ? 1 : 0);
}

if (!ok("node", ["--version"])) die("node missing: install Node 18+");

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

if (needData) {
  if (args.has("--no-download")) die(`dataset not found at ${dataDir}. Set STOA_DATA or drop --no-download`);
  const parent = dirname(dataDir);
  const zip = join(dirname(parent), "junction-dataset-preview.zip");
  log(`downloading dataset to ${zip}`);
  mkdirSync(parent, { recursive: true });
  const res = await fetch(ZIP_URL);
  if (!res.ok) die(`download failed: HTTP ${res.status}`);
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  log(`extracting to ${parent}`);
  // Windows ships bsdtar, which reads zip; elsewhere use unzip
  const x = win ? run("tar", ["-xf", zip, "-C", parent]) : run("unzip", ["-q", "-o", zip, "-d", parent]);
  if (x.status !== 0 || !existsSync(join(dataDir, "questions.jsonl")))
    die(`extract failed. Unzip ${zip} into ${parent} by hand`);
}

if (needBuild) {
  if (!existsSync(join(WEB, "node_modules"))) {
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
  env: { ...process.env, ...loadEnv(), STOA_DATA: dataDir },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));
