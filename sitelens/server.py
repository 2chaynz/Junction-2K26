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
from .router import PATHS, _load, answer

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


GENERAL_PROMPT = """You are SiteLens, a tool that answers questions about construction drawings and BIM models.
It reads each file with the cheapest exact method first: IFC models with ifcopenshell, vector PDFs as text and
geometry, scanned plans with a trained symbol detector, and a vision model only as a last resort. Every answer
shows where it comes from on the plan and what it cost. The user has "{name}" open.
If the question needs facts read from that drawing, set "general" to false. Otherwise answer it in at most
3 short sentences, plain text, no markdown.
Question: {q}
Reply with JSON only: {{"general": true or false, "text": "..."}}"""


def _general(path: str, question: str) -> dict | None:
    """Questions no path answers and that aren't about the drawing (e.g. 'how does this work?')."""
    import os
    import urllib.request
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return None
    model = os.environ.get("SITELENS_GEMINI_MODEL", "gemini-2.5-flash")
    body = {"contents": [{"parts": [{"text": GENERAL_PROMPT.format(name=Path(path).name, q=question)}]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}}
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": key})
    try:
        r = json.load(urllib.request.urlopen(req, timeout=30))
        d = json.loads(r["candidates"][0]["content"]["parts"][0]["text"])
    except Exception:
        return None
    if not d.get("general") or not d.get("text"):
        return None
    from .paths.vlm import GEMINI_EUR_PER_MTOK
    u = r.get("usageMetadata", {})
    cost = (u.get("promptTokenCount", 0) * GEMINI_EUR_PER_MTOK[0]
            + (u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0)) * GEMINI_EUR_PER_MTOK[1]) / 1e6
    return {"value": d["text"], "unit": None, "method": "general", "confidence": 0.0, "cost_eur": round(cost, 6),
            "evidence": [], "trace": [f"no path answered; {model} answered as a general question"]}


@app.post("/api/ask")
def ask(req: Ask):
    _safe(req.path)
    t = time.time()
    a = answer(req.path, req.question).to_dict()
    # The VLM never returns null: it answers "not mentioned" etc. Text from it may be a general question.
    if a["method"] == "vlm" and isinstance(a["value"], str):
        g = _general(req.path, req.question)
        if g:
            g["cost_eur"] = round(g["cost_eur"] + a["cost_eur"], 6)
            g["trace"] = [f"vlm replied '{a['value']}'"] + g["trace"]
            a = g
    if a["value"] is None:
        a["tried"] = [n.rsplit(".", 1)[1] for n in PATHS if _load(n) is not None]
        a = _general(req.path, req.question) or a
    a["time_s"] = round(time.time() - t, 3)
    a["view"] = _view_of(req.path)
    # When the question is one of Stoa's, show their answer next to ours.
    key = next((q for q in _questions().get(req.path, []) if q["question"].strip() == req.question.strip()), None)
    if key and a["method"] != "general":
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
