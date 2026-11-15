"""Demo set (T96): whole sheet sets listed, SITELENS_DEMO filter.  python tests/test_demo_set.py"""
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
tmp = tempfile.TemporaryDirectory()
root = Path(tmp.name)
os.environ["STOA_DATA"] = tmp.name
os.environ.pop("SITELENS_DEMO", None)

import fitz  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from sitelens import demo, server  # noqa: E402

SET = root / demo.SHEET_SETS[0]
SET.mkdir(parents=True)
for name in ("A700 - SCHEDULES.pdf", "A101 - FLOOR PLANS - 1ST FLOOR.pdf"):
    doc = fitz.open()
    doc.new_page().insert_text((72, 72), name)
    doc.save(SET / name)
(SET / "notes.txt").write_text("not a sheet")
asked = f"{demo.SHEET_SETS[0]}/A700 - SCHEDULES.pdf"
plan = f"{demo.SHEET_SETS[0]}/A101 - FLOOR PLANS - 1ST FLOOR.pdf"
other = "data/swiss_dwellings/site1_bldg1_floor1.pdf"
with open(root / "questions.jsonl", "w", encoding="utf8") as f:
    for p in (asked, other):
        f.write(json.dumps({"path": p, "question": "How many doors?", "answer": 1, "unit": "count", "type": "count"}) + "\n")

c = TestClient(server.app)
listed = {d["path"]: d for d in c.get("/api/drawings").json()}
assert set(listed) == {asked, plan, other}, listed.keys()   # the plan has no questions but is part of the set
assert listed[plan]["questions"] == [] and listed[asked]["questions"]
assert c.get("/api/original", params={"path": plan}).status_code == 200
assert server._related(asked, [plan, "data/x/unlisted.pdf"]) == [plan]

os.environ["SITELENS_DEMO"] = "1"
assert set(d["path"] for d in c.get("/api/drawings").json()) == {asked, plan}   # site1 is not a demo project
assert c.get("/api/random").json()["path"] == asked
os.environ["SITELENS_DEMO"] = "0"
assert len(c.get("/api/drawings").json()) == 3

# Every scripted chip belongs to a demo project.
for p in json.loads((Path(__file__).resolve().parent.parent / "web/src/demoScript.json").read_text(encoding="utf8")):
    assert p["path"].startswith(tuple(demo.PROJECTS)), p["path"]
    assert all(ch["q"] and ch["role"] and "expect" in ch for ch in p["chips"]), p["project"]
print("demo set ok")
