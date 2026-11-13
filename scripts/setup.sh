#!/usr/bin/env bash
# One-time setup per clone. Safe to re-run.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
fail=0
ok()   { echo "ok    $1"; }
miss() { echo "FIX   $1"; fail=1; }
note() { echo "note  $1"; }

git config core.hooksPath .githooks && ok "git hooks on (.githooks/pre-push guards main)"
git config pull.rebase true && ok "git pull rebases"

if command -v node >/dev/null; then ok "node $(node --version)"; else miss "node missing: install Node 18+"; fi
if command -v gh >/dev/null; then
  if gh auth status >/dev/null 2>&1; then ok "gh logged in"; else miss "gh not logged in: run  gh auth login"; fi
else miss "gh missing: install GitHub CLI (https://cli.github.com)"; fi
if [ -n "$(git config user.name)" ]; then ok "git user: $(git config user.name)"; else miss "git user.name not set"; fi
if command -v claude >/dev/null; then ok "claude found"; else note "claude missing: Codex PRs will be reviewed by codex instead"; fi
if command -v codex >/dev/null; then ok "codex found"; else note "codex missing: Claude PRs will be reviewed by claude instead"; fi

[ $fail -eq 0 ] && echo "Ready." || echo "Fix the FIX lines, then re-run."
exit $fail
