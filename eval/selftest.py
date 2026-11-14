"""Data-free checks run by scripts/check.sh."""
from eval.score import grade
from eval.split import drawing_id, in_split, split_of
from sitelens import Answer, Evidence

c = {"type": "count", "answer": 3}
a = {"type": "area", "answer": 100.0}
assert grade(c, 3) and grade(c, 3.0) and not grade(c, 4) and not grade(c, 2.6) and not grade(c, None)
assert grade(a, 101.9) and grade(a, 98.1) and not grade(a, 102.5)
assert grade({"type": "text", "answer": "x"}, "x") is None
assert drawing_id("data/ifc_models/m_plan-02-x.pdf") == drawing_id("data/ifc_models/m.ifc")
assert split_of("data/swiss_dwellings/a.pdf") == split_of("data/swiss_dwellings/a.dxf")
assert Answer(1, evidence=[Evidence("f", [0, 0, 1, 1])]).to_dict()["evidence"][0]["bbox"] == [0, 0, 1, 1]
assert in_split("data/cubicasa5k/colorful-11260.png", "test") and not in_split("data/swiss_dwellings/a.pdf", "test")
print("selftest ok")
