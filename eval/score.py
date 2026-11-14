"""Score any solver against the dataset's answer key. See CONTRACT.md → Scorer.

  python -m eval.score                         # router on the dev split
  python -m eval.score --split test            # CubiCasa5K official test plans
  python -m eval.score --split all --source swiss_dwellings --limit 200
  python -m eval.score --solver mymodule:answer --name gemini-baseline

Writes eval/results/<name>.jsonl (one line per question) and prints a table per source × type.
Grading (dataset README): counts exact; area/length/volume within 2%; text is not auto-graded.
"""
from __future__ import annotations

import argparse
import collections
import importlib
import json
import sys
import time
import traceback
from pathlib import Path

from .split import in_split

TOL = 0.02


def grade(q: dict, value) -> bool | None:
    """True/False, or None when not auto-gradable (text)."""
    if q["type"] == "text":
        return None
    if value is None:
        return False
    try:
        v, a = float(value), float(q["answer"])
    except (TypeError, ValueError):
        return False
    if q["type"] == "count":
        return round(v) == round(a) and abs(v - round(v)) < 1e-6
    return abs(v - a) <= TOL * abs(a) if a else abs(v) < 1e-9


def load_questions(root: Path) -> list[dict]:
    with open(root / "questions.jsonl", encoding="utf8") as f:
        return [json.loads(line) for line in f]


def source(q: dict) -> str:
    return q["path"].split("/")[1]


def main(argv=None) -> int:
    from sitelens import data_root
    ap = argparse.ArgumentParser()
    ap.add_argument("--solver", default="sitelens.router:answer", help="module:function(path, question) -> Answer")
    ap.add_argument("--split", default="dev", choices=["dev", "test", "all"])
    ap.add_argument("--source", help="only this source, e.g. ifc_models")
    ap.add_argument("--type", help="only this question type, e.g. count")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--name", help="results file name (default: solver name)")
    a = ap.parse_args(argv)

    mod, fn = a.solver.split(":")
    solve = getattr(importlib.import_module(mod), fn)
    Q = [q for q in load_questions(data_root())
         if in_split(q["path"], a.split)
         and (not a.source or source(q) == a.source) and (not a.type or q["type"] == a.type)]
    if a.limit:
        Q = Q[: a.limit]

    out_dir = Path(__file__).parent / "results"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"{a.name or mod.rsplit('.', 1)[-1]}.jsonl"
    stats = collections.defaultdict(lambda: collections.Counter())
    t0 = time.time()
    with open(out, "w", encoding="utf8") as f:
        for i, q in enumerate(Q):
            try:
                ans = solve(q["path"], q["question"]).to_dict()
            except Exception as e:  # a crashing solver is a wrong answer, not a crashed run
                ans = {"value": None, "method": "error", "cost_eur": 0, "evidence": [], "trace": [repr(e)]}
                if i < 3:
                    traceback.print_exc()
            g = grade(q, ans["value"])
            k = (source(q), q["type"])
            stats[k]["n"] += 1
            stats[k]["answered"] += ans["value"] is not None
            stats[k]["ok"] += bool(g)
            stats[k]["graded"] += g is not None
            stats[k]["evidence"] += bool(ans.get("evidence"))
            stats[k]["cost_micro"] += int(ans.get("cost_eur", 0) * 1e6)
            f.write(json.dumps({"q": q, "a": ans, "correct": g}, ensure_ascii=False) + "\n")
            if (i + 1) % 200 == 0:
                print(f"  {i + 1}/{len(Q)}", file=sys.stderr)

    tot = collections.Counter()
    print(f"\n{'source':16} {'type':7} {'n':>5} {'answered':>9} {'correct':>8} {'acc':>6} {'evid':>5} {'€/ans':>8}")
    for (s, t), c in sorted(stats.items()):
        tot.update(c)
        acc = c["ok"] / c["graded"] if c["graded"] else float("nan")
        print(f"{s:16} {t:7} {c['n']:5} {c['answered']:9} {c['ok']:8} {acc:6.1%} {c['evidence']:5} "
              f"{c['cost_micro'] / 1e6 / c['n']:8.5f}")
    acc = tot["ok"] / tot["graded"] if tot["graded"] else 0
    print(f"{'TOTAL':24} {tot['n']:5} {tot['answered']:9} {tot['ok']:8} {acc:6.1%} {tot['evidence']:5} "
          f"{tot['cost_micro'] / 1e6 / max(tot['n'], 1):8.5f}")
    print(f"\n{time.time() - t0:.0f}s · details: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
