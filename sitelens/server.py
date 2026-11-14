"""Demo server: the web UI talks to the router through this. See CONTRACT.md → Demo API.

  STOA_DATA=/path/to/dataset python -m sitelens.server   →  http://localhost:8000
"""
from __future__ import annotations

import collections
import io
import json
import random
import time
from functools import lru_cache
from pathlib import Path

import fitz  # PyMuPDF
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import data_root
from .router import answer

WEB = Path(__file__).resolve().parent.parent / "web" / "dist"
IMAGE_EXT = {".png", ".jpg", ".jpeg"}

app = FastAPI(title="SiteLens")


def _safe(rel: str) -> Path:
    root = data_root().resolve()
    p = (root / rel).resolve()
    if root not in p.parents or not p.is_file():
        raise HTTPException(404, f"not found: {rel}")
    return p


@lru_cache(maxsize=1)
def _questions() -> dict[str, list[dict]]:
    by_path: dict[str, list[dict]] = collections.defaultdict(list)
    with open(data_root() / "questions.jsonl", encoding="utf8") as f:
        for line in f:
            q = json.loads(line)
            by_path[q["path"]].append(q)
    return dict(by_path)


def _view_of(rel: str) -> str:
    """The file the UI shows for a drawing. IFC models show a plan rendered from them, if one exists."""
    if not rel.endswith(".ifc"):
        return rel
    stem = Path(rel).stem
    plans = sorted((data_root() / Path(rel).parent).glob(f"{stem}_plan-*.pdf"))
    return str(plans[0].relative_to(data_root())) if plans else rel


@app.get("/api/drawings")
def drawings():
    out = []
    for path, qs in sorted(_questions().items()):
        out.append({"path": path, "source": path.split("/")[1], "view": _view_of(path),
                    "questions": [{"question": q["question"], "answer": q["answer"], "unit": q["unit"],
                                   "type": q["type"]} for q in qs]})
    return out


@app.get("/api/file")
def file(path: str, page: int = 0, scale: float = 1.0):
    """PNG of a drawing page. scale=1 → 1 px per PDF point (bbox coords); images: 1 px per pixel."""
    p = _safe(path)
    scale = max(0.05, min(scale, 4.0))
    if p.suffix.lower() in IMAGE_EXT:
        if scale == 1.0:
            return FileResponse(p)
        from PIL import Image
        im = Image.open(p)
        im.thumbnail((max(1, int(im.width * scale)), max(1, int(im.height * scale))))
        buf = io.BytesIO()
        im.convert("RGB").save(buf, "JPEG", quality=80)
        return Response(buf.getvalue(), media_type="image/jpeg")
    if p.suffix.lower() == ".pdf":
        with fitz.open(p) as doc:
            if not 0 <= page < len(doc):
                raise HTTPException(404, "no such page")
            pix = doc[page].get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
            return Response(pix.tobytes("png"), media_type="image/png",
                            headers={"X-Page-Count": str(len(doc))})
    if p.suffix.lower() == ".svg":
        return FileResponse(p, media_type="image/svg+xml")
    raise HTTPException(415, f"no preview for {p.suffix}")


@app.get("/api/ifc")
def ifc(path: str):
    """Raw IFC bytes for the in-browser 3D viewer."""
    p = _safe(path)
    if p.suffix.lower() != ".ifc":
        raise HTTPException(400, "not an IFC file")
    return FileResponse(p, media_type="application/octet-stream")


class Ask(BaseModel):
    path: str
    question: str


@app.post("/api/ask")
def ask(req: Ask):
    _safe(req.path)
    t = time.time()
    a = answer(req.path, req.question).to_dict()
    a["time_s"] = round(time.time() - t, 3)
    a["view"] = _view_of(req.path)
    # When the question is one of Stoa's, show their answer next to ours.
    key = next((q for q in _questions().get(req.path, []) if q["question"].strip() == req.question.strip()), None)
    if key:
        from eval.score import grade
        a["check"] = {"expected": key["answer"], "unit": key["unit"], "match": grade(key, a["value"])}
    return a


@app.get("/api/random")
def surprise():
    qs = _questions()
    path = random.choice(list(qs))
    return {"path": path, "question": random.choice(qs[path])["question"]}


if WEB.is_dir():
    app.mount("/", StaticFiles(directory=WEB, html=True), name="web")


def main():
    import argparse
    import uvicorn
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1")
    a = ap.parse_args()
    data_root()  # fail fast if STOA_DATA is missing
    uvicorn.run(app, host=a.host, port=a.port)


if __name__ == "__main__":
    main()
