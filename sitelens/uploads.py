"""User-imported projects: loose drawings, a folder or a zip, stored next to the dataset.

Files land in <STOA_DATA>/data/uploads/<id>/ so every path reads them like dataset drawings
(`data/uploads/<id>/<file>`). Each project has a project.json with its display name.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import tempfile
import time
import zipfile
from pathlib import Path
from typing import BinaryIO

from . import data_root

SHOWN = {".pdf", ".png", ".jpg", ".jpeg", ".ifc"}   # listed as sheets / models
KEPT = SHOWN | {".dxf"}                             # DXF rides along as the vector twin of a same-name PDF
MAX_FILE = int(os.environ.get("SITELENS_UPLOAD_MB", "500")) * 2**20
MAX_ZIP_FILES = 2000
_ID = re.compile(r"^[a-z0-9-]{1,60}$")


def enabled() -> bool:
    return os.environ.get("SITELENS_UPLOADS", "1") != "0"


def root() -> Path:
    return data_root() / "data" / "uploads"


def _dir(pid: str) -> Path:
    if not _ID.match(pid):
        raise ValueError("bad project id")
    d = root() / pid
    if not (d / "project.json").is_file():
        raise KeyError(pid)
    return d


def create(name: str) -> dict:
    name = re.sub(r"\s+", " ", name).strip()[:80] or "Untitled project"
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "project"
    pid = f"{slug}-{secrets.token_hex(3)}"
    d = root() / pid
    d.mkdir(parents=True)
    meta = {"id": pid, "name": name, "created": time.time()}
    (d / "project.json").write_text(json.dumps(meta), encoding="utf8")
    return meta


def meta(pid: str) -> dict:
    return json.loads((_dir(pid) / "project.json").read_text(encoding="utf8"))


def exists(pid: str) -> bool:
    try:
        _dir(pid)
        return True
    except (KeyError, ValueError):
        return False


def files(pid: str) -> list[str]:
    """Dataset-relative paths of every stored file (DXF included), for cleaning up what refers to them."""
    return [_rel(f) for f in sorted(_dir(pid).iterdir()) if f.is_file() and f.suffix.lower() in KEPT]


def delete(pid: str) -> bool:
    try:
        shutil.rmtree(_dir(pid))
        return True
    except KeyError:
        return False


def _clean(name: str) -> str:
    """Base name only (folders and zips are flattened), safe on Windows, short enough for MAX_PATH."""
    base = re.split(r"[\\/]", name)[-1]
    stem, ext = os.path.splitext(base)
    stem = re.sub(r"[^\w .()+-]+", "_", stem).strip(" .")[:80] or "file"
    return stem + ext.lower()


def _free(d: Path, name: str) -> Path:
    p = d / name
    stem, ext = os.path.splitext(name)
    n = 2
    while p.exists():
        p, n = d / f"{stem} ({n}){ext}", n + 1
    return p


def _check(p: Path) -> str | None:
    """Reason the file can't be used, or None. Cheap: header / first page only."""
    ext = p.suffix.lower()
    try:
        if ext == ".pdf":
            import pymupdf
            with pymupdf.open(p) as doc:
                if doc.page_count == 0:
                    return "PDF has no pages"
                if doc.needs_pass:
                    return "PDF is password-protected"
        elif ext in {".png", ".jpg", ".jpeg"}:
            from PIL import Image
            with Image.open(p) as im:
                im.verify()
        elif ext == ".ifc":
            with open(p, "rb") as f:
                if b"ISO-10303-21" not in f.read(256):
                    return "not an IFC (STEP) file"
        elif ext == ".dxf":
            with open(p, "rb") as f:
                if b"SECTION" not in f.read(4096).upper():
                    return "not a DXF file"
    except Exception as e:  # corrupt file: skip it, keep the rest of the import
        return f"can't read it ({type(e).__name__})"
    return None


