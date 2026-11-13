# Agent instructions

Shared by Claude Code (via CLAUDE.md) and Codex. Edit this file, not CLAUDE.md.

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
- Deadlines (UTC+2): idea Fri 21:00 · preliminary submission Fri 23:55 · feature freeze Sat night · final Sun 10:00.
- Speed beats polish. A working demo beats completeness.
- Medium not decided: hardware, software or both. Don't assume web. Follow `DECISION.md` once set.

## Repo map
| File | Purpose | Who edits |
|---|---|---|
| `DECISION.md` | Chosen idea, scope, demo flow. Source of truth. | Team, after agreement |
| `CONTRACT.md` | Interfaces between parts (API, serial, BLE, MQTT…), pinouts, config. | Anyone, after telling the team |
| `TASKS.md` | Ticket queue: owner + status. | Owner of each row only |
| `LOG.md` | Decisions, dead ends, learnings. Newest first. | Anyone, append at top |
| `context/` | Challenge briefs, judging criteria, partner docs. | Anyone; read-only facts |
| `ideas/` | Per-person ideas from `ideas/TEMPLATE.md`. | Owner of each file |
| `scripts/check.sh` | Build/compile + tests + smoke run. Must pass before merge. | Integrator |

## Every session
**Start**
1. `git pull --rebase --autostash`.
2. Read `DECISION.md`, `TASKS.md`, `CONTRACT.md`, top 15 lines of `LOG.md`.
3. Read `context/` if the task touches the challenge or partner tech.
4. State in one line which ticket you're on.

**End** (or after any meaningful step)
1. Update your row in `TASKS.md`.
2. Add a one-line entry to the top of `LOG.md` if you decided, learned or abandoned something.
3. Commit, `git pull --rebase`, push.

## Tickets (how work flows)
- Only work on a ticket in `TASKS.md`. No ticket → add one, then start.
- Ticket must have: goal, files you may touch, done-when, how to verify.
- Stay inside the ticket's files. Need to change `CONTRACT.md` or another area → stop, tell the human.
- Done = `scripts/check.sh` passes + verification step done. Then status `review`.
- Hardware: you can't see the device. Make it compile, then give the human exact steps and what they should observe. Done only after they confirm.

## Parallel work
- One branch per ticket: `<name>/<short-ticket>`. Max 2 agents per person.
- Running 2 agents locally → use separate git worktrees.
- Review: Codex reviews Claude's diffs and vice versa before merge.
- Only the integrator merges to `main`. `main` must always build and demo.
- Physical devices are shared: claim one in `TASKS.md` before flashing or rewiring. Record wiring changes in `CONTRACT.md`.

## Run
_TBD once medium and stack are chosen: setup, build, flash/deploy, run, test._

## Commits
- Format: `type: summary` — types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`.
- Summary: imperative mood, lowercase, no period, ≤50 chars. E.g. `feat: add voice input to chat`.
- Body (optional): blank line, then why, wrapped at 72 chars.
- One logical change per commit.
- Author only. No `Co-Authored-By`, no AI/Claude/Anthropic/Codex/OpenAI attribution, no "Generated with" lines — in commits or PRs.
- Never commit secrets. Use `.env` (gitignored).
