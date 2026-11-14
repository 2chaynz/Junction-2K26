#!/usr/bin/env bash
# Cross-review a PR with the *other* tool and post the result as a PR comment.
#   bash scripts/xreview.sh <pr> [--author claude|codex]   # default author: claude → Codex reviews
#   bash scripts/xreview.sh --which                         # print the Codex binary it would use
# Codex installed with the ChatGPT desktop app is not on PATH, so look in its app folders too.
set -euo pipefail

PROMPT="Review this PR diff. Blocking issues only: bugs, contract breaks, broken demo. First line exactly 'Cross-review: PASS' or 'Cross-review: BLOCKING'."

find_codex() {
  if [ -n "${CODEX_BIN:-}" ] && [ -x "$CODEX_BIN" ]; then echo "$CODEX_BIN"; return; fi
  if command -v codex >/dev/null 2>&1; then command -v codex; return; fi
  local la="${LOCALAPPDATA:-$HOME/AppData/Local}"
  la="$(cygpath -u "$la" 2>/dev/null || echo "$la")"
  local c
  # newest first: the app keeps old versions in sibling hash folders
  for c in $(ls -t "$la"/OpenAI/Codex/bin/*/codex.exe 2>/dev/null) \
           "$HOME/.codex/plugins/.plugin-appserver/codex.exe" \
           /Applications/Codex.app/Contents/Resources/codex \
           /Applications/ChatGPT.app/Contents/Resources/codex; do
    [ -x "$c" ] && { echo "$c"; return; }
  done
  return 1
}

if [ "${1:-}" = "--which" ]; then
  find_codex || { echo "no codex binary found" >&2; exit 1; }
  exit 0
fi

PR="${1:?usage: xreview.sh <pr> [--author claude|codex]}"
AUTHOR=claude
[ "${2:-}" = "--author" ] && AUTHOR="${3:?claude or codex}"

# merge.sh only accepts a review of the current head commit.
SHA="$(gh pr view "$PR" --json headRefOid --jq .headRefOid)"
out="$(mktemp)"
trap 'rm -f "$out"' EXIT
if [ "$AUTHOR" = claude ] && CODEX="$(find_codex)"; then
  echo "reviewer: codex ($CODEX)"
  { echo "$PROMPT"; echo; gh pr diff "$PR"; } | "$CODEX" exec - -o "$out" >/dev/null
elif command -v claude >/dev/null 2>&1; then
  [ "$AUTHOR" = claude ] && echo "no codex binary found; reviewing with a fresh claude session" >&2
  echo "reviewer: claude"
  { echo "$PROMPT"; echo; gh pr diff "$PR"; } | claude -p > "$out"
else
  echo "neither codex nor claude found" >&2
  exit 1
fi

head -1 "$out"
grep -qE '^Cross-review: (PASS|BLOCKING)' "$out" || { echo "review output malformed, not posting" >&2; cat "$out" >&2; exit 1; }
printf '

Reviewed commit: %s
' "$SHA" >> "$out"
gh pr comment "$PR" --body-file "$out" >/dev/null
echo "posted on PR #$PR"
