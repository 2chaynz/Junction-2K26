"""Demo server: the web UI talks to the router through this. See CONTRACT.md → Demo API.

  STOA_DATA=/path/to/dataset python -m sitelens.server   →  http://localhost:8000
"""
from __future__ import annotations

import collections
from hashlib import sha256
import io
import os
import json
import random
import time
from functools import lru_cache
from pathlib import Path

import fitz  # PyMuPDF
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import data_root


WEB = Path(__file__).resolve().parent.parent / "web" / "dist"
IMAGE_EXT = {".png", ".jpg", ".jpeg"}

app = FastAPI(title="SiteLens")

# A public URL must not be able to burn the Gemini key: per-IP sliding window on the endpoints that can call a
# paid model. SITELENS_RATE = requests per minute per IP (0 disables; default 30). Static files and /api/file are free.
_RATE = int(os.environ.get("SITELENS_RATE", "30"))
_hits: dict[str, collections.deque] = collections.defaultdict(collections.deque)
_TRUST_PROXY = os.environ.get("SITELENS_TRUST_PROXY") == "1"
_PAID = ("/api/ask", "/api/export", "/api/takeoff", "/api/clarify")


@app.middleware("http")
async def rate_limit(request, call_next):
    if _RATE > 0 and request.method == "POST" and request.url.path.startswith(_PAID):
        # The client controls X-Forwarded-For: only trust it behind our own proxy (SITELENS_TRUST_PROXY=1).
        ip = request.client.host if request.client else "?"
        if _TRUST_PROXY and request.headers.get("x-forwarded-for"):
            ip = request.headers["x-forwarded-for"].split(",")[-1].strip()   # last hop = the one our proxy saw
        q, now = _hits[ip], time.time()
        while q and now - q[0] > 60:
            q.popleft()
        if len(_hits) > 5000:  # drop idle visitors so the table can't grow without bound
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > 60]:
                _hits.pop(k, None)
        if len(q) >= _RATE:
            return JSONResponse({"detail": f"rate limit: {_RATE} questions per minute per visitor, try again in a moment"},
                                status_code=429, headers={"Retry-After": "20"})
        q.append(now)
    return await call_next(request)


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


def _model_of(path: str) -> str | None:
    if path.endswith(".ifc"):
        return path
    prefix, sep, _ = path.rpartition("_plan-")
    if sep and path.startswith(("data/ifc_models/", "data/ifc_bench/")):
        model = prefix + ".ifc"
        if (data_root() / model).is_file():
            return model
    return None


@app.get("/api/drawings")
def drawings():
    out = []
    for path, qs in sorted(_questions().items()):
        out.append({"path": path, "source": path.split("/")[1], "view": _view_of(path), "model": _model_of(path),
                    "questions": [{"question": q["question"], "answer": q["answer"], "unit": q["unit"],
                                   "type": q["type"]} for q in qs]})
    return out


@app.get("/api/original")
def original(path: str):
    if path not in _questions():
        raise HTTPException(404, "drawing not found")
    p = _safe(path)
    if p.suffix.lower() in {".pdf", ".png", ".jpg", ".jpeg"}:
        return FileResponse(p)
    return FileResponse(p, media_type="application/octet-stream", filename=p.name)


@app.get("/api/file")
def file(path: str, page: int = 0, scale: float = 1.0, clip: str | None = None, pad: float = 0.5):
    """PNG of a drawing page. scale=1 → 1 px per PDF point (bbox coords); images: 1 px per pixel.
    clip=x0,y0,x1,y1 (evidence bbox coords) → only that region, padded by `pad` × its size (T43 proof strip)."""
    p = _safe(path)
    scale = max(0.05, min(scale, 4.0))
    if clip:
        return _crop(p, page, scale, clip, pad)
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


