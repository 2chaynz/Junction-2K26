"""Revision diff on two synthetic sheets. Needs no dataset.  python tests/test_diff.py"""
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
            ((600, 150), "PROJECT SPORTS COMPLEX"), ((600, 300), "SHEET A-801")]
    sheet(old, base + [((100, 400), "8/14/2015")], wall_to=500)
    edited = [((100, 100), "DOOR 101 WIDTH 3'-6\"")] + base[2:] + [((100, 300), "WRESTLING ROOM"), ((100, 400), "2/10/2016")]
    sheet(new, edited, wall_to=900, shift=(15, 10))  # whole sheet moved: alignment must absorb it
    sheet(same, base, wall_to=500, shift=(15, 10))

    a = diff.diff(old, new)
    labels = [e.label for e in a.evidence]
    assert a.method == "diff" and a.unit == "count" and a.value == len(a.evidence), a
    assert any("3'-0\"" in s and "3'-6\"" in s and s.startswith("changed") for s in labels), labels
    assert "removed: GOLF SIMULATOR" in labels, labels
    assert "added: WRESTLING ROOM" in labels, labels
    assert any(s.startswith("drawing") for s in labels), labels   # wall extended 500 → 900
    assert not any("2015" in s or "2016" in s for s in labels), labels  # plot dates are noise
    assert diff.diff(old, same).value == 0, diff.diff(old, same).evidence

    assert diff.answer("data/x.pdf", "How many doors?") is None
    assert diff.answer("data/x.ifc", "What changed?") is None
print("test_diff ok")
