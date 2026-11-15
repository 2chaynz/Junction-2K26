"""Us vs a frontier model on the same drawings (T44). Writes web/public/versus.json for the Benchmark tab.

  GEMINI_API_KEY=... python -m eval.versus [--n 12]

Picks held-out (dev split) questions across sources, answers each with the Sindri router and with the
whole-sheet VLM (gemini by default), and stores both answers, their evidence boxes, the truth and the cost.
Precomputed so the demo never calls a paid API live.
"""
from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

from eval.score import grade, load_questions, source
from eval.split import split_of
from sitelens import data_root
from sitelens.paths import vlm
from sitelens.router import answer

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "versus.json"
PER_SOURCE = {"cubicasa5k": 6, "swiss_dwellings": 4, "opening_design": 2}


def _pick(n_total: int, seed: int) -> list[dict]:
    Q = [q for q in load_questions(data_root()) if split_of(q["path"]) == "dev" and q["type"] != "text"
         and q["question"][:4] in ("How ", "What", "On s")]
    rnd = random.Random(seed)
    out = []
    for src, n in PER_SOURCE.items():
        pool = [q for q in Q if source(q) == src]
        rnd.shuffle(pool)
        seen = set()
        for q in pool:
            if q["path"] in seen:
                continue
            seen.add(q["path"])
            out.append(q)
            if len(seen) == n:
                break
    return out[:n_total]


def _row(a, q, secs) -> dict:
    d = a.to_dict()
    return {"value": d["value"], "unit": d["unit"], "method": d["method"], "cost_eur": d["cost_eur"],
            "seconds": round(secs, 2), "evidence": [e["bbox"] for e in d["evidence"] if e.get("bbox")],
            "correct": grade(q, d["value"]), "trace": d["trace"][:3]}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=12)
    ap.add_argument("--backend", default="gemini")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args(argv)
    rows = []
    for q in _pick(a.n, a.seed):
        t = time.time()
        ours = answer(q["path"], q["question"])
        t_ours = time.time() - t
        t = time.time()
        with vlm.use_backend(a.backend):
            theirs = vlm.answer(q["path"], q["question"])
        t_vlm = time.time() - t
        row = {"path": q["path"], "source": source(q), "question": q["question"], "truth": q["answer"],
               "unit": q["unit"], "ours": _row(ours, q, t_ours),
               "vlm": _row(theirs, q, t_vlm) if theirs else None, "vlm_backend": a.backend}
        rows.append(row)
        print(f"{source(q)[:8]:8} truth {q['answer']!s:>8} | ours {row['ours']['value']!s:>8} {'✓' if row['ours']['correct'] else '✗'}"
              f" | vlm {(row['vlm'] or {}).get('value')!s:>8} {'✓' if row['vlm'] and row['vlm']['correct'] else '✗'}", flush=True)
    summ = {k: {"correct": sum(bool((r[k] or {}).get("correct")) for r in rows), "n": len(rows),
                "eur": round(sum((r[k] or {}).get("cost_eur", 0) for r in rows), 5)} for k in ("ours", "vlm")}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"summary": summ, "rows": rows}, ensure_ascii=False, indent=1), encoding="utf8")
    print(json.dumps(summ), "→", OUT)


if __name__ == "__main__":
    main()
