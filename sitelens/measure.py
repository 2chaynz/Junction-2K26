"""Measure: area and length takeoffs on a drawing with a known scale (Bluebeam-style).

Scale = metres per drawing unit. Drawing units are the Evidence bbox units: PDF points (display orientation)
for PDFs, pixels for images. Where a scale comes from is kept as references (file, page, box, text), stored
per drawing and shown to the user.

Scale sources, best first: a stored choice or calibration > DXF geometry in metres > same drawing in another
file (PNG <-> PDF) > scale note on the sheet ("1:100", 1/4" = 1'-0", nearest the measured region) > scale bar
on a scan (OCR'd tick numbers). None → a question back, with options taken from this drawing (area labels)
and other sheets of the same project (schedule dimensions, scale notes, sheet size).
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import time
import uuid
from dataclasses import asdict, dataclass, field
from functools import lru_cache
from pathlib import Path

from . import data_root

IN = 0.0254
PT = IN / 72  # metres of paper per PDF point
FT = 0.3048
IMAGE_EXT = {".png", ".jpg", ".jpeg"}
RATIOS = {1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 1000, 1250, 2000, 2500, 5000}

METRIC = re.compile(r"(?<![\d/:.,])1\s*:\s*(\d{1,4})(?![\d:.,])")
# paper = real, e.g. 1/4" = 1'-0", 1" = 40'-0", 3" = 1'-0"
IMPERIAL = re.compile(
    r"(?<![\d/])((?:\d+\s+)?\d+/\d+|\d+(?:\.\d+)?)\s*[\"″”]\s*=\s*(\d+)\s*['′’]\s*(?:-?\s*(\d+(?:\s+\d+/\d+)?)\s*[\"″”]?)?")
AREA_LABEL = re.compile(r"(\d+(?:[.,]\d+)?)\s*(m²|m2|sq\.?\s*ft|sf|ft²)", re.I)
UNIT_WORD = {"FEET": FT, "FT": FT, "FOOT": FT, "METERS": 1.0, "METRES": 1.0, "METER": 1.0, "METRE": 1.0, "M": 1.0,
             "METRI": 1.0, "METRIÄ": 1.0, "METER.": 1.0}


@dataclass
class Ref:
    """Where a scale or a known dimension was read. file may be another sheet of the project."""
    file: str
    page: int = 0
    bbox: list[float] = field(default_factory=list)
    text: str = ""
    kind: str = "note"  # dxf | note | bar | sibling | label | schedule | project | manual


@dataclass
class Scale:
    id: str
    m_per_unit: float
    source: str          # stored | dxf | sibling | note | bar | sheet_size | manual
    text: str            # plain words, e.g. 1:200 from the title block note
    confidence: float
    refs: list[Ref] = field(default_factory=list)
    applies: list[float] | None = None   # region of the sheet the scale belongs to (viewport), None = whole sheet
    agree: str = ""      # second method that confirms it, in words


@dataclass
class Known:
    """A dimension we already know, to calibrate against: draw over it on the sheet."""
    id: str
    text: str
    value: float         # metres or m²
    unit: str            # m | m2
    ref: Ref


# ---------- units ----------

def _frac(s: str) -> float:
    s = s.strip()
    total = 0.0
    for part in s.split():
        if "/" in part:
            a, b = part.split("/")
            total += float(a) / float(b)
        else:
            total += float(part)
    return total


def parse_length(s: str) -> float | None:
    """'12\\'-6"', "5'-10 3/8\\"", '3.5 m', '350 cm', '12 ft', '18 in' → metres."""
    s = s.strip().replace("″", '"').replace("′", "'").replace("’", "'").replace("”", '"').replace(",", ".")
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*'\s*-?\s*(?:((?:\d+\s+)?\d+/\d+|\d+(?:\.\d+)?)\s*\"?)?", s)
    if m:
        return float(m.group(1)) * FT + (_frac(m.group(2)) * IN if m.group(2) else 0)
    m = re.fullmatch(r"((?:\d+\s+)?\d+/\d+|\d+(?:\.\d+)?)\s*(\"|in|inch|inches)", s, re.I)
    if m:
        return _frac(m.group(1)) * IN
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(mm|cm|m|km|ft|feet|foot)?", s, re.I)
    if m:
        k = {"mm": 0.001, "cm": 0.01, "m": 1, "km": 1000, "ft": FT, "feet": FT, "foot": FT}[(m.group(2) or "m").lower()]
        return float(m.group(1)) * k
    return None


