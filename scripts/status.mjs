#!/usr/bin/env node
// Ticket status and log live on main. This edits them through a temporary
// worktree so agents never switch branches, and retries if main moved.
//
//   node scripts/status.mjs show                         tickets, questions, log (from origin/main)
//   node scripts/status.mjs next [area]                  first claimable ticket
//   node scripts/status.mjs claim T3 <owner> [branch]    take a ticket (fails if taken)
//   node scripts/status.mjs set T3 <status> [--branch b] [--device d] [--q "question"]
//   node scripts/status.mjs add "<title>" [--area a] [--needs T1,T2] [--details file.md]
//   node scripts/status.mjs log "<text>"
//   node scripts/status.mjs publish <paths...>           push ideas/, context/, tickets/ files to main
//   node scripts/status.mjs watch [--force]              hook: notice when shared files change on main
//   node scripts/status.mjs beat [T3] "<doing now>"      heartbeat: what this agent is doing (ticket from branch)
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, cpSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const git = (args, opts) => sh("git", args, opts);
const root = git(["rev-parse", "--show-toplevel"]);
const STATUSES = ["todo", "doing", "blocked", "review", "done"];
const PUBLISHABLE = /^(ideas|context|tickets)\//;
const SHARED = /^(TASKS\.md|LOG\.md|DECISION\.md|CONTRACT\.md|AGENTS\.md|tickets\/|context\/)/;

const fail = (msg) => { console.error(msg); process.exit(1); };
const [cmd, ...rest] = process.argv.slice(2);
const flags = {}, pos = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) {
    const next = rest[i + 1];
    flags[rest[i].slice(2)] = next === undefined || next.startsWith("--") ? true : rest[++i];
  } else pos.push(rest[i]);
}

function fetchMain(timeout = 20000) {
  try { git(["fetch", "--quiet", "origin", "main"], { cwd: root, timeout }); return true; }
  catch { return false; }
}
const showFile = (path) => { try { return git(["show", `origin/main:${path}`], { cwd: root }); } catch { return ""; } };

