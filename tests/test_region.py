"""Brush marks: what's under the mark, pointing words. Needs no dataset.  python tests/test_region.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sitelens.region import DEICTIC, Mark  # noqa: E402

# a stroke covers points within its radius
line = Mark.parse({"points": [[0, 0], [10, 0]], "r": 2})
assert line.bbox == [-2, -2, 12, 2]
assert line.covers(5, 0) and line.covers(10, 1) and not line.covers(5, 5)

# a closed loop also covers what it encircles; an open arc does not
ring = [[50 + 40 * c, 50 + 40 * s] for c, s in
        [(1, 0), (.7, .7), (0, 1), (-.7, .7), (-1, 0), (-.7, -.7), (0, -1), (.7, -.7), (.95, -.3), (1, 0)]]
assert Mark.parse({"points": ring, "r": 2}).covers(50, 50)
assert not Mark.parse({"points": ring[:5], "r": 2}).covers(50, 50)

# bbox only (no stroke) → rectangle
box = Mark.parse({"bbox": [0, 0, 10, 10]})
assert box.covers_box([2, 2, 4, 4]) and not box.covers_box([20, 20, 30, 30])

# "in this area" / "here" point at the mark; they don't make it an area question
assert DEICTIC.sub("", "How many doors in this area?") == "How many doors?"
assert DEICTIC.sub("", "How many doors here?") == "How many doors?"
assert DEICTIC.sub("", "What is the area of this room?") == "What is the area of this room?"

try:
    Mark.parse({})
    raise AssertionError("empty mark accepted")
except ValueError:
    pass
print("region ok")