def ft_in(m: float) -> str:
    inches = m / IN
    ft, rest = divmod(inches, 12)
    eighths = round(rest * 8)
    if eighths == 96:
        ft, eighths = ft + 1, 0
    whole, frac = divmod(eighths, 8)
    f = f" {frac // math.gcd(frac, 8)}/{8 // math.gcd(frac, 8)}" if frac else ""
    return f"{int(ft)}'-{int(whole)}{f}\""


def fmt_len(m: float) -> str:
    return f"{m:.2f} m ({ft_in(m)})"


def fmt_area(m2: float) -> str:
    return f"{m2:.2f} m² ({m2 / FT / FT:.1f} ft²)"


def _ratio_text(m_per_unit: float, image: bool) -> str:
    if image:
        return f"1 m = {1 / m_per_unit:.1f} px"
    r = m_per_unit / PT
    near = min(RATIOS, key=lambda x: abs(x - r))
    return f"1:{near}" if abs(near - r) / r < 0.01 else f"1:{r:.0f}"


# ---------- files ----------

def _abs(rel: str) -> Path:
    p = (data_root() / rel).resolve()
    if os.name == "nt" and len(str(p)) > 240:  # Windows MAX_PATH: deep opening_design folders
        return Path("\\\\?\\" + str(p))
    return p


def is_image(rel: str) -> bool:
    return Path(rel).suffix.lower() in IMAGE_EXT


@lru_cache(maxsize=64)
def _lines(rel: str, page: int) -> tuple:
    """((text, [x0,y0,x1,y1]) ...) per text line, in display orientation (same as /api/file renders)."""
    import pymupdf
    try:
        doc = pymupdf.open(_abs(rel))
    except Exception:
        return ()
    with doc:
        if not 0 <= page < len(doc):
            return ()
        p = doc[page]
        M = p.rotation_matrix
        out = []
        for b in p.get_text("dict")["blocks"]:
            for ln in b.get("lines", []):
                t = "".join(s["text"] for s in ln["spans"]).strip()
                if t:
                    r = pymupdf.Rect(ln["bbox"]) * M
                    out.append((t, [round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1)]))
        return tuple(out)


@lru_cache(maxsize=64)
def _page_size(rel: str, page: int = 0) -> tuple[float, float] | None:
    if is_image(rel):
        from PIL import Image
        with Image.open(_abs(rel)) as im:
            return float(im.width), float(im.height)
    import pymupdf
    try:
        with pymupdf.open(_abs(rel)) as doc:
            r = doc[page].rect * doc[page].rotation_matrix
            return abs(r.width), abs(r.height)
    except Exception:
        return None


def _pages(rel: str) -> int:
    import pymupdf
    try:
        with pymupdf.open(_abs(rel)) as doc:
            return len(doc)
    except Exception:
        return 0


# ---------- scale finders ----------

def notes(rel: str, page: int = 0) -> list[Scale]:
    """Scale notes printed on a vector sheet. One Scale per distinct ratio; refs = every place it's printed."""
    if is_image(rel) or not rel.lower().endswith(".pdf"):
        return []
    found: dict[float, Scale] = {}
    for text, bb in _lines(rel, page):
        for m in METRIC.finditer(text):
            n = int(m.group(1))
            if n in RATIOS and n > 1:
                _add(found, n * PT, f"1:{n}", Ref(rel, page, bb, text, "note"))
        for m in IMPERIAL.finditer(text):
            paper = _frac(m.group(1))
            real = int(m.group(2)) * 12 + (_frac(m.group(3)) if m.group(3) else 0)
            if paper > 0 and real > 0:
                label = f"{m.group(1)}\" = {m.group(2)}'-{m.group(3) or 0}\""
                _add(found, real / paper * PT, label, Ref(rel, page, bb, text, "note"))
    out = list(found.values())
    for s in out:
        s.confidence = 0.85 if len(out) == 1 else 0.6
        s.text = f"{s.text} from the scale note on the sheet" + (f" (printed {len(s.refs)}×)" if len(s.refs) > 1 else "")
        s.applies = None if len(out) == 1 else _union([r.bbox for r in s.refs])
    return out


def _add(found: dict, mpu: float, label: str, ref: Ref) -> None:
    key = round(mpu, 9)
    if key not in found:
        found[key] = Scale(id=f"note:{label}", m_per_unit=mpu, source="note", text=label, confidence=0.8)
    found[key].refs.append(ref)