def _crop(p: Path, page: int, scale: float, clip: str, pad: float):
    try:
        x0, y0, x1, y1 = (float(v) for v in clip.split(","))
    except ValueError:
        raise HTTPException(400, "clip must be x0,y0,x1,y1")
    w, h = max(x1 - x0, 8), max(y1 - y0, 8)
    pad = max(0.0, min(pad, 3.0))
    r = (x0 - w * pad, y0 - h * pad, x1 + w * pad, y1 + h * pad)
    if p.suffix.lower() in IMAGE_EXT:
        from PIL import Image
        im = Image.open(p).convert("RGB")
        box = (max(0, int(r[0])), max(0, int(r[1])), min(im.width, int(r[2]) + 1), min(im.height, int(r[3]) + 1))
        im = im.crop(box)
        if scale != 1.0:
            im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))))
        buf = io.BytesIO()
        im.save(buf, "PNG")
        return Response(buf.getvalue(), media_type="image/png")
    if p.suffix.lower() == ".pdf":
        with fitz.open(p) as doc:
            if not 0 <= page < len(doc):
                raise HTTPException(404, "no such page")
            pg = doc[page]
            rr = fitz.Rect(r) & pg.rect   # render clip uses the displayed (rotated) page space, like our bboxes
            pix = pg.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=rr, alpha=False)
            return Response(pix.tobytes("png"), media_type="image/png")
    raise HTTPException(415, f"no crop for {p.suffix}")


@app.get("/api/ifc")
def ifc(path: str, request: Request):
    """Raw IFC bytes for the in-browser 3D viewer."""
    p = _safe(path)
    if p.suffix.lower() != ".ifc":
        raise HTTPException(400, "not an IFC file")
    content = p.read_bytes()
    etag = f'"{sha256(content).hexdigest()}"'
    headers = {"Cache-Control": "private, no-cache", "ETag": etag}
    validators = {value.strip().removeprefix("W/") for value in request.headers.get("if-none-match", "").split(",")}
    if etag in validators or "*" in validators:
        return Response(status_code=304, headers=headers)
    return Response(content, media_type="application/octet-stream", headers=headers)


VITORIA = "data/ifc_models/bimspeed-vitoria_ald26-"


@app.get("/api/demo/revisions")
def demo_revisions():
    """Compare element IDs in the Vitoria baseline and renovation proposal."""
    import ifcopenshell
    import ifcopenshell.geom
    from ifcopenshell.util.element import get_container

    try:
        paths = [_safe(VITORIA + state + ".ifc") for state in ("before", "project")]
    except (HTTPException, RuntimeError) as error:
        raise HTTPException(404, "Point STOA_DATA at the full Junction dataset to load Vitoria.") from error

    revisions = []
    for path in paths:
        model = ifcopenshell.open(path)
        elements = {}
        for element in model.by_type("IfcElement"):
            if not element.Representation or element.is_a("IfcFeatureElement"):
                continue
            level = get_container(element, ifc_class="IfcBuildingStorey")
            kind = element.is_a()
            if element.is_a("IfcWall"):
                kind = "Insulation walls" if "LKS_ETICS" in (element.Name or "") else "Walls"
            else:
                kind = {
                    "IfcFlowSegment": "MEP segments", "IfcFlowFitting": "MEP fittings",
                    "IfcBuildingElementProxy": "Other modeled components",
                    "IfcDoor": "Doors", "IfcWindow": "Windows", "IfcRoof": "Roofs",
                }.get(kind, kind.removeprefix("Ifc"))
            elements[element.GlobalId] = (element, {
                "guid": element.GlobalId, "kind": kind, "name": element.Name or kind,
                "level": level.Name if level else None,
            })
        revisions.append((model, elements))
    (_, before), (_, after) = revisions
    settings = ifcopenshell.geom.settings()
    changes = []
    for change, current, other in (("added", after, before), ("removed", before, after)):
        for guid in current.keys() - other.keys():
            element, data = current[guid]
            dimensions = None
            try:
                shape = ifcopenshell.geom.create_shape(settings, element)
                xyz = shape.geometry.verts
                if xyz:
                    dimensions = [round(max(xyz[i::3]) - min(xyz[i::3]), 3) for i in range(3)]
            except RuntimeError:
                pass
            changes.append({**data, "change": change, "dimensions": dimensions})
    return sorted(changes, key=lambda row: (row["kind"], row["name"], row["guid"]))



