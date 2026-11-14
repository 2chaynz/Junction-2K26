#!/usr/bin/env bash
# Merge gate: must pass before anything lands on main. Needs no dataset.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

PY="${PYTHON:-python}"
"$PY" -m compileall -q sitelens eval train
"$PY" -m eval.selftest
# Smoke run on real data when it's available locally (skipped in a fresh clone).
if [ -n "${STOA_DATA:-}" ] && [ -f "$STOA_DATA/questions.jsonl" ]; then
  "$PY" -m eval.score --source ifc_models --limit 20 --name check >/dev/null && echo "smoke score ok"
fi
echo "check ok"