def _union(bbs: list[list[float]]) -> list[float]:
    return [min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs)]


def bar(rel: str) -> list[Scale]:
    """Graphic scale bar on a scan: tick numbers in a row next to a unit word (FEET / METERS); px per unit = slope."""
    if not is_image(rel):
        return []
    ws = [w for w in _ocr(rel) if w[1] >= 0.5]
    nums = [(float(t), b) for t, c, b in ws if re.fullmatch(r"\d{1,3}", t.strip())]
    units = [(k, b) for t, c, b in ws for k in UNIT_WORD if re.search(rf"\b{re.escape(k)}\b", t.upper())
             and (k != "M" or t.strip().upper() == "M")]
    out: list[Scale] = []
    seen = set()
    for unit, ub in units:
        h = max(ub[3] - ub[1], 8)
        cy = (ub[1] + ub[3]) / 2
        row = [(v, b) for v, b in nums if abs((b[1] + b[3]) / 2 - cy) < 3 * h and abs((b[0] + b[2]) / 2 - ub[0]) < 40 * h]
        row = sorted({(v, round((b[0] + b[2]) / 2)): b for v, b in row}.items(), key=lambda x: x[0][1])
        # a second bar (metres next to feet) can share the row: keep the increasing run nearest the unit word
        runs, cur = [], row[:1]
        for prev, nxt in zip(row, row[1:]):
            if nxt[0][0] > prev[0][0]:
                cur.append(nxt)
            else:
                runs.append(cur)
                cur = [nxt]
        runs.append(cur)
        runs = [r for r in runs if len(r) >= 2]
        if not runs:
            continue
        ux = (ub[0] + ub[2]) / 2
        row = min(runs, key=lambda r: min(abs(k[1] - ux) for k, _ in r))
        vs = [k[0] for k, _ in row]
        xs = [k[1] for k, _ in row]
        if any(b <= a for a, b in zip(vs, vs[1:])):  # ticks must increase left to right
            continue
        n = len(vs)
        mv, mx = sum(vs) / n, sum(xs) / n
        slope = sum((v - mv) * (x - mx) for v, x in zip(vs, xs)) / sum((v - mv) ** 2 for v in vs)
        if slope <= 0:
            continue
        resid = max(abs(mx + slope * (v - mv) - x) for v, x in zip(vs, xs))
        if n > 2 and resid > 0.1 * slope * min(b - a for a, b in zip(vs, vs[1:])):
            continue
        mpu = UNIT_WORD[unit] / slope
        key = round(mpu, 5)
        if key in seen:
            continue
        seen.add(key)
        name = "ft" if UNIT_WORD[unit] == FT else "m"
        bb = _union([b for _, b in row] + [list(ub)])
        out.append(Scale(
            id=f"bar:{key}", m_per_unit=mpu, source="bar", confidence=0.55 if n == 2 else 0.75,
            text=f"scale bar on the scan: ticks {', '.join(f'{v:g}' for v in vs)} {name}, {slope:.1f} px per {name}",
            refs=[Ref(rel, 0, [round(x, 1) for x in bb], f"ticks {vs} {unit}", "bar")]))
    return out


@lru_cache(maxsize=32)
def _ocr(rel: str) -> tuple:
    """Single pass: ocr.words also reads the mirror image, which turns tick '10' into '01'."""
    from .ocr import _engine
    res, _ = _engine()(str(_abs(rel)))
    out = []
    for quad, text, conf in res or []:
        xs, ys = [p[0] for p in quad], [p[1] for p in quad]
        out.append((text, float(conf), (min(xs), min(ys), max(xs), max(ys))))
    return tuple(out)


def dxf(rel: str) -> list[Scale]:
    """Swiss plans ship a DXF in metres; the vector path already aligns it to the PDF on room numbers."""
    if "/swiss_dwellings/" not in rel:
        return []
    from .paths import vector
    stem = rel.rsplit(".", 1)[0]
    plan = vector.load(stem)
    if plan is None or plan.to_pdf is None:
        return []
    pt_per_m = abs(plan.to_pdf[0][0])
    mpu = 1 / pt_per_m
    pdf = f"{stem}.pdf"
    n = sum(1 for r in plan.rooms if r.number)
    s = Scale(id="dxf", m_per_unit=mpu, source="dxf", confidence=0.99,
              text=f"DXF geometry in metres, aligned to the PDF on {n} room numbers",
              refs=[Ref(f"{stem}.dxf", 0, [], f"DXF units: metres, 1 m = {pt_per_m:.3f} pt on {Path(pdf).name}", "dxf")])
    if rel == pdf:
        return [s]
    return _convert(s, pdf, rel)


