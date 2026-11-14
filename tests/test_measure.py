"""Measure: scale notes, question back, calibration, takeoffs, stored references.
Synthetic project needs no dataset; real drawings are checked when STOA_DATA is set.  python tests/test_measure.py"""
import math
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fitz  # noqa: E402
from PIL import Image  # noqa: E402

real = os.environ.get("STOA_DATA")
tmp = tempfile.TemporaryDirectory()
os.environ["SITELENS_STORE"] = str(Path(tmp.name) / "store")

from sitelens import measure as M  # noqa: E402

# units
assert abs(M.parse_length("12'-6\"") - 3.81) < 1e-9
assert abs(M.parse_length("5'-10 3/8\"") - (70.375 * 0.0254)) < 1e-9
assert M.parse_length("3.5 m") == 3.5 and M.parse_length("350 cm") == 3.5 and M.parse_length("nope") is None
assert M.ft_in(3.81) == "12'-6\"", M.ft_in(3.81)
sq = [[0, 0], [100, 0], [100, 100], [0, 100]]
assert M.compute("area", sq, 0.01)["value"] == 1.0
assert M.compute("length", [[0, 0], [30, 40]], 0.1)["value"] == 5.0
assert M.compute("count", sq, 1)["value"] == 4


def sheet(path, notes, size=(1200, 800)):
    doc = fitz.open()
    page = doc.new_page(width=size[0], height=size[1])
    for (x, y), t in notes:
        page.insert_text((x, y), t, fontsize=10)
    doc.save(path)


# synthetic project: data/proj/<project>/<sheets>
root = Path(tmp.name) / "ds"
proj = root / "data" / "proj" / "Acme"
(proj / "sheets").mkdir(parents=True)
sheet(proj / "sheets" / "A-101.pdf", [((100, 700), "FLOOR PLAN 1/4\" = 1'-0\""), ((300, 300), "OFFICE 120 SF")])
sheet(proj / "sheets" / "A-501.pdf", [((100, 700), "PLAN 1/4\" = 1'-0\""), ((700, 700), "DETAIL 3\" = 1'-0\"")])
sheet(proj / "sheets" / "S-1.pdf", [((100, 700), "Scale 1:50 at 10:30"), ((200, 100), "1:54 and 1/2019")])
Image.new("RGB", (600, 400), "white").save(proj / "scan.png")
(root / "questions.jsonl").write_text("")
os.environ["STOA_DATA"] = str(root)

one = M.resolve("data/proj/Acme/sheets/A-101.pdf")
s = one["scale"]
assert s and s["source"] == "note" and abs(s["m_per_unit"] - 48 * M.PT) < 1e-12 and one["ask"] is None, one
assert s["refs"][0]["bbox"] and "1/4" in s["refs"][0]["text"]
assert any(k["unit"] == "m2" and abs(k["value"] - 120 * M.FT ** 2) < 1e-9 for k in one["known"])

metric = M.resolve("data/proj/Acme/sheets/S-1.pdf")["scale"]
assert metric and metric["ratio"] == "1:50", metric  # 1:54 / 10:30 / 1/2019 aren't scales

two = M.resolve("data/proj/Acme/sheets/A-501.pdf")
assert two["scale"] is None and "2 scales" in two["ask"] and len(two["options"]) == 2, two
near_detail = M.resolve("data/proj/Acme/sheets/A-501.pdf", region=[650, 600, 760, 690])["scale"]
assert "3\"" in near_detail["text"] and "nearest" in near_detail["text"], near_detail

# drawing in the detail region picks the detail scale; the takeoff records which scale it used
m = M.add_measurement("data/proj/Acme/sheets/A-501.pdf", 0, "length", [[650, 650], [722, 650]], "rail")
assert abs(m["value"] - 4 * 0.0254) < 1e-3 and "3\"" in m["scale"]["text"], m  # 1" paper = 4" real

# a scan with no scale: ask back, offer the project's sheet size, then calibrate by hand
scan = M.resolve("data/proj/Acme/scan.png")
assert scan["scale"] is None and "No scale" in scan["ask"] and scan["project"], scan
try:
    M.add_measurement("data/proj/Acme/scan.png", 0, "area", sq, "")
    raise AssertionError("measured with no scale")
except LookupError:
    pass
c = M.calibrate("data/proj/Acme/scan.png", 0, [[10, 10], [110, 10]], "10'-0\"", note="grid A-B")
assert abs(c["m_per_unit"] - 3.048 / 100) < 1e-12 and c["refs"][0]["kind"] == "manual"
r = M.resolve("data/proj/Acme/scan.png")
assert r["scale"]["source"] == "manual" and r["calibrations"][-1]["active"]
a = M.add_measurement("data/proj/Acme/scan.png", 0, "area", sq, "slab")
assert abs(a["value"] - 3.048 ** 2) < 1e-3, a
# calibrate against a known dimension from another sheet: both references are kept
known = next(k for k in M.resolve("data/proj/Acme/scan.png")["known"] if k["unit"] == "m2")
c2 = M.calibrate("data/proj/Acme/scan.png", 0, sq, "", known_id=known["id"])
assert len(c2["refs"]) == 2 and c2["refs"][1]["file"].endswith("A-101.pdf"), c2["refs"]
assert abs(c2["m_per_unit"] - math.sqrt(120 * M.FT ** 2 / 10000)) < 1e-12
# stored: new process would read the same calibrations and takeoffs
data = M.load("data/proj/Acme/scan.png")
assert len(data["calibrations"]) == 2 and sum(x["active"] for x in data["calibrations"]) == 1 and len(data["measurements"]) == 1
assert M.delete_measurement("data/proj/Acme/scan.png", a["id"])
M.reset_scale("data/proj/Acme/scan.png", 0)
assert M.resolve("data/proj/Acme/scan.png")["scale"] is None
print("synthetic ok")

if real and Path(real, "questions.jsonl").exists():
    os.environ["STOA_DATA"] = real
    M.resolve.__globals__["_lines"].cache_clear()
    sw = "data/swiss_dwellings/site1000_bldg2082_floor9385"
    if Path(real, sw + ".dxf").exists():
        r = M.resolve(sw + ".pdf")
        assert r["scale"]["source"] == "dxf" and r["scale"]["ratio"] == "1:200" and "note agrees" in r["scale"]["agree"]
        au = M.auto(sw + ".pdf")
        rooms = [i for i in au["items"] if i["kind"] == "area"]
        assert rooms and all(abs(i["value"] - i["printed"]) / i["printed"] < 0.02 for i in rooms if i["printed"])
        png = M.resolve(sw + ".png")["scale"]
        assert png["source"] == "sibling" and abs(png["m_per_unit"] / r["scale"]["m_per_unit"] - 1190.55 / 2480) < 1e-3
    habs = "data/habs/ar0109_sheet_00002.jpg"
    if Path(real, habs).exists():
        b = M.resolve(habs)["scale"]
        assert b and b["source"] == "bar" and 15 < 0.3048 / b["m_per_unit"] < 18, b
    print("dataset ok")
