"""Questions about a spot the user painted on the sheet ("what is this?", "area of this room?").

A mark = brush stroke points + brush radius, in evidence coordinates (PDF points, image pixels).
A point is "in the mark" when the brush covered it or the stroke loops around it.
Order: rooms under the mark (Swiss vector plans) → counts filtered to the mark → area label printed
inside the mark → VLM on the crop, with the text found inside it.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass

from . import data_root
from .answer import Answer, Evidence

AREA_Q = re.compile(r"(?i)\barea\b|m²|m2|fläche|superficie|surface|pinta-ala|how big|size")
COUNT_Q = re.compile(r"(?i)how many|number of|count|wie viele|anzahl|combien|quant[ie]|kuinka monta")
AREA_LABEL = re.compile(r"(\d+(?:[.,]\d+)?)\s*m(?:²|2)\b")
# "in this area", "here": they point at the mark, they don't ask for an area
DEICTIC = re.compile(r"(?i)\s*\b(?:in|inside|within|on|of)\s+(?:this|the marked|the highlighted|that)\s+"
                     r"(?:area|region|spot|part|zone|bit)\b|\s*\bhere\b")
PAD = 0.15  # crop margin around the mark, as a share of its size

PROMPT = """You are reading a construction drawing. The user painted over one spot of it and asks about that spot.
The image is a crop around the spot; the painted spot is in the middle. Text printed inside the spot: {text}
Question: {q}
Reply with JSON only: {{"answer": <number or short text, max 2 sentences>, "boxes": [[x0, y0, x1, y1], ...]}}
"boxes" are the regions you used, in 0-1000 coordinates relative to the image width/height."""


@dataclass
class Mark:
    page: int
    bbox: list[float]
    points: list[list[float]]
    r: float

    @classmethod
    def parse(cls, d: dict) -> "Mark":
        pts = [[float(x), float(y)] for x, y in d.get("points") or []]
        r = float(d.get("r") or 0)
        bbox = [float(v) for v in d.get("bbox") or []]
        if len(bbox) != 4 and pts:
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            bbox = [min(xs) - r, min(ys) - r, max(xs) + r, max(ys) + r]
        if len(bbox) != 4:
            raise ValueError("region needs points or a bbox")
        return cls(int(d.get("page") or 0), bbox, pts, r)

    def covers(self, x: float, y: float) -> bool:
        if not self.points:
            return self.bbox[0] <= x <= self.bbox[2] and self.bbox[1] <= y <= self.bbox[3]
        if any((x - px) ** 2 + (y - py) ** 2 <= self.r ** 2 for px, py in self.points):
            return True
        return len(self.points) > 8 and self._loops_around(x, y)

    def _loops_around(self, x: float, y: float) -> bool:
        # only when the stroke ends near where it started: a circle, not a line
        (x0, y0), (x1, y1) = self.points[0], self.points[-1]
        w, h = self.bbox[2] - self.bbox[0], self.bbox[3] - self.bbox[1]
        if (x1 - x0) ** 2 + (y1 - y0) ** 2 > (0.35 * max(w, h)) ** 2:
            return False
        inside, n = False, len(self.points)
        for i in range(n):
            (ax, ay), (bx, by) = self.points[i], self.points[(i + 1) % n]
            if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay + 1e-12) + ax:
                inside = not inside
        return inside

    def covers_box(self, b: list[float]) -> bool:
        return self.covers((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)

    def evidence(self, path: str) -> Evidence:
        return Evidence(file=path, page=self.page, bbox=list(self.bbox), label="your mark", kind="polygon",
                        polygon=[list(p) for p in self.points] or None)


def _words(path: str, m: Mark) -> list[tuple[str, list[float]]]:
    """Printed words whose centre is in the mark (vector PDFs only)."""
    if not path.lower().endswith(".pdf"):
        return []
    import pymupdf
    with pymupdf.open(data_root() / path) as doc:
        page = doc[m.page]
        words = page.get_text("words", clip=pymupdf.Rect(*m.bbox))
    return [(w[4], list(w[:4])) for w in words if m.covers_box(w[:4])]


def _rooms(path: str, q: str, m: Mark) -> Answer | None:
    """Swiss plans: the rooms whose label or centre is under the mark."""
    if "/swiss_dwellings/" not in path or not (AREA_Q.search(q) or re.search(r"(?i)\broom|zimmer|pièce|stanza", q)):
        return None
    from .paths import vector
    stem = path.rsplit(".", 1)[0]
    plan = vector.load(stem)
    if plan is None or plan.to_pdf is None:
        return None
    M = plan.to_pdf
    hits = []
    for r in plan.rooms:
        label = M @ [r.text_xy[0], r.text_xy[1], 1] if r.number else None
        ev = vector._room_ev(plan, stem, r)
        if (label is not None and m.covers(*label)) or m.covers_box(ev.bbox):
            hits.append((r, ev))
    if not hits:
        return None
    total = round(sum(r.area or 0 for r, _ in hits), 2)
    names = ", ".join(f"{r.name} {r.number}".strip() for r, _ in hits)
    if AREA_Q.search(q):
        return Answer(value=total, unit="m2", method="region", confidence=0.9, evidence=[e for _, e in hits],
                      trace=[f"rooms under your mark: {names}",
                             " + ".join(str(r.area) for r, _ in hits) + f" = {total} m²"])
    return Answer(value=names, unit=None, method="region", confidence=0.9, evidence=[e for _, e in hits],
                  trace=[f"rooms under your mark: {names}"])


def _count(path: str, view: str, q: str, m: Mark, on_step) -> Answer | None:
    """Ask the whole sheet, keep only the hits inside the mark."""
    if not COUNT_Q.search(q):
        return None
    from .router import answer
    a = answer(path, q, on_step)
    boxed = [e for e in a.evidence if len(e.bbox) == 4 and e.file == view]
    if a.unit != "count" or not boxed:
        return None
    inside = [e for e in boxed if m.covers_box(e.bbox)]
    return Answer(value=len(inside), unit="count", method=f"{a.method}+region", confidence=a.confidence,
                  cost_eur=a.cost_eur, evidence=inside,
                  trace=a.trace + [f"{len(inside)} of {len(boxed)} on the sheet are inside your mark"])


def _label(path: str, q: str, words) -> Answer | None:
    """An area printed inside the mark, e.g. '15.90 m²' (may be split over two words)."""
    if not AREA_Q.search(q):
        return None
    for i, (w, b) in enumerate(words):
        nxt = words[i + 1][0] if i + 1 < len(words) else ""
        hit = AREA_LABEL.match(w) or AREA_LABEL.match(f"{w} {nxt}")
        if hit:
            v = float(hit.group(1).replace(",", "."))
            return Answer(value=v, unit="m2", method="region", confidence=0.8,
                          evidence=[Evidence(file=path, bbox=b, label=f"{v} m²", kind="text")],
                          trace=[f"area label printed inside your mark: {w} {nxt}".strip()])
    return None


def _vlm(path: str, q: str, m: Mark, words) -> Answer | None:
    from .paths.vlm import _image, _parse
    from .vlm_backends import get
    name = os.environ.get("SITELENS_VLM") or ("gemini" if os.environ.get("GEMINI_API_KEY") else None)
    if not name or not path.lower().endswith((".pdf", ".png", ".jpg", ".jpeg")):
        return None
    backend = get(name)
    x0, y0, x1, y1 = m.bbox
    px, py = (x1 - x0) * PAD + m.r, (y1 - y0) * PAD + m.r
    clip = [x0 - px, y0 - py, x1 + px, y1 + py]
    if path.lower().endswith(".pdf"):
        import pymupdf
        img, bounds = _image(path, pymupdf.Rect(*clip))
    else:
        from PIL import Image
        full = Image.open(data_root() / path).convert("RGB")
        c = [max(0, int(clip[0])), max(0, int(clip[1])), min(full.width, int(clip[2])), min(full.height, int(clip[3]))]
        img, bounds = full.crop(c), (c[0], c[1], c[2] - c[0], c[3] - c[1])
    text = " ".join(w for w, _ in words)[:600] or "none"
    raw, cost = backend.ask(img, PROMPT.format(q=q, text=text))
    value, boxes = _parse(raw)
    if value is None:
        value = raw.strip()[:300] or None
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    bx, by, bw, bh = bounds
    who = f"{name} · {backend.model()}"
    ev = [Evidence(file=path, bbox=[bx + b[0] / 1000 * bw, by + b[1] / 1000 * bh,
                                    bx + b[2] / 1000 * bw, by + b[3] / 1000 * bh], label=who) for b in boxes]
    return Answer(value=value, unit=None, method="vlm", confidence=0.4, cost_eur=round(cost, 6), evidence=ev,
                  trace=[f"{who} read the crop around your mark ({img.width}x{img.height} px)",
                         f"text inside the mark: {text[:120]}"])


def answer(path: str, question: str, region: dict, on_step=None, view: str | None = None) -> Answer:
    """view = the file the mark was drawn on (an IFC model's rendered plan); defaults to path."""
    view = view or path
    m = Mark.parse(region)
    whole = DEICTIC.sub("", question).strip() or question  # the question as asked of the whole sheet

    def step(kind: str, text: str) -> None:
        if on_step:
            on_step({"kind": kind, "path": "region", "text": text, "t": 0})

    step("try", "Looking only at the spot you marked.")
    words = _words(view, m)
    if words:
        step("trace", f"Text inside your mark: {' '.join(w for w, _ in words)[:120]}")
    a = _count(path, view, whole, m, on_step) or _rooms(view, whole, m) or _label(view, whole, words) \
        or _vlm(view, question, m, words)
    if a is None:
        a = Answer(value=None, unit=None, method="region", confidence=0.0,
                   trace=["nothing readable under your mark and no VLM configured"])
    a.evidence = [m.evidence(view)] + a.evidence
    step("found", f"Answered from your mark ({a.method}).")
    return a
