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
from itertools import pairwise
from math import isfinite

from . import data_root
from .answer import Answer, Evidence

AREA_Q = re.compile(r"(?i)\barea\b|m²|m2|fläche|superficie|surface|pinta-ala|how big|size")
COUNT_Q = re.compile(r"(?i)how many|number of|count|wie viele|anzahl|combien|quant[ie]|kuinka monta")
AREA_LABEL = re.compile(r"(\d+(?:[.,]\d+)?)\s*m(?:²|2)\b", re.I)
# "in this area", "here": they point at the mark, they don't ask for an area
DEICTIC = re.compile(r"(?i)\s*\b(?:in|inside|within|on|of)\s+(?:this|the marked|the highlighted|that)\s+"
                     r"(?:area|region|spot|part|zone|bit)\b|\s*\bhere\b")
# "what is this?", "which room?": the only questions a room label alone answers
IDENTITY_Q = re.compile(r"(?i)^\W*(?:what(?:'s| is)? (?:this|that|it)\b|what(?:'s| is)?\W*$|what room|which room|"
                        r"what kind of room|was ist (?:das|hier)|welcher raum|qu'est-ce|quelle pi[eè]ce|"
                        r"che cos|che stanza|mik[aä] (?:t[aä]m[aä]|huone))")
PAD = 0.15  # crop margin around the mark, as a share of its size

