// Claude Code hooks entry: runs origin/main's status.mjs so fixes reach every agent without a rebase.
// Falls back to this branch's copy when origin/main has none (offline first run, fresh repo).
//   node scripts/hook.mjs <status.mjs args...>
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const git = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1e7 });
let script = join(dirname(fileURLToPath(import.meta.url)), "status.mjs");
try {
  const src = git(["show", "origin/main:scripts/status.mjs"]);
  // Git dir, not the work tree: shared by worktrees and never committed.
  const dir = join(resolve(git(["rev-parse", "--git-common-dir"]).trim()), "j26-hooks");
  const target = join(dir, "status.mjs");
  if (!existsSync(target) || readFileSync(target, "utf8") !== src) {
    mkdirSync(dir, { recursive: true });
    // Parallel hooks may write at once; rename keeps readers from seeing a half-written file.
    const tmp = `${target}.${process.pid}.tmp`;
    writeFileSync(tmp, src);
    renameSync(tmp, target);
  }
  script = target;
} catch {}
const r = spawnSync(process.execPath, [script, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
