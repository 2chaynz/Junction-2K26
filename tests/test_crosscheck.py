"""Cross-check on a synthetic drawing set. Needs no dataset.  python tests/test_crosscheck.py"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fitz  # noqa: E402

from sitelens.paths import crosscheck as cc  # noqa: E402

ROW = "{m}   BEDROOM   {room}   3' - 0\"   6' - 8\"   SWING   WOOD   T.B.D."


def make(folder: Path, schedule: list[tuple[str, str]], drawn: list[str]):
    folder.mkdir(parents=True)
    doc = fitz.open()
    p = doc.new_page(width=1200, height=900)
    p.insert_text((100, 60), "DOOR SCHEDULE", fontsize=10)
    for i, (m, room) in enumerate(schedule):
        p.insert_text((100, 100 + 14 * i), ROW.format(m=m, room=room), fontsize=8)
    doc.save(folder / "A500 - SCHEDULES.pdf")
    doc = fitz.open()
    p = doc.new_page(width=1200, height=900)
    p.insert_text((50, 50), "FIRST FLOOR PLAN", fontsize=10)
    for i, m in enumerate(drawn):
        p.insert_text((100 + 120 * (i % 8), 200 + 90 * (i // 8)), m, fontsize=8)
    doc.save(folder / "A101 - FLOOR PLAN.pdf")


Q = "Any conflicts between the plans and the door schedule?"
with tempfile.TemporaryDirectory() as d:
    os.environ["STOA_DATA"] = d
    good = [("101.A", "101"), ("102.A", "102"), ("103.A", "103"), ("104.A", "104")]
    make(Path(d) / "data/opening_design/P/ok", good, [m for m, _ in good])
    make(Path(d) / "data/opening_design/P/bad", good + [("208.J", "109")], [m for m, _ in good] + ["105.B"])

    a = cc.answer("data/opening_design/P/ok/A101 - FLOOR PLAN.pdf", Q)
    assert a and a.value.startswith("No conflicts: all 4"), a and a.value

    a = cc.answer("data/opening_design/P/bad/A500 - SCHEDULES.pdf", Q)
    print(a.value)
    assert a.value.startswith("2 conflicts"), a.value
    assert "door 208.J is in the schedule but on no drawing and is scheduled in room 109" in a.value
    assert "door 105.B is drawn but not in the schedule" in a.value
    files = {e.file.rsplit("/", 1)[1] for e in a.evidence}
    assert files == {"A500 - SCHEDULES.pdf", "A101 - FLOOR PLAN.pdf"}, files   # both sides cited

    assert cc.answer("data/opening_design/P/ok/A101 - FLOOR PLAN.pdf", "How many doors are there?") is None
    assert cc.answer("data/ifc_models/x.ifc", Q) is None
print("crosscheck ok")
