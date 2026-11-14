# Agent instructions

Shared by Claude Code (via CLAUDE.md) and Codex. Every rule here binds both equally. Hooks and permissions in `.claude/` are only a convenience for Claude Code: Codex follows the same rules by hand. Changes to this file go through a PR.

## How to talk to us
- Short, concise, direct. Answer first.
- No preamble, no recap, no filler, no flattery.
- Bullets over paragraphs. Code over prose.
- If unsure, say so in one line. Ask only when blocked.

## How to write (files, docs, code comments)
- Same rules as talking: short, direct, no filler.
- Docs and md files: bullets, short lines. Delete anything not needed.
- Code comments: only explain *why*, never *what*. One line if possible. No commented-out code.
- No emojis, no marketing tone, no restating the obvious.

## Context
- Team of 4 at Junction 2026 (Espoo, 13–15 Nov 2026). 48h hackathon.
- Deadlines (UTC+2): idea Fri 21:00 · preliminary submission Fri 23:55 · feature freeze Sat 22:00 · final Sun 10:00.
- Speed beats polish. A working demo beats completeness.
- Medium not decided: hardware, software or both. Don't assume web. Follow `DECISION.md` once set.
- Agents do the work. Humans decide the idea, merge PRs, answer questions and handle hardware.

## Repo map
| Path | Purpose | How it changes |
|---|---|---|
| `DECISION.md` | Chosen idea, scope, demo flow. Source of truth. | PR |
| `CONTRACT.md` | Interfaces between parts (API, serial, BLE, MQTT…), pinouts, config. | PR, tell the team |
| `TASKS.md` | Ticket table: area, needs, owner, status, question. | `status.mjs` only, straight to main |
| `tickets/Tn.md` | Ticket details (from `tickets/TEMPLATE.md`). | `status.mjs add/publish`, straight to main |
| `LOG.md` | Decisions, dead ends, learnings. Newest first. | `status.mjs log`, straight to main |
| `context/` | Challenge briefs, judging criteria, partner docs. | `status.mjs publish`, straight to main |
| `ideas/` | Per-person ideas from `ideas/TEMPLATE.md`. | `status.mjs publish`, straight to main |
| `scripts/check.sh` | Build/compile + tests + smoke run. Must pass before a PR. | PR |
| `board/` | Live progress page for humans. | PR |
| Everything else (code, config, rules) | | PR |

## What goes to main without a PR
Only `TASKS.md`, `LOG.md`, `tickets/`, `ideas/`, `context/`, and only through `node scripts/status.mjs`.
`.githooks/pre-push` blocks any other direct push to main. Never bypass it (`--no-verify`, `ALLOW_MAIN_PUSH`, changing `core.hooksPath`). Never force-push. Never merge PRs: humans do that.

## Status commands
```
node scripts/status.mjs show                        # current tickets, questions, log
node scripts/status.mjs next [area]                 # first claimable ticket
node scripts/status.mjs claim T3 <person> <branch>  # take it; fails if taken → run next
node scripts/status.mjs set T3 <status> [--q "..."] [--branch b] [--device d]
node scripts/status.mjs add "<title>" --area a --needs T1 --details path.md
node scripts/status.mjs log "<one line>"
node scripts/status.mjs publish ideas/<name>.md context/...
node scripts/status.mjs beat [T3] "<doing now>"     # heartbeat; ticket defaults to your branch's Tn
node scripts/status.mjs close-merged                # review tickets with a merged PR → done (also automatic)
```
`<person>` = the human you work for (their git user name).

## Every session
**Start**
1. `node scripts/status.mjs show` (Claude Code runs it automatically).
2. Merged PRs close their `review` ticket automatically (GitHub Action on merge; `show` as fallback). Still shows `PR #n merged` → `set Tn done`.
3. Read `DECISION.md`, `CONTRACT.md` and your `tickets/Tn.md`. Read `context/` if the ticket touches the challenge or partner tech.
4. No ticket → `next <area>` → `claim`. State in one line what you're on.

**During**
- A `[team] main changed` notice → read the changed files from `origin/main`. Decision, contract or rules changed → rebase before continuing.
- All agents (Claude Code and Codex): before each new step run `node scripts/status.mjs watch --force`. It prints `[team] main changed` if main moved since you last looked. Silent means nothing new.
- Claude Code does this by hook after every prompt and tool call, so it needs no manual run. Codex has no hooks, so it must run it.
- A clean local `main` fast-forwards inside `watch`. Feature branches never do: rebase them yourself.
- Heartbeat: `status.mjs beat "<what you're doing now>"` whenever your focus changes (one line, ≤140 chars). The board flags a `doing` ticket silent for 15 min as stale.
- Claude Code also beats by hook every 5 min (keeps your last text). Codex must beat by hand at least every 10 min.

**End** (or after any meaningful step)
- `status.mjs set` your ticket. `status.mjs log` anything you decided, learned or abandoned.