def _convert(s: Scale, src: str, dst: str) -> list[Scale]:
    """Same drawing in another file (PDF → PNG): scale times the size ratio."""
    a, b = _page_size(src), _page_size(dst)
    if not a or not b:
        return []
    k = a[0] / b[0]
    if abs(a[1] / b[1] - k) / k > 0.01:  # different aspect: not the same sheet
        return []
    return [Scale(id=f"sibling:{s.id}", m_per_unit=s.m_per_unit * k, source="sibling", confidence=s.confidence * 0.97,
                  text=f"{s.text}; same drawing as {Path(src).name} ({b[0]:.0f} px = {a[0]:.0f} pt)",
                  refs=s.refs + [Ref(src, 0, [], f"{Path(dst).name} is {Path(src).name} rendered at "
                                                 f"{1 / k:.3f} px per pt", "sibling")])]


def siblings(rel: str) -> list[Scale]:
    """An image with a same-stem PDF: read the PDF's scale and convert."""
    if not is_image(rel):
        return []
    stem = rel.rsplit(".", 1)[0]
    pdf = f"{stem}.pdf"
    if not _abs(pdf).exists():
        return []
    out: list[Scale] = []
    for s in notes(pdf):
        if s.applies is None:
            out += _convert(s, pdf, rel)
    return out


# ---------- known dimensions (for calibration) ----------

def area_labels(rel: str, page: int = 0) -> list[Known]:
    """Room areas printed on the drawing ('15.90 m²'): draw the room outline to calibrate."""
    out: list[Known] = []
    if is_image(rel):
        from .ocr import areas
        items = [(t, list(b)) for t, c, b in areas(str(_abs(rel)))]
    else:
        items = list(_lines(rel, page))
    for t, bb in items:
        m = AREA_LABEL.search(t.replace(" ", " "))
        if not m:
            continue
        v = float(m.group(1).replace(",", "."))
        if v <= 0:
            continue
        m2 = v if m.group(2).lower().startswith("m") else v * FT * FT
        out.append(Known(id=f"label:{page}:{len(out)}", text=f"room area label '{t}'", value=m2, unit="m2",
                         ref=Ref(rel, page, list(bb), t, "label")))
    return out[:40]


def project_dir(rel: str) -> Path | None:
    """Folder holding one project's sheets: data/<source>/<project>/... Flat sources have none."""
    parts = Path(rel).parts
    if len(parts) < 4:
        return None
    return data_root() / parts[0] / parts[1] / parts[2]


@lru_cache(maxsize=16)
def project(rel: str) -> tuple[tuple, tuple]:
    """(scale notes, known dimensions) read from the other sheets of the same project."""
    d = project_dir(rel)
    if d is None:
        return (), ()
    root = data_root()
    scales: list[Scale] = []
    known: list[Known] = []
    files = sorted(p for p in d.rglob("*.pdf") if p.relative_to(root).as_posix() != rel)[:30]
    for f in files:
        other = f.relative_to(root).as_posix()
        for pg in range(min(_pages(other), 3)):
            for s in notes(other, pg):
                scales.append(s)
        known += _schedule_dims(other)
        for k in area_labels(other)[:10]:  # same room on this sheet → calibrate from its printed area
            k.id, k.text = f"proj:{other}:{k.id}", f"{k.text} on {Path(other).stem}"
            known.append(k)
    return tuple(scales), tuple(known[:60])


def _schedule_dims(rel: str) -> list[Known]:
    """Door / window widths and heights from schedule tables on another sheet."""
    try:
        from .paths.schedule import extract
        tables = extract(rel)
    except Exception:
        return []
    out: list[Known] = []
    for t in tables:
        mark = t.col(r"^mark$", r"^(door|window)?\s*(no|number|#|tag)", r"^door$", r"^window$")
        for name in ("width", "height"):
            c = t.col(rf"^{name}", rf"\b{name}\b")
            if c is None or mark is None:
                continue
            for row, box in zip(t.rows, t.boxes):
                if c >= len(row) or mark >= len(row):
                    continue
                v = parse_length(row[c])
                if v and 0.3 < v < 6:
                    kind = "window" if re.search(r"(?i)window", t.title) else "door"
                    out.append(Known(id=f"sched:{rel}:{row[mark]}:{name}",
                                     text=f"{kind} {row[mark]} {name} {row[c]} ({Path(rel).stem})",
                                     value=v, unit="m", ref=Ref(rel, 0, list(box), " | ".join(row), "schedule")))
    return out


