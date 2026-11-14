#!/usr/bin/env bash
# Cross-review a PR with the *other* tool (or a fresh session of the same one if the other is
# missing) and post the result as a PR comment.
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
case "$AUTHOR" in claude|codex) ;; *) echo "--author must be claude or codex" >&2; exit 1;; esac

# merge.sh only accepts a review of the current head commit.
SHA="$(gh pr view "$PR" --json headRefOid --jq .headRefOid)"
out="$(mktemp)"
trap 'rm -f "$out"' EXIT
CODEX="$(find_codex || true)"
have() {
  case "$1" in
    codex) [ -n "$CODEX" ] ;;
    claude) command -v claude >/dev/null 2>&1 ;;
  esac
}
# Prefer the other tool; teammates with only one tool fall back to a fresh session of it.
OTHER=codex; [ "$AUTHOR" = codex ] && OTHER=claude
if have "$OTHER"; then REVIEWER="$OTHER"
elif have "$AUTHOR"; then
  REVIEWER="$AUTHOR"
  echo "no $OTHER found; reviewing with a fresh $AUTHOR session" >&2
else
  echo "neither codex nor claude found: install one, or ask a teammate to run xreview.sh $PR" >&2
  exit 1
fi

if [ "$REVIEWER" = codex ]; then
  echo "reviewer: codex ($CODEX)"
  { echo "$PROMPT"; echo; gh pr diff "$PR"; } | "$CODEX" exec - -o "$out" >/dev/null || true
else
  echo "reviewer: claude"
  { echo "$PROMPT"; echo; gh pr diff "$PR"; } | claude -p > "$out" || true
fi

if [ ! -s "$out" ]; then
  echo "$REVIEWER returned nothing: probably logged out. Run '$REVIEWER' once to log in, or ask a teammate to run xreview.sh $PR" >&2
  exit 1
fi
head -1 "$out"
grep -qE '^Cross-review: (PASS|BLOCKING)' "$out" || { echo "review output malformed, not posting" >&2; cat "$out" >&2; exit 1; }
printf '\n\nReviewer: %s\nReviewed commit: %s\n' "$REVIEWER" "$SHA" >> "$out"
gh pr comment "$PR" --body-file "$out" >/dev/null
echo "posted on PR #$PR"