## Worker loop
Default mode for every agent: keep pulling work until the queue is empty. Claude Code: `/work`, or `/loop /work` to repeat.
1. `show` (it closes merged `review` tickets itself).
2. Own a `doing` ticket → continue it. Else `next <area>` → `claim` → create the branch (worktree if you're the second agent).
3. Work inside the ticket's **Files**. `beat` as you go.
4. Pull requests steps 1–6 → `set Tn review`, `log` the outcome in one line.
5. Back to 1. Nothing claimable → `log "idle: <area> queue empty"` and stop. A human or the planner adds tickets.
- Stale ticket (silent >30 min, owner not answering) → ask that person before taking it over. Never take over a ticket with an open PR.

## Planner
One agent, run by one human, keeps the queue full. It edits tickets only, never code.
- After each merge (or about every hour): read `DECISION.md`, `show`, open PRs.
- Keep 2–3 claimable `todo` tickets per active area, with `--needs` and disjoint **Files**.
- Answer `blocked` questions it can from the repo; leave the rest for humans.

## Tickets
- Only work on a claimed ticket. Stay inside its **Files**. Need something outside → add a ticket or ask.
- Branch: `<person>/T<n>-<slug>`. One branch per ticket. Max 2 agents per person; the second one uses its own `git worktree`.
- Blocked → `set Tn blocked --q "question for @person"`, then claim another ticket while you wait.
- Hardware: you can't see the device. Make it compile, write exact human steps and what they should see in the PR, set `review`. A human confirms.
- Physical devices are shared: record them with `--device` before flashing or rewiring. Wiring changes go in `CONTRACT.md` (PR).

## Planning (once DECISION.md is merged)
1. One agent fills `CONTRACT.md` first (PR, human merges).
2. Then it splits the work into tickets: `status.mjs add` each, with `--area`, `--needs` and a `tickets/Tn.md` detail file. Tickets must not overlap in **Files**.
3. `status.mjs log "plan: N tickets, areas …"`. A human glances at the board.

## Pull requests
1. Commit on your branch. `git fetch origin && git rebase origin/main`.
2. `bash scripts/check.sh` must pass.
3. `git push -u origin HEAD`. Fill `.github/pull_request_template.md` into `pr.md`, then `gh pr create --title "T<n>: <summary>" --body-file pr.md` and delete `pr.md`.
4. Cross-review, one round, by the *other* tool: `bash scripts/xreview.sh <n>` (Claude author) or `bash scripts/xreview.sh <n> --author codex`. It posts the comment.
   - Codex from the ChatGPT desktop app is not on PATH; the script finds it (`--which` shows where). Don't conclude Codex is missing from `which codex` alone.
   - Falls back to a fresh Claude session only when no Codex binary exists.
5. BLOCKING → fix, push, comment what you fixed. No second review round unless a human asks.
6. `status.mjs set Tn review`. A human merges.

## Codex setup
Codex's default sandbox has no network, so `git push`, `gh` and `status.mjs` fail. In `~/.codex/config.toml`:
```
sandbox_mode = "workspace-write"
[sandbox_workspace_write]
network_access = true
```

## Run
Python 3.11+, Node 18+. Dataset stays outside the repo.
```
# demo on http://localhost:8000: sets up venv, dataset, web build, then serves (any OS)
node scripts/dev.mjs            # --check: list what's missing; STOA_DATA overrides the data path

# manual steps
# once
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # (Linux/mac: .venv/bin/pip)
curl -LO https://fwjydgxpttajiqpfmqtj.supabase.co/storage/v1/object/public/stoa-junction-2026/junction-dataset-preview.zip
unzip junction-dataset-preview.zip -d ../junction-data/preview
export STOA_DATA=../junction-data/preview/junction-dataset-preview

# use
python -m sitelens.router data/ifc_models/bsc-esplanades_1807-ep-ar-v18.ifc "What is the net floor area of the room 'KORIDOR (119)' on '1.korrus', in m²?"
python -m eval.score                      # dev split, prints accuracy / evidence / €-per-answer
python -m eval.score --source swiss_dwellings --split all
bash scripts/check.sh                     # merge gate (PYTHON=.venv/Scripts/python on Windows)
```
New solver path: add `sitelens/paths/<name>.py` with `answer(path, question) -> Answer | None` (see `CONTRACT.md`).

## Commits
- Format: `type: summary` — types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`.
- Summary: imperative mood, lowercase, no period, ≤50 chars. E.g. `feat: add voice input to chat`.
- Body (optional): blank line, then why, wrapped at 72 chars.
- One logical change per commit. Never commit `TASKS.md` or `LOG.md` on a feature branch.
- Author only. No `Co-Authored-By`, no AI/Claude/Anthropic/Codex/OpenAI attribution, no "Generated with" lines — in commits or PRs.
- Never commit secrets. Use `.env` (gitignored).
