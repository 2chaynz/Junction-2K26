# Agent instructions

Shared by Claude Code (via CLAUDE.md) and Codex. Changes to this file go through a PR.

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
```
`<person>` = the human you work for (their git user name).

## Every session
**Start**
1. `node scripts/status.mjs show` (Claude Code runs it automatically).
2. A ticket of yours shows `PR #n merged` → `set Tn done`.
3. Read `DECISION.md`, `CONTRACT.md` and your `tickets/Tn.md`. Read `context/` if the ticket touches the challenge or partner tech.
4. No ticket → `next <area>` → `claim`. State in one line what you're on.

**During**
- A `[team] main changed` notice → read the changed files from `origin/main`. Decision, contract or rules changed → rebase before continuing.
- Claude Code gets the notice after every prompt and every tool call (60s throttle, per session). A clean local `main` fast-forwards by itself; feature branches never do, so rebase them yourself.
- Codex: run `show` before each new step; you get no automatic notices.

**End** (or after any meaningful step)
- `status.mjs set` your ticket. `status.mjs log` anything you decided, learned or abandoned.

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
4. Cross-review, one round, by the *other* tool (same tool in a fresh session if the other isn't installed):
   - Claude author: `gh pr diff <n> | codex exec "Review this PR diff. Blocking issues only: bugs, contract breaks, broken demo. First line exactly 'Cross-review: PASS' or 'Cross-review: BLOCKING'." -o review.md`
   - Codex author: `gh pr diff <n> | claude -p "<same prompt>" > review.md`
   - `gh pr comment <n> --body-file review.md`, then delete `review.md`.
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
_TBD once medium and stack are chosen: setup, build, flash/deploy, run, test._

## Commits
- Format: `type: summary` — types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`.
- Summary: imperative mood, lowercase, no period, ≤50 chars. E.g. `feat: add voice input to chat`.
- Body (optional): blank line, then why, wrapped at 72 chars.
- One logical change per commit. Never commit `TASKS.md` or `LOG.md` on a feature branch.
- Author only. No `Co-Authored-By`, no AI/Claude/Anthropic/Codex/OpenAI attribution, no "Generated with" lines — in commits or PRs.
- Never commit secrets. Use `.env` (gitignored).