def sheet_size(rel: str, proj_scales: list[Scale]) -> list[Scale]:
    """A scan of a full sheet: if the project's vector sheets share a paper size and one scale, assume the scan is
    that sheet. Low confidence: always offered as a choice, never picked on its own."""
    if not is_image(rel) or not proj_scales:
        return []
    sz = _page_size(rel)
    out: list[Scale] = []
    by: dict[tuple, list[Scale]] = {}
    for s in proj_scales:
        ps = _page_size(s.refs[0].file, s.refs[0].page)
        if ps and s.applies is None:
            by.setdefault((round(ps[0]), round(ps[1])), []).append(s)
    for (w, h), ss in by.items():
        if not sz or abs(w / h - sz[0] / sz[1]) > 0.03:
            continue
        s = max(ss, key=lambda x: len(x.refs))
        k = w / sz[0]
        out.append(Scale(id=f"sheet:{s.id}:{w}x{h}", m_per_unit=s.m_per_unit * k, source="sheet_size", confidence=0.4,
                         text=f"assume this scan is a full {w / 72:.0f}×{h / 72:.0f} in sheet at "
                              f"{s.text.split(' from')[0]}, like {Path(s.refs[0].file).stem}",
                         refs=s.refs[:1] + [Ref(rel, 0, [0, 0, sz[0], sz[1]], "whole scan = whole sheet", "project")]))
    return out[:3]


# ---------- store ----------

def _store_dir() -> Path:
    d = Path(os.environ.get("SITELENS_STORE") or Path(__file__).resolve().parent.parent / ".sitelens" / "measure")
    d.mkdir(parents=True, exist_ok=True)
    gi = d.parent / ".gitignore"
    if d.parent.name == ".sitelens" and not gi.exists():
        gi.write_text("*\n")
    return d


def _store_file(rel: str) -> Path:
    return _store_dir() / (hashlib.sha1(rel.encode()).hexdigest()[:16] + ".json")


def forget(rel: str) -> None:
    """Drop a drawing's calibrations and takeoffs (its file is gone)."""
    _store_file(rel).unlink(missing_ok=True)


def load(rel: str) -> dict:
    f = _store_file(rel)
    if f.exists():
        return json.loads(f.read_text(encoding="utf8"))
    return {"path": rel, "calibrations": [], "measurements": []}


def save(rel: str, data: dict) -> None:
    f = _store_file(rel)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf8")
    tmp.replace(f)


def _active(data: dict, page: int) -> dict | None:
    return next((c for c in reversed(data["calibrations"]) if c["page"] == page and c.get("active")), None)


def _set_scale(rel: str, page: int, s: Scale, how: str) -> dict:
    data = load(rel)
    for c in data["calibrations"]:
        if c["page"] == page:
            c["active"] = False
    entry = {**asdict(s), "page": page, "active": True, "how": how, "created": time.strftime("%Y-%m-%d %H:%M")}
    data["calibrations"].append(entry)
    save(rel, data)
    return entry


# ---------- geometry ----------

def _seg_len(pts) -> float:
    return sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))


def _shoelace(pts) -> float:
    n = len(pts)
    return abs(sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))) / 2


def _bb(pts) -> list[float]:
    return [round(min(p[0] for p in pts), 1), round(min(p[1] for p in pts), 1),
            round(max(p[0] for p in pts), 1), round(max(p[1] for p in pts), 1)]


def _centre(b) -> tuple[float, float]:
    return (b[0] + b[2]) / 2, (b[1] + b[3]) / 2


def _dist_bb(b, pt) -> float:
    dx = max(b[0] - pt[0], 0, pt[0] - b[2])
    dy = max(b[1] - pt[1], 0, pt[1] - b[3])
    return math.hypot(dx, dy)


# ---------- resolve ----------

def candidates(rel: str, page: int = 0) -> list[Scale]:
    return dxf(rel) + siblings(rel) + notes(rel, page) + bar(rel)


