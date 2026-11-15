"""Imported projects: create, add files and zips, skip junk, list, delete.  python tests/test_uploads.py"""
import io
import os
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
tmp = tempfile.TemporaryDirectory()
os.environ["STOA_DATA"] = tmp.name

import fitz  # noqa: E402
from PIL import Image  # noqa: E402

from sitelens import uploads  # noqa: E402


def pdf() -> bytes:
    doc = fitz.open()
    doc.new_page().insert_text((72, 72), "A-101 Floor plan")
    return doc.tobytes()


def png() -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(b, "PNG")
    return b.getvalue()


IFC = b"ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n"

m = uploads.create("  Clinic   Tower ")
pid = m["id"]
assert m["name"] == "Clinic Tower" and pid.startswith("clinic-tower-"), m

r = uploads.add(pid, "A-101.pdf", io.BytesIO(pdf()))
assert r["added"] == [f"data/uploads/{pid}/A-101.pdf"] and not r["skipped"], r
assert uploads.add(pid, "A-101.pdf", io.BytesIO(pdf()))["added"] == [f"data/uploads/{pid}/A-101 (2).pdf"]
assert uploads.add(pid, "notes.txt", io.BytesIO(b"hi"))["skipped"][0]["reason"].startswith(".txt")
assert "can't read" in uploads.add(pid, "broken.pdf", io.BytesIO(b"%PDF-nope"))["skipped"][0]["reason"]

z = io.BytesIO()
with zipfile.ZipFile(z, "w") as f:
    f.writestr("set/arch/A-201.pdf", pdf())
    f.writestr("set/scan.png", png())
    f.writestr("set/model.IFC", IFC)
    f.writestr("set/../../evil.pdf", pdf())   # zip-slip: flattened to the base name
    f.writestr("__MACOSX/set/._A-201.pdf", b"x")
    f.writestr("set/readme.md", b"x")
r = uploads.add(pid, "set.zip", io.BytesIO(z.getvalue()))
names = sorted(p.split("/")[-1] for p in r["added"])
assert names == ["A-201.pdf", "evil.pdf", "model.ifc", "scan.png"], r
assert [s["name"] for s in r["skipped"]] == ["set/readme.md"], r
assert not (Path(tmp.name) / "evil.pdf").exists()
assert uploads.add(pid, "bad.zip", io.BytesIO(b"nope"))["skipped"][0]["reason"] == "not a valid zip"

# A damaged entry (bad CRC) skips only itself; the rest still import.
z = io.BytesIO()
with zipfile.ZipFile(z, "w", zipfile.ZIP_STORED) as f:
    f.writestr("good.pdf", pdf())
    f.writestr("bad.pdf", pdf())
raw = bytearray(z.getvalue())
at = raw.rindex(b"%PDF")   # second entry's data
raw[at + 20] ^= 0xFF
r = uploads.add(pid, "crc.zip", io.BytesIO(bytes(raw)))
assert [x.split("/")[-1] for x in r["added"]] == ["good.pdf"], r
assert r["skipped"][0]["name"] == "bad.pdf" and "damaged" in r["skipped"][0]["reason"], r
assert not any("bad" in f.name for f in (Path(tmp.name) / "data" / "uploads" / pid).iterdir())

listed = uploads.listing()
assert len(listed) == 7 and all(x["project"]["key"] == f"upload/{pid}" for x in listed), listed
assert uploads.is_upload(listed[0]["path"]) and not uploads.is_upload(f"data/uploads/{pid}/../x.pdf")
try:
    uploads.add("../x", "a.pdf", io.BytesIO(pdf()))
    raise AssertionError("bad id accepted")
except ValueError:
    pass
assert uploads.delete(pid) and uploads.listing() == []
print("uploads ok")