PROMPT = """You are reading a construction drawing. The user painted over one spot of it and asks about that spot.
The yellow highlight or outline marks the spot. Use only features in that region. Text printed inside the spot: {text}
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
        page = int(d.get("page") or 0)
        if page < 0 or r < 0 or not all(isfinite(v) for v in [*bbox, r]):
            raise ValueError("invalid page or brush bounds")
        if any(not isfinite(v) for point in pts for v in point):
            raise ValueError("invalid brush point")
        if bbox[0] > bbox[2] or bbox[1] > bbox[3]:
            raise ValueError("inverted brush bounds")
        return cls(page, bbox, pts, r)

    def covers(self, x: float, y: float) -> bool:
        if not self.points:
            return self.bbox[0] <= x <= self.bbox[2] and self.bbox[1] <= y <= self.bbox[3]
        if any((x - px) ** 2 + (y - py) ** 2 <= self.r ** 2 for px, py in self.points):
            return True
        for (ax, ay), (bx, by) in pairwise(self.points):
            dx, dy = bx - ax, by - ay
            length_sq = dx * dx + dy * dy
            if length_sq == 0:
                continue
            t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / length_sq))
            if (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= self.r ** 2:
                return True
        return self.loops and self._loops_around(x, y)

    @property
    def loops(self) -> bool:
        if len(self.points) <= 8:
            return False
        (x0, y0), (x1, y1) = self.points[0], self.points[-1]
        w, h = self.bbox[2] - self.bbox[0], self.bbox[3] - self.bbox[1]
        return (x1 - x0) ** 2 + (y1 - y0) ** 2 <= (0.35 * max(w, h)) ** 2

    def _loops_around(self, x: float, y: float) -> bool:
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
        if m.page >= len(doc):
            raise ValueError("region page does not exist")
        page = doc[m.page]
        words = page.get_text("words", clip=pymupdf.Rect(*m.bbox))
    return [(w[4], list(w[:4])) for w in words if m.covers_box(w[:4])]


def _ocr_words(path: str, m: Mark) -> list[tuple[str, list[float]]]:
    """Scans (images, PDFs without a text layer): OCR only the marked crop, at every rotation."""
    from PIL import Image
    try:
        from . import ocr
    except ImportError:
        return []
    pad = m.r
    x0, y0, x1, y1 = m.bbox[0] - pad, m.bbox[1] - pad, m.bbox[2] + pad, m.bbox[3] + pad
    if path.lower().endswith(".pdf"):
        import pymupdf
        z = 3  # PDF points → pixels: small scanned labels need the resolution
        with pymupdf.open(data_root() / path) as doc:
            pix = doc[m.page].get_pixmap(matrix=pymupdf.Matrix(z, z), clip=pymupdf.Rect(x0, y0, x1, y1))
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        x0, y0 = pix.x / z, pix.y / z
    elif path.lower().endswith((".png", ".jpg", ".jpeg")):
        z = 1
        with Image.open(data_root() / path) as full:
            x0, y0 = max(0, int(x0)), max(0, int(y0))
            x1, y1 = min(full.width, int(x1)), min(full.height, int(y1))
            if x1 - x0 < 4 or y1 - y0 < 4:  # mark outside the image
                return []
            img = full.crop((x0, y0, x1, y1)).copy()
    else:
        return []
    try:
        read = ocr.read_crop(img)
    except Exception:  # rapidocr missing or failed: the VLM still answers
        return []
    out = []
    for text, _, b in read:
        box = [x0 + b[0] / z, y0 + b[1] / z, x0 + b[2] / z, y0 + b[3] / z]
        if m.covers_box(box):
            out.append((text, box))
    return out


def _named(path: str, q: str, words, page: int, how: str) -> Answer | None:
    """A room label inside the mark ("MH 1", "Küche") names the room; an area label next to it adds the m²."""
    if not IDENTITY_Q.search(q):
        return None
    from .ocr import room_type
    rooms = [(w.strip(" /\\|-_.:"), b, t) for w, b in words if (t := room_type(w, mirrored=how == "ocr"))]
    if not rooms:
        return None
    w, b, t = rooms[0]
    ev = [Evidence(file=path, page=page, bbox=b, label=f"{t}: {w}", kind="text")]
    value = f"{t[0].upper()}{t[1:]} ({w})"
    area = next(((x, bb, h) for x, bb in words if (h := AREA_LABEL.search(x))), None)
    if area:
        value += f" · {float(area[2].group(1).replace(',', '.'))} m²"
        ev.append(Evidence(file=path, page=page, bbox=area[1], label=area[0], kind="text"))
    return Answer(value=value, unit=None, method=how, confidence=0.75, evidence=ev,
                  trace=[f"room label inside your mark: '{w}' = {t}"] + ([f"area label: {area[0]}"] if area else []))


def _rooms(path: str, q: str, m: Mark) -> Answer | None:
    """Swiss plans: the rooms whose label or centre is under the mark."""
    if m.page != 0 or "/swiss_dwellings/" not in path or not (AREA_Q.search(q) or re.search(r"(?i)\broom|zimmer|pièce|stanza", q)):
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
    boxed = [e for e in a.evidence if len(e.bbox) == 4 and e.file == view and e.page == m.page]
    if a.unit != "count" or not boxed:
        return None
    inside = [e for e in boxed if m.covers_box(e.bbox)]
    return Answer(value=len(inside), unit="count", method=f"{a.method}+region", confidence=a.confidence,
                  cost_eur=a.cost_eur, evidence=inside,
                  trace=a.trace + [f"{len(inside)} of {len(boxed)} on the sheet are inside your mark"])


def _label(path: str, q: str, words, page: int) -> Answer | None:
    """An area printed inside the mark, e.g. '15.90 m²' (may be split over two words)."""
    if not AREA_Q.search(q):
        return None
    for i, (w, b) in enumerate(words):
        nxt = words[i + 1][0] if i + 1 < len(words) else ""
        hit = AREA_LABEL.search(w) or AREA_LABEL.search(f"{w} {nxt}")
        if hit:
            v = float(hit.group(1).replace(",", "."))
            return Answer(value=v, unit="m2", method="region", confidence=0.8,
                          evidence=[Evidence(file=path, page=page, bbox=b, label=f"{v} m²", kind="text")],
                          trace=[f"area label printed inside your mark: {w} {nxt}".strip()])
    return None


def _vlm(path: str, q: str, m: Mark, words) -> Answer | None:
    from PIL import Image, ImageDraw
    from .paths.vlm import MAX_SIDE, _parse
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
        with pymupdf.open(data_root() / path) as doc:
            page = doc[m.page]
            rect = pymupdf.Rect(*clip) & page.rect
            if rect.is_empty:
                return None
            scale = MAX_SIDE / max(rect.width, rect.height)
            pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=rect)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        bounds = (pix.x / scale, pix.y / scale, pix.width / scale, pix.height / scale)
    else:
        full = Image.open(data_root() / path).convert("RGB")
        c = [max(0, int(clip[0])), max(0, int(clip[1])), min(full.width, int(clip[2])), min(full.height, int(clip[3]))]
        if c[0] >= c[2] or c[1] >= c[3]:
            return None
        img, bounds = full.crop(c), (c[0], c[1], c[2] - c[0], c[3] - c[1])
    bx, by, bw, bh = bounds
    sx, sy = img.width / bw, img.height / bh
    overlay = Image.new("RGBA", img.size)
    draw = ImageDraw.Draw(overlay)
    color = (255, 196, 0, 100)
    if m.points:
        points = [((x - bx) * sx, (y - by) * sy) for x, y in m.points]
        radius = max(1, round(m.r * sx))
        if m.loops:
            draw.polygon(points, fill=color)
        if len(points) > 1:
            draw.line(points, fill=color, width=2 * radius)
        for x, y in points:
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)
    else:
        draw.rectangle(((x0 - bx) * sx, (y0 - by) * sy, (x1 - bx) * sx, (y1 - by) * sy), fill=color)
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    text = " ".join(w for w, _ in words)[:600] or "none"
    raw, cost = backend.ask(img, PROMPT.format(q=q, text=text))
    value, boxes = _parse(raw)
    if value is None:
        value = raw.strip()[:300] or None
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    who = f"{name} · {backend.model()}"
    ev = [Evidence(file=path, page=m.page, bbox=[bx + b[0] / 1000 * bw, by + b[1] / 1000 * bh,
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
    words, how = _words(view, m), "region"
    if words:
        step("trace", f"Text inside your mark: {' '.join(w for w, _ in words)[:120]}")
    a = _count(path, view, whole, m, on_step) or _rooms(view, whole, m)
    if a is None and not words:
        words, how = _ocr_words(view, m), "ocr"
        if words:
            step("trace", f"OCR of your mark (every rotation, on this computer, €0): {' '.join(w for w, _ in words)[:120]}")
    if a is None:
        a = _label(view, whole, words, m.page) or _named(view, whole, words, m.page, how) \
            or _vlm(view, question, m, words)
        if a is not None and a.method == "region" and how == "ocr":
            a.method = "ocr"
    if a is None:
        a = Answer(value=None, unit=None, method="region", confidence=0.0,
                   trace=["nothing readable under your mark and no VLM configured"])
    a.evidence = [m.evidence(view)] + a.evidence
    step("found", f"Answered from your mark ({a.method}).")
    return a
