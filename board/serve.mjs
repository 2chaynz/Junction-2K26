// Team board: serves board/index.html and the repo state from origin/main.
// Usage: node board/serve.mjs [--lan] [--local] [--port 8787]
// --local reads your HEAD instead of origin/main (offline or before pushing).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const args = process.argv.slice(2);
const lan = args.includes("--lan");
const local = args.includes("--local");
const port = Number(args[args.indexOf("--port") + 1]) || 8787;
const SEP = "\x1f";

let lastFetch = 0;
let fetchError = null;
let prs = null;
let prError = null;

const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", GH_PROMPT_DISABLED: "1" };
const git = async (...a) => (await run("git", a, { cwd: repo, env, maxBuffer: 4e6 })).stdout;

async function loadPrs() {
  try {
    const out = (await run("gh", ["pr", "list", "--state", "open", "--limit", "30",
      "--json", "number,title,author,headRefName,updatedAt,url,isDraft,comments"], { cwd: repo, env, maxBuffer: 8e6 })).stdout;
    prs = JSON.parse(out).map((p) => {
      const first = ([...p.comments].reverse().find((c) => /^\s*Cross-review:/i.test(c.body))?.body || "").split("\n")[0];
      const review = !first ? "none" : /BLOCKING/i.test(first) ? "blocking" : /PASS/i.test(first) ? "pass" : "posted";
      return { number: p.number, title: p.title, author: p.author?.login || "", branch: p.headRefName, updatedAt: p.updatedAt, url: p.url, draft: p.isDraft, review };
    });
    prError = null;
  } catch {
    prError = "Couldn't load pull requests. Check gh auth status.";
  }
}
const tryGit = (...a) => git(...a).catch(() => "");

async function state() {
  // Throttled so many open tabs don't hammer GitHub.
  if (Date.now() - lastFetch > 20_000) {
    lastFetch = Date.now();
    try { await git("fetch", "--quiet", "--prune", "origin"); fetchError = null; }
    catch (e) { fetchError = String(e.stderr || e.message).trim().split("\n")[0]; }
    await loadPrs();
  }
  const hasRemote = (await tryGit("rev-parse", "--verify", "--quiet", "origin/main")).trim();
  const ref = local || !hasRemote ? "HEAD" : "origin/main";
  const file = (p) => tryGit("show", `${ref}:${p}`);
  const [tasks, log, decision, commits, branches] = await Promise.all([
    file("TASKS.md"),
    file("LOG.md"),
    file("DECISION.md"),
    tryGit("log", ref, "-12", `--format=%h${SEP}%an${SEP}%aI${SEP}%s`),
    tryGit("for-each-ref", "--sort=-committerdate", "--count=12",
      `--format=%(refname:short)${SEP}%(authorname)${SEP}%(committerdate:iso-strict)${SEP}%(subject)`, "refs/remotes/origin"),
  ]);
  const rows = (s) => s.split("\n").filter(Boolean).map((l) => l.split(SEP));
  return {
    ref, fetchedAt: lastFetch, fetchError, tasks, log, decision, prs, prError,
    commits: rows(commits).map(([hash, author, date, subject]) => ({ hash, author, date, subject })),
    branches: rows(branches)
      .filter(([name]) => name !== "origin/HEAD" && name !== "origin")
      .map(([name, author, date, subject]) => ({ name: name.replace(/^origin\//, ""), author, date, subject })),
  };
}

createServer(async (req, res) => {
  try {
    if (req.url === "/api/state") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify(await state()));
    }
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(await readFile(join(here, "index.html")));
    }
    res.writeHead(404).end();
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" }).end(String(e));
  }
}).listen(port, lan ? "0.0.0.0" : "127.0.0.1", () => {
  console.log(`board: http://localhost:${port}${lan ? "  (LAN: use this laptop's IP)" : ""}`);
});
