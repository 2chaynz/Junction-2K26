"""Ask sessions per project: save, list, reopen, delete.  python tests/test_sessions.py"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
tmp = tempfile.TemporaryDirectory()
os.environ["SITELENS_STORE"] = str(Path(tmp.name) / "measure")

from sitelens import sessions  # noqa: E402

msgs = [
    {"kind": "user", "path": "data/a.pdf", "text": "How many doors?"},
    {"kind": "answer", "path": "data/a.pdf", "question": "How many doors?", "answer": {"value": 4, "unit": "count"}},
    {"kind": "pending", "path": "data/a.pdf", "steps": []},
]
s = sessions.put("ifc/clinic", "abcd1234", msgs)
assert s["title"] == "How many doors?" and s["questions"] == 1, s
assert s["last"]["value"] == 4 and s["paths"] == ["data/a.pdf"], s
assert [x["id"] for x in sessions.list_sessions("ifc/clinic")] == ["abcd1234"]
assert sessions.list_sessions("ifc/other") == []
assert all(m["kind"] != "pending" for m in sessions.get("ifc/clinic", "abcd1234")["msgs"])
assert sessions.overview()["ifc/clinic"]["sessions"] == 1
sessions.put("ifc/clinic", "abcd1234", msgs, title="Door count")
assert sessions.list_sessions("ifc/clinic")[0]["title"] == "Door count"
assert sessions.delete("ifc/clinic", "abcd1234") and not sessions.delete("ifc/clinic", "abcd1234")
try:
    sessions.put("p", "../x", [])
    raise AssertionError("bad id accepted")
except ValueError:
    pass
print("sessions ok")
