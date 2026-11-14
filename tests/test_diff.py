"""Revision diff and quantities on two synthetic sheets. Needs no dataset.  python tests/test_diff.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fitz  # noqa: E402

from sitelens.paths import diff  # noqa: E402


def sheet(path, notes, wall_to, shift=(0, 0)):
    doc = fitz.open()
    page = doc.new_page(width=1200, height=800)
    dx, dy = shift
    for (x, y), text in notes:
        page.insert_text((x + dx, y + dy), text, fontsize=10)
    page.draw_line((100 + dx, 600 + dy), (wall_to + dx, 600 + dy), width=3)
    doc.save(path)


with tempfile.TemporaryDirectory() as d:
    old, new, same = (str(Path(d) / n) for n in ("old.pdf", "new.pdf", "same.pdf"))
    base = [((100, 100), "DOOR 101 WIDTH 3'-0\""), ((100, 200), "GOLF SIMULATOR"), ((600, 100), "TITLE BLOCK ACME"),
            ((600, 150), "PROJECT SPORTS COMPLEX"), ((600, 300), "SHEET A-801"), ((900, 100), "101.A"),
            ((900, 150), "102.A"), ((900, 400), "LOBBY 120 SF"), ((300, 700), "PLAN 1/4\" = 1'-0\"")]
    sheet(old, base + [((100, 400), "8/14/2015")], wall_to=500)
    edited = ([((100, 100), "DOOR 101 WIDTH 3'-6\"")] + base[2:6] + [((900, 150), "103.A"), ((900, 175), "104.A"),
              ((900, 400), "LOBBY 150 SF"), base[8], ((100, 300), "WRESTLING ROOM"), ((100, 400), "2/10/2016")])
    sheet(new, edited, wall_to=900, shift=(15, 10))  # whole sheet moved: alignment must absorb it
    sheet(same, base, wall_to=500, shift=(15, 10))

    a, q = diff.diff_with_quantities(old, new)
    labels = [e.label for e in a.evidence]
    assert a.method == "diff" and a.unit == "count", a
    assert a.value == sum(not s.startswith("quantity") for s in labels), labels
    assert any("3'-0\"" in s and "3'-6\"" in s and s.startswith("changed") for s in labels), labels
    assert "removed: GOLF SIMULATOR" in labels, labels
    assert "added: WRESTLING ROOM" in labels, labels
    assert not any("2015" in s or "2016" in s for s in labels), labels  # plot dates are noise
    assert diff.diff(old, same).value == 0, diff.diff(old, same).evidence

    # quantities
    assert q["doors_added"] == ["103.A", "104.A"] and q["doors_removed"] == ["102.A"], q
    assert q["area_delta"] == {"ft2": 30.0}, q
    assert any(s == "quantity: size 3' - 0\" → 3' - 6\"" for s in labels), labels
    wall = [s for s in labels if s.startswith("drawing")]
    assert wall and "+22 ft" in wall[0] and "1/4\" = 1'-0\"" in wall[0], wall  # 400 pt = 5.6 in at 1/4" = 1' → 22 ft
    assert 21 <= q["linework_ft"] <= 23, q

    # questions, through the curated-pair lookup
    diff.pairs = lambda: [{"old": old, "new": new}]
    p = new
    assert diff.answer(p, "How many doors were added since the previous issue?").value == 2
    assert diff.answer(p, "How many doors were removed?").value == 1
    r = diff.answer(p, "How much did the area change?")
    assert (r.value, r.unit) == (30.0, "ft2"), r
    assert diff.answer(p, "What changed?").value == a.value
    assert diff.answer(p, "How many doors?") is None          # not a revision question
    assert diff.answer("data/x.ifc", "What changed?") is None
print("test_diff ok")
