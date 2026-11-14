"""Vector path: answers Swiss floor-plan questions from the DXF that ships next to every PDF/PNG.
No model calls, cost 0. Evidence boxes are mapped onto the PDF page (points), fitted from room numbers
that appear in both files.

Measured on all preview questions (rules, before this module): doors 130/130, windows 130/130,
toilets 130/130, washbasins 130/130, bathtubs 112/112, showers 32/42.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np

from .. import data_root
from ..answer import Answer, Evidence

NUM = re.compile(r"^\d+\.\d\d$")
AREA = re.compile(r"^(\d+(?:\.\d+)?)\s*m")
UNIT = re.compile(r"^(?:Whg\.|Wohnung|App\.|Appartement|Appartamento|Apt\.?|Logement)\s*([A-Z])$")
OUTDOOR = re.compile(r"(?i)balk|logg|terr|balcon|sitzplatz|veranda|gartensitz")
QUOTED = re.compile(r"(?<!\w)[\"'‘«“„]([^\"'’»”“]+)[\"'’»”“](?!\w)")
COUNT_CUE = re.compile(r"(?i)how many|number of|wie viele|anzahl|combien|quant[ie]|kuinka monta|mitu|hvor mange")
LABEL_CUE = re.compile(r"(?i)label|bezeichn|beschrift|désign|denomin|etichett|named|nommée|mit dem namen")

KINDS = {  # question keyword → fixture kind
    "door": r"(?i)\bdoors?\b|türen|\btür\b|portes?\b|port[ae]\b",
    "window": r"(?i)windows?|fenster|fenêtres?|finestr",
    "toilet": r"(?i)toilets?|\bWCs?\b|toilettes?|gabinett|wc-",
    "basin": r"(?i)wash ?basins?|lavabos?|lavabi|waschbecken|lavandin",
    "tub": r"(?i)bathtubs?|badewannen?|baignoires?|vasc[ah]e? da bagno|vasche",
    "shower": r"(?i)showers?|duschen?|douches?|docc[ei]a?",
    "apartment": r"(?i)apartments?|wohnungen|appartements?|appartament|logements?|residential units",
}


@dataclass
class Room:
    poly: np.ndarray
    name: str = ""
    number: str = ""
    area: float | None = None
    text_xy: tuple = (0.0, 0.0)
    label_area: float | None = None


@dataclass
class Plan:
    rooms: list[Room] = field(default_factory=list)
    units: dict = field(default_factory=dict)        # "A" → polygon
    objects: dict = field(default_factory=dict)      # kind → [bbox in DXF units]
    to_pdf: np.ndarray | None = None                 # 2x3 affine DXF → PDF points


def _inside(pt, poly) -> bool:
    from matplotlib.path import Path as MPath  # noqa: F401  (fallback below if matplotlib absent)
    return MPath(poly).contains_point(pt)


def _pip(pt, poly) -> bool:
    x, y = pt
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1:
            inside = not inside
    return inside


def _bbox(pts) -> list[float]:
    a = np.asarray(pts)
    return [float(a[:, 0].min()), float(a[:, 1].min()), float(a[:, 0].max()), float(a[:, 1].max())]


@lru_cache(maxsize=32)
def load(stem: str) -> Plan | None:
    """stem = dataset-relative path without extension."""
    import ezdxf
    root = data_root()
    dxf = root / f"{stem}.dxf"
    if not dxf.exists():
        return None
    m = ezdxf.readfile(dxf).modelspace()
    plan = Plan()
    pts = lambda e: np.array([p[:2] for p in e.get_points()])  # noqa: E731

    # rooms: outline polygons + the texts inside them
    texts = [(e.dxf.text.strip(), (e.dxf.insert[0], e.dxf.insert[1])) for e in m.query('TEXT[layer=="ROOM_TEXT"]')]
    for e in m.query('LWPOLYLINE[layer=="ROOM_OUTLINE"]'):
        plan.rooms.append(Room(poly=pts(e)))
    for t, xy in texts:
        u = UNIT.match(t)
        if u:
            continue
        hit = [r for r in plan.rooms if _pip(xy, r.poly)]
        if not hit:
            continue
        r = min(hit, key=lambda r: abs(np.ptp(r.poly[:, 0]) * np.ptp(r.poly[:, 1])))  # innermost
        if NUM.match(t):
            r.number, r.text_xy = t, xy
        elif AREA.match(t):
            r.area = float(AREA.match(t).group(1))
        elif not r.name:
            r.name = t
    plan.rooms = [r for r in plan.rooms if r.name or r.number]
    for r in plan.rooms:  # no printed area on this plan → shoelace area of the outline
        r.label_area = r.area
        if r.area is None:
            x, y = r.poly[:, 0], r.poly[:, 1]
            r.area = round(abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1))) / 2, 2)

    # units: outlines labelled by a "Whg. A" text inside
    outlines = [pts(e) for e in m.query('LWPOLYLINE[layer=="UNIT_OUTLINE"]')]
    for t, xy in texts:
        u = UNIT.match(t)
        if u:
            for poly in outlines:
                if _pip(xy, poly):
                    plan.units[u.group(1)] = poly
    plan.objects["apartment"] = [_bbox(p) for p in outlines]

    # doors / windows: one leaf (5-pt polyline) per door, one 4-pt polyline per window
    plan.objects["door"] = [_bbox(pts(e)) for e in m.query('LWPOLYLINE[layer=="DOOR"]') if len(pts(e)) == 5]
    plan.objects["window"] = [_bbox(pts(e)) for e in m.query('LWPOLYLINE[layer=="WINDOW"]') if len(pts(e)) == 4]

    # fixtures: 69-pt = bathtub, 48-pt ellipse = toilet, or washbasin when a drain circle sits inside
    circles = [(e.dxf.center[0], e.dxf.center[1], e.dxf.radius) for e in m.query('CIRCLE[layer=="FIXTURE"]')]
    for k in ("toilet", "basin", "tub", "shower"):
        plan.objects[k] = []
    for e in m.query('LWPOLYLINE[layer=="FIXTURE"]'):
        p = pts(e)
        b = _bbox(p)
        drain = any(b[0] <= x <= b[2] and b[1] <= y <= b[3] and r < 0.06 for x, y, r in circles)
        w, h = sorted((b[2] - b[0], b[3] - b[1]))
        if len(p) == 69:
            plan.objects["tub"].append(b)
        elif len(p) == 48:
            plan.objects["basin" if drain else "toilet"].append(b)
        elif len(p) == 4 and e.closed and drain and 0.7 <= w <= 1.05 and 0.7 <= h <= 1.25:
            plan.objects["shower"].append(b)

    plan.to_pdf = _fit_pdf(stem, {r.number: r.text_xy for r in plan.rooms if r.number})
    return plan


def _fit_pdf(stem: str, anchors: dict) -> np.ndarray | None:
    """Affine DXF → PDF points from room numbers present in both (x' = a·x + c, y' = -a·y + d)."""
    pdf = data_root() / f"{stem}.pdf"
    if not pdf.exists() or len(anchors) < 2:
        return None
    import pymupdf
    words = pymupdf.open(pdf)[0].get_text("words")
    P = {w[4]: ((w[0] + w[2]) / 2, (w[1] + w[3]) / 2) for w in words if NUM.match(w[4])}
    pairs = [(anchors[k], P[k]) for k in anchors if k in P]
    if len(pairs) < 2:
        return None
    src = np.array([s for s, _ in pairs])
    dst = np.array([d for _, d in pairs])
    # least squares for a, c, d with x' = a x + c, y' = -a y + d
    A = np.zeros((2 * len(pairs), 3))
    A[0::2, 0], A[0::2, 1] = src[:, 0], 1
    A[1::2, 0], A[1::2, 2] = -src[:, 1], 1
    a, c, d = np.linalg.lstsq(A, dst.reshape(-1), rcond=None)[0]
    return np.array([[a, 0, c], [0, -a, d]])


def _ev(plan: Plan, stem: str, b, label) -> Evidence:
    if plan.to_pdf is None:
        return Evidence(file=f"{stem}.dxf", bbox=list(b), label=label)
    M = plan.to_pdf
    x0, y0 = M @ [b[0], b[3], 1]
    x1, y1 = M @ [b[2], b[1], 1]
    return Evidence(file=f"{stem}.pdf", bbox=[float(min(x0, x1)), float(min(y0, y1)), float(max(x0, x1)),
                                               float(max(y0, y1))], label=label)


def _room_ev(plan, stem, r: Room):
    return _ev(plan, stem, _bbox(r.poly), f"{r.name} {r.number} · {r.area} m²".strip())


def answer(path: str, question: str) -> Answer | None:
    if "/swiss_dwellings/" not in path:
        return None
    stem = path.rsplit(".", 1)[0]
    plan = load(stem)
    if plan is None:
        return None
    q = question
    is_area = bool(re.search(r"(?i)\barea\b|m²|m2|fläche|superficie|surface", q))
    quoted = [x for x in (x.strip() for x in QUOTED.findall(q)) if not re.match(r"^\w+$", x) or x[0].isupper()]
    unit = re.search(r"(?i)\b(?:apartment|wohnung|appartement|appartamento|logement)\s+([A-Z])\b", q)
    num = re.search(r"\b(\d+\.\d\d)\b", q)

    if is_area:
        if num:
            rs = [r for r in plan.rooms if r.number == num.group(1) and r.area is not None]
            how = f"room {num.group(1)}"
        elif unit and unit.group(1) in plan.units:
            poly = plan.units[unit.group(1)]
            rs = [r for r in plan.rooms if r.area is not None and r.number and not OUTDOOR.search(r.name)
                  and _pip(r.text_xy, poly)]
            how = f"rooms inside apartment {unit.group(1)}, excluding balconies/loggias/terraces"
        elif quoted:
            rs = [r for r in plan.rooms if r.name == quoted[0] and r.area is not None]
            how = f"rooms labelled '{quoted[0]}'"
        else:
            rs = [r for r in plan.rooms if r.area is not None and r.number and not OUTDOOR.search(r.name)]
            how = "all numbered indoor rooms"
        if not rs:
            return None
        total = round(sum(r.area for r in rs), 2)
        return Answer(value=total, unit="m2", method="vector", confidence=0.9,
                      evidence=[_room_ev(plan, stem, r) for r in rs],
                      trace=[f"{how}: {len(rs)} room(s)", " + ".join(f"{r.area}" for r in rs) + f" = {total} m²"])

    # counts
    if not COUNT_CUE.search(q):
        return None  # not a count question (e.g. "width of door …"): leave it to other paths
    kind = next((k for k, rx in KINDS.items() if re.search(rx, q)), None)
    if quoted and (kind is None or LABEL_CUE.search(q)):
        rs = [r for r in plan.rooms if r.name == quoted[0]]
        return Answer(value=len(rs), unit="count", method="vector", confidence=0.9,
                      evidence=[_room_ev(plan, stem, r) for r in rs],
                      trace=[f"rooms whose label is '{quoted[0]}': {len(rs)}"])
    if kind is None or (quoted and kind != "apartment"):
        return None  # fixture inside a named room isn't supported yet: don't guess the floor total
    objs = plan.objects.get(kind, [])
    return Answer(value=len(objs), unit="count", method="vector", confidence=0.9 if kind != "shower" else 0.7,
                  evidence=[_ev(plan, stem, b, kind) for b in objs],
                  trace=[f"{kind}: {len(objs)} drawn on the DXF layer"])