def resolve(rel: str, page: int = 0, region: list[float] | None = None) -> dict:
    """The scale to measure with, every candidate, and a question back when it isn't clear."""
    data = load(rel)
    cands = candidates(rel, page)
    stored = _active(data, page)
    image = is_image(rel)
    chosen: Scale | None = None
    ask, options = None, []

    exact = [c for c in cands if c.source in ("dxf", "sibling")]
    sheet = [c for c in cands if c.source == "note"]
    if stored:
        chosen = Scale(**{k: stored[k] for k in ("id", "m_per_unit", "source", "text", "confidence", "applies", "agree")},
                       refs=[Ref(**r) for r in stored["refs"]])
    elif exact:
        chosen = max(exact, key=lambda c: c.confidence)
    elif len(sheet) == 1:
        chosen = sheet[0]
    elif sheet and region:
        ctr = _centre(region)
        chosen = min(sheet, key=lambda s: min(_dist_bb(r.bbox, ctr) for r in s.refs))
        chosen.text += " (the note nearest your shape)"
    elif sheet:
        ask = (f"This sheet has {len(sheet)} scales ({', '.join(s.text.split(' from')[0] for s in sheet)}), "
               "one per view. Which view are you measuring? Or just draw: I'll use the note nearest your shape.")
        options = [_opt(s, image) for s in sheet]
    elif [c for c in cands if c.source == "bar"]:
        chosen = max((c for c in cands if c.source == "bar"), key=lambda c: c.confidence)

    # second opinion: another source within 1 % confirms the scale
    if chosen:
        for c in cands:
            if c.id != chosen.id and c.source != chosen.source and abs(c.m_per_unit - chosen.m_per_unit) / chosen.m_per_unit < 0.01:
                chosen.agree = f"{c.source} agrees: {c.text} ({abs(c.m_per_unit / chosen.m_per_unit - 1) * 100:.2f} % apart)"
                break

    known = area_labels(rel, page)
    # other sheets of the project are slow to read: only when this sheet has no scale of its own
    proj_scales, proj_known = project(rel) if not cands else ((), ())
    if chosen is None and not ask:
        guesses = sheet_size(rel, list(proj_scales))
        what = "this scan" if image else "this sheet"
        ask = (f"No scale found on {what} (no scale note, scale bar or DXF). "
               "Draw a line over a dimension you know and type its length"
               + (", or draw a room whose area is printed" if known else "")
               + (", or pick a dimension from another sheet of this project" if proj_known else "")
               + (", or assume the project's sheet size" if guesses else "") + ".")
        options = [_opt(s, image) for s in guesses]

    return {
        "path": rel, "page": page, "image": image,
        "scale": _opt(chosen, image) if chosen else None,
        "candidates": [_opt(c, image) for c in cands],
        "ask": ask, "options": options,
        "known": [asdict(k) for k in known] + [asdict(k) for k in proj_known],
        "project": [_opt(s, False) for s in proj_scales][:20],
        "calibrations": data["calibrations"],
        "measurements": [m for m in data["measurements"] if m["page"] == page],
    }


def _opt(s: Scale, image: bool) -> dict:
    d = asdict(s)
    d["ratio"] = _ratio_text(s.m_per_unit, image)
    return d


# ---------- takeoffs ----------

def compute(kind: str, pts: list[list[float]], mpu: float) -> dict:
    """One manual takeoff. kind: length (polyline) | area (polygon) | count (points)."""
    if kind == "count":
        return {"value": len(pts), "unit": "count", "text": f"{len(pts)} counted"}
    if kind == "length":
        m = _seg_len(pts) * mpu
        return {"value": round(m, 3), "unit": "m", "text": fmt_len(m), "segments": len(pts) - 1}
    if kind == "area":
        a = _shoelace(pts) * mpu * mpu
        per = (_seg_len(pts) + math.dist(pts[-1], pts[0])) * mpu
        return {"value": round(a, 3), "unit": "m2", "text": f"{fmt_area(a)}, perimeter {fmt_len(per)}",
                "perimeter_m": round(per, 3)}
    raise ValueError(f"unknown kind {kind}")


def add_measurement(rel: str, page: int, kind: str, pts: list[list[float]], label: str = "") -> dict:
    if kind not in ("length", "area", "count") or not pts or (kind == "length" and len(pts) < 2) or (kind == "area" and len(pts) < 3):
        raise ValueError("length needs 2+ points, area 3+, count 1+")
    region = _bb(pts)
    r = resolve(rel, page, region)
    s = r["scale"]
    if s is None and kind != "count":
        raise LookupError(r["ask"] or "no scale")
    res = compute(kind, pts, s["m_per_unit"] if s else 1.0)
    m = {"id": uuid.uuid4().hex[:8], "page": page, "kind": kind, "label": label.strip(), "points": pts,
         "bbox": region, **res, "scale": {k: s[k] for k in ("id", "ratio", "text", "m_per_unit")} if s else None,
         "created": time.strftime("%Y-%m-%d %H:%M")}
    data = load(rel)
    data["measurements"].append(m)
    save(rel, data)
    return m


