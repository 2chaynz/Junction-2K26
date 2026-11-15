"""Score the detector path on AECV-Bench object counting (120 plans) next to its published VLM results.

AECV_DATA = clone of https://github.com/AECFoundry/AECV-Bench (no licence: evaluate only, never commit its images).
    python -m eval.aecv [--limit n] [--write]   # --write updates eval/aecv_report.md
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import time
from datetime import date
from pathlib import Path

PLANS = "data/Use Case 1 - Object Counting/1 - Full Datasets"
VLM = "benchmark_result_object_counting"
CLASSES = ("Door", "Window", "Space", "Bedroom", "Toilet")
VLM_ROWS = {  # file stem → label; the frontier + track models we compare against
    "gemini_35_flash": "Gemini 3.5 Flash",
    "gemini_31_pro": "Gemini 3.1 Pro",
    "claude_fable_5": "Claude Fable 5",
    "openai_gpt_55": "GPT-5.5",
    "gemma_4_31b_it": "Gemma 4 31B",
}
QUESTIONS = {
    "Door": "How many doors are shown on this floor plan?",
    "Window": "How many windows are shown on this floor plan?",
    "Bedroom": "How many bedrooms are shown on this floor plan?",
    "Toilet": "How many toilets are shown on this floor plan?",
}
ROOMS = ("room_bedroom", "room_bath", "room_kitchen", "room_sauna", "room_outdoor", "room_wc", "room_living",
         "room_entry", "room_storage", "room_utility", "room_garage")
EUR_PER_ANSWER = 0.00001
REPORT = Path(__file__).with_name("aecv_report.md")


def _ours(png: Path) -> dict:
    from sitelens.paths import detector
    p = str(png)  # absolute: data_root() / p resolves to p
    out = {k: detector.answer(p, q).value for k, q in QUESTIONS.items()}
    # no "space" question in Stoa: count every room box at the path's default threshold
    hits = [c for c, conf, _ in detector.detect(p) if conf >= detector.CONF["default"]]
    out["Space"] = sum(1 for c in hits if c in ROOMS)
    # AECV's "toilet facilities" is ambiguous: also report WC + bath rooms instead of toilet bowls
    out["Toilet_rooms"] = sum(1 for c in hits if c in ("room_wc", "room_bath"))
    return out


def _stats(rows: list[tuple[dict, dict]]) -> dict:
    s = {}
    for k in CLASSES:
        pairs = [(t[k], p.get(k) if isinstance(p, dict) else None) for t, p in rows if isinstance(t.get(k), int)]
        exact = sum(1 for t, p in pairs if p == t)
        ape = [abs((p if isinstance(p, (int, float)) else 0) - t) / t for t, p in pairs if t > 0]
        s[k] = (100 * exact / len(pairs), 100 * sum(ape) / len(ape))
    return s


def _vlm(root: Path, stem: str, names: set) -> tuple[list, float]:
    rows, cost = [], 0.0
    for r in csv.DictReader(open(root / VLM / f"{stem}.csv", encoding="utf-8")):
        if r["name"] not in names:
            continue
        try:
            pred = json.loads(r["extracted"])
        except (json.JSONDecodeError, TypeError):
            pred = None  # unparseable answer counts as wrong
        rows.append((json.loads(r["original"]), pred))
        cost += float(r.get("cost_usd") or 0)
    return rows, cost


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    root = Path(os.environ.get("AECV_DATA") or "")
    if not (root / PLANS).is_dir():
        raise SystemExit("Set AECV_DATA to a clone of github.com/AECFoundry/AECV-Bench")
    os.environ.setdefault("STOA_DATA", str(root))  # detector calls data_root(); unused for absolute paths

    plans = sorted(d for d in (root / PLANS).iterdir() if (d / "metadata.json").exists())[: a.limit]
    ours, t0 = [], time.time()
    Path("eval/results").mkdir(parents=True, exist_ok=True)
    with open("eval/results/aecv.jsonl", "w", encoding="utf-8") as log:
        for d in plans:
            truth = json.loads((d / "metadata.json").read_text(encoding="utf-8-sig"))
            pred = _ours(next(f for f in d.iterdir() if f.stem == d.name and f.suffix.lower() in (".png", ".jpg", ".jpeg")))
            ours.append((truth, pred))
            log.write(json.dumps({"plan": d.name, "truth": truth, "pred": pred}) + "\n")
    secs = time.time() - t0
    names = {d.name for d in plans}

    rooms = [(t, {**p, "Toilet": p["Toilet_rooms"]}) for t, p in ours]
    toilet_rooms = _stats(rooms)["Toilet"]
    table = [("**Sindri detector**", _stats(ours), f"€{EUR_PER_ANSWER * len(CLASSES) * len(plans):.4f}")]
    for stem, label in VLM_ROWS.items():
        rows, cost = _vlm(root, stem, names)
        table.append((label, _stats(rows), f"${cost:.2f}" if cost else "n/a"))

    head = "| Model | " + " | ".join(CLASSES) + f" | Cost, {len(plans)} plans |"
    lines = [head, "|" + "---|" * (len(CLASSES) + 2)]
    for label, s, cost in table:
        lines.append(f"| {label} | " + " | ".join(f"{s[k][0]:.0f}% ({s[k][1]:.0f}%)" for k in CLASSES) + f" | {cost} |")
    lines.append(f"\nDetector Toilet counted as WC + bath rooms instead of toilet bowls: "
                 f"{toilet_rooms[0]:.0f}% ({toilet_rooms[1]:.0f}%).")
    body = "\n".join(lines)
    print(body)
    print(f"\n{len(plans)} plans, detector {secs:.0f}s on CPU")
    if a.write:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
        old = REPORT.read_text(encoding="utf-8") if REPORT.exists() else ""
        notes = old[old.find("\n## Findings"):] if "\n## Findings" in old else ""  # hand-written, keep on rerun
        REPORT.write_text(
            f"# AECV-Bench object counting: detector vs VLMs\n\n"
            f"- {date.today()}, commit {commit}, {len(plans)} plans, detector {secs:.0f}s on CPU.\n"
            f"- Cell: exact match (MAPE). VLM rows recomputed from AECV-Bench's own CSVs; unparseable = wrong.\n"
            f"- Source: github.com/AECFoundry/AECV-Bench (arXiv 2601.04819). Reproduce: `AECV_DATA=... python -m eval.aecv`.\n\n"
            f"{body}\n{notes}", encoding="utf-8")


if __name__ == "__main__":
    main()
