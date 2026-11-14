"""Takeoff on a synthetic door schedule (no dataset), plus an IFC check when STOA_DATA is set.
python tests/test_takeoff.py"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fitz  # noqa: E402

real = os.environ.get("STOA_DATA")

# synthetic: a door schedule sheet, two A1 doors 3'-0" x 7'-0", one B2 6'-0" x 8'-0"
with tempfile.TemporaryDirectory() as d:
    os.environ["STOA_DATA"] = d
    from sitelens import takeoff as tk  # noqa: E402
    rel = "data/opening_design/P/A-801 - Door Schedule.pdf"
    (Path(d) / rel).parent.mkdir(parents=True)
    doc = fitz.open()
    p = doc.new_page(width=1200, height=900)
    p.insert_text((100, 80), "DOOR SCHEDULE", fontsize=10)
    for x, h in ((100, "MARK"), (180, "ROOM"), (280, "TYPE"), (340, "WIDTH"), (420, "HEIGHT"), (500, "MATL")):
        p.insert_text((x, 110), h, fontsize=8)
    rows = [("101.A", "OFFICE", "A1", "3'-0\"", "7'-0\"", "WD"), ("102.A", "OFFICE", "A1", "3'-0\"", "7'-0\"", "WD"),
            ("103.A", "GYM", "B2", "6'-0\"", "8'-0\"", "HM"), ("104.A", "STORAGE", "A1", "3'-0\"", "7'-0\"", "WD")]
    for i, r in enumerate(rows):
        for x, v in zip((100, 180, 280, 340, 420, 500), r):
            p.insert_text((x, 130 + 14 * i), v, fontsize=8)
    doc.save(Path(d) / rel)

    t = tk.takeoff(rel)
    assert t["source"] == "schedule", t
    got = {(r["type"], r["size"]): r["count"] for r in t["rows"]}
    assert got == {("A1", "3'-0\" × 7'-0\""): 3, ("B2", "6'-0\" × 8'-0\""): 1}, got
    assert all(len(r["evidence"]) == r["count"] for r in t["rows"])   # one cited schedule row per door
    csv = tk.to_csv(t)
    assert csv.splitlines()[0].startswith("Category,Type,Size,Count") and "A1" in csv, csv
    assert tk.takeoff("data/opening_design/P/missing.pdf")["source"] == "none"
    print("schedule takeoff ok")

    # chat listing: doors of one room, with sizes, as a cited table
    a = tk.answer(rel, "How many doors are in the office and what are their dimensions?")
    assert a is not None and a.value == 2 and a.unit == "count", a
    assert len(a.table["rows"]) == len(a.evidence) == 2 and "WIDTH" in a.table["columns"], a.table
    a = tk.answer(rel, "What are the sizes of the doors in the gym?")
    assert a.value == "1 door: 1 × 6'-0\" × 8'-0\"", a.value
    for q in ("What is the width of door 101.A?", "What is the average door width?", "How many doors are there?",
              "What is the thickness of the external walls?"):
        assert tk.answer(rel, q) is None, q   # single elements, aggregates and plain counts stay with other paths
    print("listing ok")

if real and (Path(real) / "data/ifc_models/kit-fzk-haus_ac20-fzk-haus.ifc").exists():
    os.environ["STOA_DATA"] = real
    tk._cached.cache_clear()
    t = tk.takeoff("data/ifc_models/kit-fzk-haus_ac20-fzk-haus.ifc")
    by = {c: sum(r["count"] for r in t["rows"] if r["category"] == c) for c in ("Doors", "Windows", "Walls")}
    assert by == {"Doors": 5, "Windows": 11, "Walls": 13}, by
    assert {r["size"] for r in t["rows"] if r["category"] == "Walls"} == {"240 mm thick", "300 mm thick"}
    assert all(e["ifc_guid"] for r in t["rows"] for e in r["evidence"])
    print("ifc takeoff ok")
    a = tk.answer("data/ifc_models/kit-fzk-haus_ac20-fzk-haus.ifc", "Which doors are in the Wohnen room and what size are they?")
    assert a.value == "1 door: 1 × 2010 × 2375 mm" and a.evidence[0].ifc_guid, a.value
    a = tk.answer("data/ifc_models/bsc-duplex_duplex-a-20110907.ifc", "How many doors are in bedroom 2 and their dimensions?")
    assert a.value == 2 and "2 rooms" in a.table["title"], (a.value, a.table["title"])   # units A and B
    print("ifc listing ok")
print("takeoff ok")