def delete_measurement(rel: str, mid: str) -> bool:
    data = load(rel)
    n = len(data["measurements"])
    data["measurements"] = [m for m in data["measurements"] if m["id"] != mid]
    save(rel, data)
    return len(data["measurements"]) < n


def calibrate(rel: str, page: int, pts: list[list[float]], length: str, known_id: str | None = None,
              note: str = "") -> dict:
    """Two points + a real length (or a polygon + a real area) → scale, stored with where it came from."""
    ref_known = None
    if known_id:
        r = resolve(rel, page)
        ref_known = next((k for k in r["known"] if k["id"] == known_id), None)
    if len(pts) >= 3:
        m2 = ref_known["value"] if ref_known and ref_known["unit"] == "m2" else _parse_area(length)
        if not m2:
            raise ValueError(f"can't read an area from '{length}'")
        mpu = math.sqrt(m2 / _shoelace(pts))
        what = f"room drawn = {fmt_area(m2)}"
    else:
        real = ref_known["value"] if ref_known and ref_known["unit"] == "m" else parse_length(length)
        if not real or len(pts) != 2 or math.dist(*pts) == 0:
            raise ValueError(f"need two points and a length like 12'-6\" or 3.5 m, got '{length}'")
        mpu = real / math.dist(*pts)
        what = f"line drawn = {fmt_len(real)}"
    refs = [Ref(rel, page, _bb(pts), f"you: {what}" + (f" ({note})" if note else ""), "manual")]
    if ref_known:
        refs.append(Ref(**ref_known["ref"]))
        what += f", from {ref_known['text']}"
    s = Scale(id=f"manual:{uuid.uuid4().hex[:6]}", m_per_unit=mpu, source="manual", confidence=0.9,
              text=f"calibrated by hand: {what}", refs=refs)
    return _set_scale(rel, page, s, "calibrate")


def _parse_area(s: str) -> float | None:
    m = re.fullmatch(r"\s*(\d+(?:[.,]\d+)?)\s*(m²|m2|sq\s*m|ft²|ft2|sf|sq\.?\s*ft)?\s*", s, re.I)
    if not m:
        return None
    v = float(m.group(1).replace(",", "."))
    return v * FT * FT if m.group(2) and "f" in m.group(2).lower() else v


def choose(rel: str, page: int, scale_id: str) -> dict:
    """Answer to the question back: the user picked one of the candidate scales."""
    r = resolve(rel, page)
    pool = r["candidates"] + r["options"] + r["project"]
    s = next((c for c in pool if c["id"] == scale_id), None)
    if s is None:
        raise LookupError(f"no scale {scale_id}")
    sc = Scale(**{k: s[k] for k in ("id", "m_per_unit", "source", "text", "confidence", "applies", "agree")},
               refs=[Ref(**x) for x in s["refs"]])
    sc.text += " (you picked it)"
    return _set_scale(rel, page, sc, "choose")


def reset_scale(rel: str, page: int) -> None:
    data = load(rel)
    for c in data["calibrations"]:
        if c["page"] == page:
            c["active"] = False
    save(rel, data)


# ---------- automatic takeoff ----------