@app.get("/api/takeoff")
def takeoff_list(path: str, format: str = "json"):
    """Every door, window, wall, column, beam, slab, stair grouped by type and size. format=csv downloads it."""
    from .takeoff import takeoff, to_csv
    _safe(path)
    t = takeoff(path)
    if format == "csv":
        name = (Path(path).stem + "-takeoff.csv").encode("ascii", "ignore").decode().replace('"', "")
        # BOM so Excel opens UTF-8 (×, umlauts) correctly
        return Response("﻿" + to_csv(t), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{name}"'})
    return t


class Ask(BaseModel):
    path: str
    question: str
    region: dict | None = None   # T49: brush mark on the shown sheet {page, bbox, points, r}
    history: list[dict] | None = None   # T75: earlier turns [{question, answer}], oldest first
    related: list[str] | None = None    # T75: other sheets of the project, nearest first


def _related(path: str, related: list[str] | None) -> list[str]:
    """Project sheets the UI sent, limited to drawings the dataset lists. The sheet's own model goes first."""
    qs = _questions()
    out = [m for m in [_model_of(path)] if m and m != path]
    if path.split("/")[1] in ("swiss_dwellings", "cubicasa5k"):   # one building per file: no shared project
        return out
    out += [r for r in related or [] if r in qs and r != path]
    return list(dict.fromkeys(out))


def _ask(path: str, question: str, on_step=None, region: dict | None = None,
         history: list[dict] | None = None, related: list[str] | None = None) -> dict:
    t = time.time()
    if region:
        return _ask_region(path, question, region, on_step, t)

    def step(kind: str, text: str) -> None:
        if on_step:
            on_step({"kind": kind, "path": "", "text": text, "t": round(time.time() - t, 3)})

    from . import clarify, pipeline
    # When the question is one of Stoa's, show their answer next to ours (and never ask back).
    key = next((q for q in _questions().get(path, []) if q["question"].strip() == question.strip()), None)
    q, cost = (question, 0.0) if key else pipeline.followup(question, history)
    if q != question:
        step("followup", f'A follow-up. I read it as: "{q}"')
    step("understand", clarify.understand(q))
    c = None if key or q != question else clarify.check(path, q)
    general = bool(c and c.get("general"))
    if c and not general:
        step("clarify", f"{c['why']} Rather than guess, I'll ask.")
        return {"value": None, "unit": None, "method": "clarify", "confidence": 0.0, "cost_eur": c["cost_eur"],
                "evidence": [], "trace": [c["why"]], "clarify": {"ask": c["ask"], "options": c["options"]},
                "time_s": round(time.time() - t, 3), "view": _view_of(path)}
    a = pipeline.run(path, q, on_step, history, _related(path, related), stoa=key is not None, view_of=_view_of,
                     general=general, asked=question, cost=cost + (c["cost_eur"] if c else 0.0))
    a["time_s"] = round(time.time() - t, 3)
    if key and a["method"] not in ("general", "web"):
        from eval.score import grade
        a["check"] = {"expected": key["answer"], "unit": key["unit"], "match": grade(key, a["value"])}
        a.setdefault("reasoning", []).append({"tier": "check", "src": [], "text":
            f"Stoa's answer key: {key['answer']} {key['unit'] or ''}".strip() + (" · match" if a["check"]["match"] else " · no match")})
        step("check", f"Checking against Stoa's answer key: {key['answer']} {key['unit'] or ''}".strip())
    return a


def _ask_region(path: str, question: str, region: dict, on_step, t: float) -> dict:
    """A painted mark makes "this" clear: no clarify, no answer key (Stoa's questions are whole-sheet)."""
    from .region import answer as region_answer
    try:
        view = _view_of(path)
        a = region_answer(path, question, region, on_step, view=view).to_dict()
    except (ValueError, TypeError) as e:
        raise HTTPException(400, f"bad region: {e}")
    a["time_s"], a["view"] = round(time.time() - t, 3), view
    return a


@app.post("/api/ask")
def ask(req: Ask):
    _safe(req.path)
    return _ask(req.path, req.question, region=req.region, history=req.history, related=req.related)


@app.post("/api/ask/stream")
def ask_stream(req: Ask):
    """NDJSON: one {"step": {...}} line per reasoning step as it happens, then {"answer": {...}}."""
    import queue
    import threading
    _safe(req.path)
    q: queue.Queue = queue.Queue()
    END = object()

    def work():
        try:
            q.put({"answer": _ask(req.path, req.question, lambda s: q.put({"step": s}), req.region, req.history, req.related)})
        except Exception as e:
            q.put({"error": repr(e)})
        q.put(END)

    threading.Thread(target=work, daemon=True).start()

    def lines():
        while (m := q.get()) is not END:
            yield json.dumps(m, ensure_ascii=False, default=str) + "\n"

    return StreamingResponse(lines(), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class Export(BaseModel):
    path: str
    question: str
    answer: dict | None = None   # the /api/ask result to export; recomputed when omitted


@app.post("/api/export")
def export(req: Export):
    """Answer as a redlined PDF (evidence → PDF annotations). Opens in Bluebeam / Acrobat as comments."""
    from .export import redline
    _safe(req.path)
    ans = req.answer or _ask(req.path, req.question)
    try:
        pdf = redline(req.path, req.question, ans)
    except ValueError as e:
        raise HTTPException(400, str(e))
    name = req.path.rsplit("/", 1)[-1].rsplit(".", 1)[0] + "-sitelens-markup.pdf"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


class Shape(BaseModel):
    path: str
    page: int = 0
    kind: str = "length"            # measure: length | area | count
    points: list[list[float]] = []  # drawing coords (bbox units)
    label: str = ""
    length: str = ""                # calibrate: real length (12'-6", 3.5 m) or area (15.9 m2)
    known_id: str | None = None     # calibrate against a known dimension (this or another sheet)
    scale_id: str | None = None     # choose: answer to the scale question


def _m(fn, *a):
    from . import measure
    try:
        return getattr(measure, fn)(*a)
    except (ValueError, LookupError) as e:
        raise HTTPException(400, str(e))


@app.get("/api/measure")
def measure_get(path: str, page: int = 0):
    """Scale (with references), the question back when there is none, auto takeoff, stored manual takeoffs."""
    _safe(path)
    r = _m("resolve", path, page)
    r["auto"] = _m("auto", path, page)
    return r


@app.post("/api/measure")
def measure_add(req: Shape):
    _safe(req.path)
    return _m("add_measurement", req.path, req.page, req.kind, req.points, req.label)


@app.delete("/api/measure")
def measure_del(path: str, id: str):
    _safe(path)
    return {"deleted": _m("delete_measurement", path, id)}


@app.post("/api/measure/calibrate")
def measure_calibrate(req: Shape):
    _safe(req.path)
    return _m("calibrate", req.path, req.page, req.points, req.length, req.known_id, req.label)


@app.post("/api/measure/scale")
def measure_scale(req: Shape):
    """Pick a candidate scale (scale_id) or, with none, forget the stored one."""
    _safe(req.path)
    if req.scale_id:
        return _m("choose", req.path, req.page, req.scale_id)
    _m("reset_scale", req.path, req.page)
    return {"reset": True}


class VlmModel(BaseModel):
    model: str


@app.get("/api/vlm")
def vlm_status():
    """Active VLM and the newest model of its family (T29). Never fails: a check error means latest=null."""
    from .vlm_backends import latest
    try:
        return latest.status()
    except Exception as e:
        backend, model = latest.current()
        return {"backend": backend, "current": model, "latest": None, "available": [], "error": str(e)}


@app.post("/api/vlm")
def vlm_use(req: VlmModel):
    """Switch the VLM model for this server process only; .env is untouched (CLI: --upgrade saves it)."""
    from .vlm_backends import latest
    try:
        return latest.use(req.model)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/random")
def surprise():
    qs = _questions()
    path = random.choice(list(qs))
    return {"path": path, "question": random.choice(qs[path])["question"]}


class SessionBody(BaseModel):
    project: str
    id: str
    msgs: list[dict]
    title: str | None = None


@app.get("/api/sessions")
def sessions_list(project: str | None = None):
    from . import sessions
    return sessions.list_sessions(project) if project else sessions.overview()


@app.get("/api/session")
def session_get(project: str, id: str):
    from . import sessions
    s = sessions.get(project, id)
    if s is None:
        raise HTTPException(404, "session not found")
    return s


@app.put("/api/session")
def session_put(req: SessionBody):
    from . import sessions
    try:
        return sessions.put(req.project, req.id, req.msgs, req.title)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.delete("/api/session")
def session_delete(project: str, id: str):
    from . import sessions
    return {"deleted": sessions.delete(project, id)}


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
