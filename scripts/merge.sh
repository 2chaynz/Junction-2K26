#!/usr/bin/env bash
# Merge a PR once it is safe: the latest cross-review is PASS for the current head commit,
# CI checks are green and there are no conflicts. The only way agents merge.
#   bash scripts/merge.sh <pr>
set -euo pipefail

PR="${1:?usage: merge.sh <pr>}"
fail() { echo "not merging PR #$PR: $*" >&2; exit 1; }

read -r STATE DRAFT MERGEABLE HEAD < <(gh pr view "$PR" --json state,isDraft,mergeable,headRefOid \
  --jq '"\(.state) \(.isDraft) \(.mergeable) \(.headRefOid)"')
[ "$STATE" = OPEN ] || fail "state is $STATE"
[ "$DRAFT" = false ] || fail "draft"
[ "$MERGEABLE" != CONFLICTING ] || fail "conflicts with main: rebase on origin/main and push"

# A review of an older commit doesn't count: re-run xreview.sh after every push.
REVIEW="$(gh pr view "$PR" --json comments \
  --jq '[.comments[] | select(.body | startswith("Cross-review:"))] | last | .body // ""')"
[ -n "$REVIEW" ] || fail "no cross-review: bash scripts/xreview.sh $PR"
case "$REVIEW" in "Cross-review: PASS"*) ;; *) fail "latest cross-review is not PASS";; esac
grep -q "Reviewed commit: $HEAD" <<<"$REVIEW" || fail "cross-review is for an older commit: re-run xreview.sh $PR"

# CI registers checks a few seconds after a push.
for _ in $(seq 12); do
  gh pr checks "$PR" 2>&1 | grep -q "no checks reported" || break
  sleep 5
done
gh pr checks "$PR" --watch --fail-fast >/dev/null || fail "checks failed: gh pr checks $PR"

gh pr merge "$PR" --merge --match-head-commit "$HEAD"
echo "merged PR #$PR"