// --- TASKS.md table ---------------------------------------------------------
function parseTable(md) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => /^\|\s*Ticket\s*\|/i.test(l));
  if (start < 0) fail("TASKS.md: ticket table not found.");
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const head = cells(lines[start]).map((h) => h.toLowerCase());
  let end = start + 2;
  while (end < lines.length && lines[end].trim().startsWith("|")) end++;
  const rows = lines.slice(start + 2, end).map((l) => {
    const c = cells(l);
    return Object.fromEntries(head.map((h, i) => [h, (c[i] ?? "").replace(/`/g, "")]));
  });
  return { lines, start, end, head, rows };
}
function renderTable(t) {
  const fmt = (r) => "| " + t.head.map((h) => String(r[h] ?? "").replace(/\|/g, "/").replace(/\n/g, " ")).join(" | ") + " |";
  return [...t.lines.slice(0, t.start + 2), ...t.rows.map(fmt), ...t.lines.slice(t.end)].join("\n");
}
const idOf = (r) => (r.ticket.match(/^(T\d+)\b/i) || [])[1]?.toUpperCase() || "";
const titleOf = (r) => r.ticket.replace(/^T\d+\s*/i, "");
const needsMet = (t, r) => (r.needs || "").split(/[,\s]+/).filter(Boolean)
  .every((n) => t.rows.find((x) => idOf(x) === n.toUpperCase())?.status === "done");
function findRow(t, id) {
  const r = t.rows.find((x) => idOf(x) === String(id).toUpperCase());
  if (!r) fail(`${id} not found in TASKS.md.`);
  return r;
}

// --- Commit to main via a temporary worktree ---------------------------------
function onMain(message, mutate) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    if (!fetchMain()) fail("Can't reach origin. Check network and `gh auth status`.");
    const dir = mkdtempSync(join(tmpdir(), "j26-status-"));
    try {
      git(["worktree", "add", "--quiet", "--detach", dir, "origin/main"], { cwd: root });
      mutate(dir);
      git(["add", "-A"], { cwd: dir });
      if (!git(["status", "--porcelain"], { cwd: dir })) { console.log("No change."); return; }
      git(["commit", "--quiet", "-m", message], { cwd: dir });
      try {
        git(["push", "--quiet", "origin", "HEAD:refs/heads/main"], { cwd: dir });
        console.log(`Pushed to main: ${message}`);
        return;
      } catch (e) {
        const err = String(e.stderr || e.message);
        if (!/non-fast-forward|fetch first|\[rejected\]|\[remote rejected\]|cannot lock ref/.test(err)) fail(err.trim());
        console.error(`main moved, retrying (${attempt}/4)`);
      }
    } finally {
      try { git(["worktree", "remove", "--force", dir], { cwd: root }); }
      catch { rmSync(dir, { recursive: true, force: true }); git(["worktree", "prune"], { cwd: root }); }
    }
  }
  fail("Could not push to main after 4 attempts.");
}
function editTasks(dir, fn) {
  const path = join(dir, "TASKS.md");
  const t = parseTable(readFileSync(path, "utf8"));
  fn(t);
  writeFileSync(path, renderTable(t));
}

// --- Remember what this clone has seen, for the watch hook -------------------
const stateFile = join(resolve(root, git(["rev-parse", "--git-common-dir"], { cwd: root })), "j26-watch.json");
const readState = () => { try { return JSON.parse(readFileSync(stateFile, "utf8")); } catch { return {}; } };
const writeState = (s) => { try { writeFileSync(stateFile, JSON.stringify(s)); } catch {} };
const mainHash = () => { try { return git(["rev-parse", "origin/main"], { cwd: root }); } catch { return ""; } };

// --- Heartbeats ---------------------------------------------------------------
// Kept on their own branch so beats never add history to main or trigger watch notices.
const BEATS = "beats";
const STALE_MIN = 15;
const AUTO_BEAT_MS = 5 * 60000;
const fetchBeats = (timeout = 15000) => {
  try { git(["fetch", "--quiet", "origin", `+refs/heads/${BEATS}:refs/remotes/origin/${BEATS}`], { cwd: root, timeout }); return true; }
  catch { return false; }
};
const readBeats = () => { try { return JSON.parse(git(["show", `origin/${BEATS}:beats.json`], { cwd: root })); } catch { return {}; } };
const branchTicket = () => {
  try { return (git(["branch", "--show-current"], { cwd: root }).match(/(?:^|\/)(T\d+)(?:-|$)/i) || [])[1]?.toUpperCase() || ""; }
  catch { return ""; }
};
const minsAgo = (iso) => Math.round((Date.now() - new Date(iso).getTime()) / 60000);
function pushBeat(id, text) {
  let who = "agent", branch = "";
  try { who = git(["config", "user.name"], { cwd: root }); } catch {}
  try { branch = git(["branch", "--show-current"], { cwd: root }); } catch {}
  const pipe = { cwd: root, stdio: ["pipe", "pipe", "pipe"] };
  for (let attempt = 1; attempt <= 4; attempt++) {
    fetchBeats();
    let parent = "";
    try { parent = git(["rev-parse", "--verify", "--quiet", `origin/${BEATS}`], { cwd: root }); } catch {}
    const beats = parent ? readBeats() : {};
    // Auto beats only prove liveness; keep the last text the agent wrote.
    beats[id] = { who, branch, text: text || beats[id]?.text || "", at: new Date().toISOString() };
    const blob = sh("git", ["hash-object", "-w", "--stdin"], { ...pipe, input: JSON.stringify(beats, null, 1) + "\n" });
    const tree = sh("git", ["mktree"], { ...pipe, input: `100644 blob ${blob}\tbeats.json\n` });
    const commit = git(["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", `beat ${id}`], { cwd: root });
    try { git(["push", "--quiet", "origin", `${commit}:refs/heads/${BEATS}`], { cwd: root, timeout: 20000 }); return true; }
    catch (e) { if (!/non-fast-forward|fetch first|rejected|cannot lock ref/.test(String(e.stderr || e.message))) return false; }
  }
  return false;
}

// --- Commands -----------------------------------------------------------------
const commands = {
  show() {
    const online = fetchMain();
    const hash = mainHash();
    writeState({ ...readState(), seen: hash, last: Date.now() });
    const md = showFile("TASKS.md");
    if (!/^\|\s*Ticket\s*\|/im.test(md)) return console.log(`main @ ${hash.slice(0, 7) || "?"}: no ticket table on origin/main yet. Push the repo setup first.`);
    const t = parseTable(md);
    if (online) fetchBeats();
    const beats = readBeats();
    console.log(`main @ ${hash.slice(0, 7)}${online ? "" : " (offline, last fetched)"}`);
    for (const r of t.rows) {
      const bits = [r.owner, r.branch, r.device].filter(Boolean).join(" · ");
      console.log(`${idOf(r).padEnd(4)} ${(r.status || "todo").padEnd(7)} ${titleOf(r)}${r.area ? ` [${r.area}]` : ""}${bits ? ` — ${bits}` : ""}`);
      if (r.question) console.log(`     Q: ${r.question}`);
      if (r.status === "doing") {
        const b = beats[idOf(r)];
        if (!b) console.log(`     no heartbeat yet`);
        else {
          const m = minsAgo(b.at);
          console.log(`     ${m > STALE_MIN ? "STALE " : ""}beat ${m}m ago${b.text ? `: ${b.text}` : ""}`);
        }
      }
      if (r.status === "review" && r.branch && online) {
        try {
          const merged = sh("gh", ["pr", "list", "--head", r.branch, "--state", "merged", "--json", "number", "--jq", ".[0].number"], { cwd: root, timeout: 15000 });
          if (merged) console.log(`     PR #${merged} merged → node scripts/status.mjs set ${idOf(r)} done`);
        } catch {}
      }
    }
    const log = showFile("LOG.md").split("\n").filter((l) => l.startsWith("- ")).slice(0, 8);
    if (log.length) console.log("\nLog:\n" + log.join("\n"));
  },

  next() {
    fetchMain();
    const t = parseTable(showFile("TASKS.md"));
    const area = pos[0];
    const r = t.rows.find((x) => (x.status || "todo") === "todo" && !x.owner && (!area || x.area === area) && needsMet(t, x));
    if (!r) return console.log(`No claimable ticket${area ? ` in ${area}` : ""}.`);
    console.log(`${idOf(r)} ${titleOf(r)}${existsSync(join(root, "tickets", idOf(r) + ".md")) ? `  (tickets/${idOf(r)}.md)` : ""}`);
  },

  claim() {
    const [id, owner, branch = ""] = pos;
    if (!id || !owner) fail("Usage: claim T3 <owner> [branch]");
    onMain(`chore: claim ${id.toUpperCase()}`, (dir) => editTasks(dir, (t) => {
      const r = findRow(t, id);
      if (r.owner && r.owner !== owner) fail(`${idOf(r)} is taken by ${r.owner} (${r.status}). Pick another: node scripts/status.mjs next`);
      if (!needsMet(t, r) && !flags.force) fail(`${idOf(r)} needs ${r.needs}, not done yet.`);
      Object.assign(r, { owner, status: "doing", branch: branch || r.branch });
    }));
    try { pushBeat(id.toUpperCase(), "claimed"); } catch {}
  },

  set() {
    const [id, status] = pos;
    if (!id || !STATUSES.includes(status)) fail(`Usage: set T3 <${STATUSES.join("|")}> [--branch b] [--device d] [--q "question"]`);
    onMain(`chore: set ${id.toUpperCase()} to ${status}`, (dir) => editTasks(dir, (t) => {
      const r = findRow(t, id);
      r.status = status;
      if (typeof flags.branch === "string") r.branch = flags.branch;
      if (typeof flags.device === "string") r.device = flags.device;
      if (typeof flags.q === "string") r.question = flags.q;
      else if (status !== "blocked") r.question = "";
    }));
  },

  add() {
    const [title] = pos;
    if (!title) fail('Usage: add "<title>" [--area a] [--needs T1,T2] [--details file.md]');
    const details = typeof flags.details === "string" ? resolve(flags.details) : "";
    if (details && !existsSync(details)) fail(`${flags.details} not found.`);
    let id = "";
    onMain(`chore: add ticket ${title.slice(0, 30)}`, (dir) => editTasks(dir, (t) => {
      id = "T" + (Math.max(0, ...t.rows.map((r) => Number(idOf(r).slice(1)) || 0)) + 1);
      t.rows.push({ ticket: `${id} ${title}`, area: flags.area || "", needs: flags.needs || "", status: "todo" });
      if (details) { mkdirSync(join(dir, "tickets"), { recursive: true }); cpSync(details, join(dir, "tickets", `${id}.md`)); }
    }));
    if (id) console.log(`Added ${id}`);
  },

  log() {
    const text = pos.join(" ");
    if (!text) fail('Usage: log "<text>"');
    let name = "agent";
    try { name = git(["config", "user.name"], { cwd: root }); } catch {}
    const when = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Helsinki" }).slice(0, 16);
    onMain(`docs: log ${text.slice(0, 40)}`, (dir) => {
      const path = join(dir, "LOG.md");
      const lines = readFileSync(path, "utf8").split("\n");
      const at = lines.findIndex((l) => l.startsWith("- "));
      lines.splice(at < 0 ? lines.length : at, 0, `- ${when} · ${name} · ${text}`);
      writeFileSync(path, lines.join("\n"));
    });
  },

  publish() {
    if (!pos.length) fail("Usage: publish <paths under ideas/, context/ or tickets/>");
    const rels = pos.map((p) => relative(root, resolve(p)).replace(/\\/g, "/"));
    for (const r of rels) {
      if (!PUBLISHABLE.test(r)) fail(`${r}: only ideas/, context/ and tickets/ can be published. Use a PR.`);
      if (!existsSync(join(root, r))) fail(`${r} not found.`);
    }
    onMain(`docs: update ${rels.join(", ").slice(0, 40)}`, (dir) => {
      for (const r of rels) { mkdirSync(dirname(join(dir, r)), { recursive: true }); cpSync(join(root, r), join(dir, r), { recursive: true }); }
    });
    // Local copies would block the next pull/rebase. Undo them only where main has identical content.
    git(["fetch", "--quiet", "origin", "main"], { cwd: root });
    const touched = git(["ls-files", "--others", "--modified", "--exclude-standard", "--", ...rels], { cwd: root }).split("\n").filter(Boolean);
    const tracked = new Set(git(["ls-files", "--", ...rels], { cwd: root }).split("\n").filter(Boolean));
    let undone = 0;
    for (const f of new Set(touched)) {
      try {
        if (git(["hash-object", f], { cwd: root }) !== git(["rev-parse", `origin/main:${f}`], { cwd: root })) continue;
        if (tracked.has(f)) git(["checkout", "HEAD", "--", f], { cwd: root }); else rmSync(join(root, f));
        undone++;
      } catch {}
    }
    if (undone) console.log(`${undone} local copy(s) undone; the content is on main. Pull or rebase to see it.`);
  },

  watch() {
    // Runs on every prompt and after every tool call: must be quiet, fast and never fail.
    // --post: emit PostToolUse JSON so the notice reaches the agent mid-run.
    try {
      let sid = "default";
      // Only hooks pipe JSON on stdin. Reading it otherwise would hang a manual or Codex run.
      if (flags.hook) try { sid = JSON.parse(readFileSync(0, "utf8")).session_id || sid; } catch {}
      const all = readState();
      const s = all[sid] || {};
      const save = (v) => writeState({ ...readState(), [sid]: v });
      const say = (text) => console.log(flags.post ? JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text } }) : text);
      if (!flags.force && Date.now() - (s.last || 0) < 60000) return;
      save({ ...s, last: Date.now() });
      if (!fetchMain(8000)) return;
      const now = mainHash();
      // Safe auto-pull: only a clean local main fast-forwards. Feature branches are left to the agent.
      try {
        if (git(["branch", "--show-current"], { cwd: root }) === "main" && !git(["status", "--porcelain"], { cwd: root }))
          git(["merge", "--ff-only", "--quiet", "origin/main"], { cwd: root });
      } catch {}
      if (!s.seen || s.seen === now) return save({ ...s, seen: now, last: Date.now() });
      const files = git(["diff", "--name-only", s.seen, now], { cwd: root }).split("\n").filter((f) => SHARED.test(f));
      save({ ...s, seen: now, last: Date.now() });
      if (!files.length) return;
      const subjects = git(["log", "--format=%s (%an)", "-5", `${s.seen}..${now}`], { cwd: root });
      const out = [`[team] main changed: ${files.join(", ")}\n${subjects}`];
      if (files.some((f) => /^(DECISION|CONTRACT|AGENTS)\.md$/.test(f)))
        out.push("[team] Decision, contract or rules changed. Read them from origin/main and rebase your branch before continuing.");
      else out.push("[team] Run `node scripts/status.mjs show` if it affects your ticket.");
      say(out.join("\n"));
    } catch {}
  },

  beat() {
    const id = /^T\d+$/i.test(pos[0] || "") ? pos.shift().toUpperCase() : branchTicket();
    if (flags.hook) {
      // Runs after every tool call: throttled, detached, silent, never fails.
      try {
        if (!id) return;
        const s = readState();
        const last = s.beats?.[id] || 0;
        if (Date.now() - last < AUTO_BEAT_MS) return;
        writeState({ ...s, beats: { ...s.beats, [id]: Date.now() } });
        spawn(process.execPath, [fileURLToPath(import.meta.url), "beat", id],
          { cwd: root, detached: true, stdio: "ignore", windowsHide: true }).unref();
      } catch {}
      return;
    }
    if (!id) fail('Usage: beat [T3] "<doing now>" (or run on a <person>/T<n>-slug branch)');
    const text = pos.join(" ").slice(0, 140);
    if (!pushBeat(id, text)) fail("Beat not pushed. Check network and `gh auth status`.");
    const s = readState();
    writeState({ ...s, beats: { ...s.beats, [id]: Date.now() } });
    console.log(`Beat ${id}${text ? `: ${text}` : ""}`);
  },
};

if (!commands[cmd]) fail(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 13).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
commands[cmd]();