def auto(rel: str, page: int = 0) -> dict:
    """Takeoff from the drawing's own geometry, with a plain-language summary."""
    r = resolve(rel, page)
    s = r["scale"]
    items: list[dict] = []
    lines: list[str] = []
    if s:
        lines.append(f"Scale {s['ratio']}: {s['text']}." + (f" {s['agree'][:1].upper()}{s['agree'][1:]}." if s["agree"] else ""))
    if "/swiss_dwellings/" in rel and s:
        items = _swiss(rel, s["m_per_unit"])
    if items:
        rooms = [i for i in items if i["kind"] == "area"]
        walls = [i for i in items if i["kind"] == "length" and i["group"] == "wall"]
        indoor = [i for i in rooms if not i.get("outdoor")]
        out = [i for i in rooms if i.get("outdoor")]
        a_in = sum(i["value"] for i in indoor)
        lines.append(f"{len(rooms)} rooms traced from the DXF outlines: {a_in:.2f} m² indoor"
                     + (f" + {sum(i['value'] for i in out):.2f} m² balconies/terraces" if out else "") + ".")
        printed = [i for i in rooms if i.get("printed") is not None]
        if printed:
            worst = max(printed, key=lambda i: abs(i["value"] - i["printed"]) / max(i["printed"], 0.01))
            dev = abs(worst["value"] - worst["printed"]) / max(worst["printed"], 0.01) * 100
            lines.append(f"Measured areas match the printed room labels within {dev:.1f} % "
                         f"(worst: {worst['label']}, {worst['value']:.2f} vs {worst['printed']:.2f} m²)."
                         if dev < 2 else
                         f"{worst['label']} measures {worst['value']:.2f} m² but its label says {worst['printed']:.2f} m² "
                         f"({dev:.0f} % off): check that room.")
        lines.append(f"Room perimeters total {sum(i['perimeter_m'] for i in rooms):.1f} m (skirting, before door openings).")
        if walls:
            lines.append(f"Walls: {len(walls)} wall pieces, about {sum(i['value'] for i in walls):.1f} m of wall "
                         f"(centre-line, thickness {min(i['thickness_m'] for i in walls) * 100:.0f}–"
                         f"{max(i['thickness_m'] for i in walls) * 100:.0f} cm).")
    elif s:
        lines.append("No room outlines in this file's data: draw areas and lengths with the tools; they use this scale.")
    # lines: shown under the scale card, which already carries the question back
    return {"summary": " ".join(lines) if s else (r["ask"] or "No scale yet."), "lines": lines, "items": items, "scale": s}


def _swiss(rel: str, mpu: float) -> list[dict]:
    import numpy as np
    from .paths import vector
    stem = rel.rsplit(".", 1)[0]
    plan = vector.load(stem)
    if plan is None or plan.to_pdf is None:
        return []
    M = np.array(plan.to_pdf)
    k = 1.0
    if rel != f"{stem}.pdf":  # PNG: PDF points → pixels
        a, b = _page_size(f"{stem}.pdf"), _page_size(rel)
        k = b[0] / a[0]
    to_view = lambda P: [[round(float(x) * k, 2), round(float(y) * k, 2)]  # noqa: E731
                         for x, y in (M @ np.c_[P, np.ones(len(P))].T).T]
    items = []
    for r in plan.rooms:
        poly = to_view(r.poly)
        res = compute("area", poly, mpu)
        items.append({"id": f"room:{r.number or r.name}:{len(items)}", "kind": "area", "group": "room",
                      "label": f"{r.name} {r.number}".strip(), "points": poly, "bbox": _bb(poly),
                      "printed": r.label_area, "outdoor": bool(vector.OUTDOOR.search(r.name)), **res})
    for i, P in enumerate(_walls(stem)):
        poly = to_view(P)
        A = _shoelace(poly) * mpu * mpu
        per = (_seg_len(poly) + math.dist(poly[-1], poly[0])) * mpu
        disc = per * per - 16 * A
        t = (per - math.sqrt(max(disc, 0))) / 4 if A > 0 else 0
        if t <= 0.03 or t > 0.8:
            continue
        L = A / t
        items.append({"id": f"wall:{i}", "kind": "length", "group": "wall", "label": f"wall {i + 1}, {t * 100:.0f} cm",
                      "points": poly, "bbox": _bb(poly), "value": round(L, 3), "unit": "m", "thickness_m": round(t, 3),
                      "text": f"≈ {fmt_len(L)} long, {t * 100:.0f} cm thick", "closed": True})
    return items


@lru_cache(maxsize=16)
def _walls(stem: str) -> tuple:
    import ezdxf
    import numpy as np
    f = data_root() / f"{stem}.dxf"
    if not f.exists():
        return ()
    m = ezdxf.readfile(f).modelspace()
    return tuple(np.array([p[:2] for p in e.get_points()]) for e in m.query('LWPOLYLINE[layer=="WALL"]')
                 if len(e) >= 4)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Scale + automatic takeoff for one drawing")
    ap.add_argument("path")
    ap.add_argument("--page", type=int, default=0)
    a = ap.parse_args()
    r = resolve(a.path, a.page)
    print(json.dumps({"scale": r["scale"], "ask": r["ask"], "options": r["options"],
                      "candidates": [(c["ratio"], c["text"]) for c in r["candidates"]],
                      "known": [k["text"] for k in r["known"]][:10]}, indent=1, ensure_ascii=False))
    print(auto(a.path, a.page)["summary"])