def _store(d: Path, name: str, src: BinaryIO, size_hint: int | None = None) -> tuple[Path | None, str | None]:
    ext = os.path.splitext(name)[1].lower()
    if ext not in KEPT:
        return None, f"{ext or 'no extension'} isn't a drawing format"
    if size_hint is not None and size_hint > MAX_FILE:
        return None, f"over {MAX_FILE // 2**20} MB"
    out = _free(d, _clean(name))
    n = 0
    try:
        with open(out, "wb") as f:
            while chunk := src.read(1 << 20):
                n += len(chunk)
                if n > MAX_FILE:
                    break
                f.write(chunk)
    except BaseException:
        out.unlink(missing_ok=True)   # no half-written drawing left behind
        raise
    if n > MAX_FILE:
        out.unlink()
        return None, f"over {MAX_FILE // 2**20} MB"
    if reason := _check(out):
        out.unlink()
        return None, reason
    return out, None


def _rel(p: Path) -> str:
    return p.relative_to(data_root()).as_posix()


MAX_UPLOAD = MAX_FILE * 4   # one request; a zip may hold several files


def spool(pid: str) -> BinaryIO:
    """Temp file inside the project folder (same disk), for streaming a request body into."""
    return tempfile.TemporaryFile(dir=_dir(pid))


def add(pid: str, name: str, src: BinaryIO) -> dict:
    """Store one uploaded file (seekable, at its start); a zip is unpacked.
    → {"added": [paths], "skipped": [{name, reason}]}."""
    d = _dir(pid)
    added: list[str] = []
    skipped: list[dict] = []
    if name.lower().endswith(".zip"):
        try:
            z = zipfile.ZipFile(src)
        except zipfile.BadZipFile:
            return {"added": [], "skipped": [{"name": name, "reason": "not a valid zip"}]}
        members = [i for i in z.infolist() if not i.is_dir()]
        budget = MAX_UPLOAD * 4   # unpacked total: a small zip can expand to far more than it sent
        for i in members[:MAX_ZIP_FILES]:
            base = re.split(r"[\\/]", i.filename)[-1]
            if not base or base.startswith(".") or "__MACOSX" in i.filename:
                continue   # Finder / editor junk, not worth reporting
            if os.path.splitext(base)[1].lower() not in KEPT:
                skipped.append({"name": i.filename, "reason": f"{os.path.splitext(base)[1] or 'no extension'} isn't a drawing format"})
                continue
            budget -= i.file_size
            if budget < 0:
                skipped.append({"name": i.filename, "reason": "zip unpacks to too much data"})
                continue
            try:
                with z.open(i) as member:
                    p, why = _store(d, base, member, i.file_size)
            except (RuntimeError, zipfile.BadZipFile, OSError, EOFError) as e:   # encrypted / bad CRC: skip only this entry
                p, why = None, "encrypted entry" if "encrypt" in str(e).lower() or "password" in str(e).lower() else f"damaged in the zip ({type(e).__name__})"
            (added.append(_rel(p)) if p else skipped.append({"name": i.filename, "reason": why}))
        if len(members) > MAX_ZIP_FILES:
            skipped.append({"name": name, "reason": f"only the first {MAX_ZIP_FILES} files were read"})
    else:
        p, why = _store(d, name, src)
        (added.append(_rel(p)) if p else skipped.append({"name": name, "reason": why}))
    return {"added": added, "skipped": skipped}


def listing() -> list[dict]:
    """Every shown file of every imported project: {"path", "project": {key, name, created}}."""
    r = root()
    if not r.is_dir():
        return []
    out = []
    for d in sorted(r.iterdir()):
        try:
            m = json.loads((d / "project.json").read_text(encoding="utf8"))
        except (OSError, ValueError):
            continue
        proj = {"key": f"upload/{d.name}", "name": m.get("name") or d.name, "created": m.get("created", 0)}
        for f in sorted(d.iterdir()):
            if f.is_file() and f.suffix.lower() in SHOWN:
                out.append({"path": _rel(f), "project": proj})
    return out


def is_upload(path: str) -> bool:
    parts = path.split("/")
    if len(parts) != 4 or parts[:2] != ["data", "uploads"] or not _ID.match(parts[2]):
        return False
    return os.path.splitext(parts[3])[1].lower() in KEPT and (data_root() / path).is_file()
