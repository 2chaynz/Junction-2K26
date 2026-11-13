# Agent instructions

Shared by Claude Code (via CLAUDE.md) and Codex. Edit this file, not CLAUDE.md.

## How to talk to us
- Short, concise, direct. Answer first.
- No preamble, no recap, no filler, no flattery.
- Bullets over paragraphs. Code over prose.
- If unsure, say so in one line. Ask only when blocked.

## Context
- Team of 4 at Junction 2026 (Helsinki, 13–15 Nov 2026). 48h hackathon.
- Final submission: 15 Nov 10:00 (UTC+2). Speed beats polish; a working demo beats completeness.

## Working together
- Pull before you start. Small commits, push often.
- One branch per person/feature; merge to `main` only when it runs.
- Never commit secrets. Use `.env` (gitignored).

## Commits
- Format: `type: summary` — types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`.
- Summary: imperative mood, lowercase, no period, ≤50 chars. E.g. `feat: add voice input to chat`.
- Body (optional): blank line, then why, wrapped at 72 chars.
- One logical change per commit.
- Author only. No `Co-Authored-By`, no AI/Claude/Anthropic/Codex/OpenAI attribution, no "Generated with" lines — in commits or PRs.

## Shared files (how agents coordinate)
Agents can't talk directly. The repo is the channel: pull, read, write, push.
- `ideas/<name>.md` — each person's ideas, from `ideas/TEMPLATE.md`.
- `DECISION.md` — chosen idea and scope. Source of truth.
- `TASKS.md` — owners and status. Update only your own rows.
- `CONTRACT.md` — interfaces between parts. Change only after telling the team.
