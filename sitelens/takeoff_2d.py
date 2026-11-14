"""Drawing counts and independently cited dimensions."""
from __future__ import annotations

import math
import re
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

from . import data_root, measure
from .answer import Evidence

CATS = {"door": "Doors", "window": "Windows", "toilet": "Toilets", "sink": "Sinks",
        "basin": "Basins", "tub": "Bathtubs", "bathtub": "Bathtubs", "shower": "Showers"}
TAG = re.compile(r"[A-Z0-9]+(?:[./-][A-Z0-9]+)*$")
MAX_SHEETS = 30
MAX_PAGES = 12


def cell(row, col):
    return row[col].strip() if col is not None and col < len(row) else ""


def _specs(path, page_tables):
    import pymupdf

    root = data_root().resolve()
    folder = measure.project_dir(path)
    folder = folder.resolve() if folder else None
    siblings = sorted(f.relative_to(root).as_posix() for f in (folder or root).rglob("*.pdf")
                      if f.resolve().is_relative_to(root)) if folder and folder.is_dir() else []
    candidates = list(dict.fromkeys([path, *siblings]))
    specs = defaultdict(list)
    inspected = 0
    failed = 0
    limited = len(candidates) > MAX_SHEETS
    for other in candidates[:MAX_SHEETS]:
        if not other.lower().endswith(".pdf"):
            continue
        try:
            if other == path:
                tables = page_tables
            else:
                with pymupdf.open(root / other) as doc:
                    tables = [(page.number, table) for page in doc.pages(0, min(len(doc), MAX_PAGES))
                              for table in _page_schedules(page)]
                    limited |= len(doc) > MAX_PAGES
        except (RuntimeError, ValueError, OSError):
            failed += 1
            continue
        inspected += 1
        for page, t in tables:
            cat = next((cat for k, cat in CATS.items() if k in ("door", "window")
                        and re.search(rf"\b{k}s?\b", t.title, re.I)), None)
            if not cat:
                continue
            mark = t.col(r"^(mark|tag|id|(?:door |window )?(?:no\.?|number|#))$")
            typ = t.col(r"\btype\b")
            w, h = t.col(r"\bwidth\b", r"^wd$"), t.col(r"\bheight\b", r"^ht$")
            attrs = [(i, label) for i, label in enumerate(t.header)
                     if re.search(r"material|matl|finish|fire|rating|glazing|frame", label, re.I)]
            for row, box in zip(t.rows, t.boxes):
                code = cell(row, mark).upper()
                type_name = cell(row, typ)
                width, height = cell(row, w), cell(row, h)
                size = (f"{width} × {height}" if width and height else
                        f"{width} wide" if width else f"{height} high" if height else "")
                fields = tuple(f"{label}: {cell(row, i)}" for i, label in attrs if cell(row, i))
                for key, is_mark in ((code, True), (type_name.upper(), False)):
                    if TAG.fullmatch(key) and (is_mark or re.search(r"\d", key)):
                        specs[cat, key, is_mark].append((type_name, size, fields,
                            Evidence(other, box, page=page, label=f"{t.title}: {' | '.join(row)}", kind="text")))
    return specs, inspected, limited, failed


def _associate(objects, words, specs):
    """Accept only an unambiguous nearby exact tag, never a fuzzy schedule match."""
    out = defaultdict(list)
    for cat, ev, *_ in objects:
        if cat not in ("Doors", "Windows"):
            continue
        matching = []
        x0, y0, x1, y1 = ev.bbox
        for token, box in words:
            token = token.upper()
            if token.isdecimal():
                continue
            x, y = measure._centre(box)
            gap = min(12, max(x1 - x0, y1 - y0) * 0.35)
            if not (x0 - gap <= x <= x1 + gap and y0 - gap <= y <= y1 + gap):
                continue
            marked = specs.get((cat, token, True))
            matches = marked or specs.get((cat, token, False))
            if matches:
                matching.append((token, box, matches, bool(marked)))
        if len(matching) == 1:
            token, box, matches, mark = matching[0]
            out[tuple(box)].append((ev, token, matches, mark, cat))
    marks = defaultdict(int)
    for items in out.values():
        if len(items) == 1:
            _, token, _, mark, cat = items[0]
            if mark:
                marks[cat, token] += 1
    return {id(ev): (token, matches, Evidence(ev.file, list(box), page=ev.page, label=f"Plan tag {token}", kind="text"))
            for box, items in out.items() if len(items) == 1 for ev, token, matches, mark, cat in items
            if not mark or marks[cat, token] == 1}


def _words(page):
    import pymupdf

    return [(w[4], list(pymupdf.Rect(w[:4]) * page.rotation_matrix)) for w in page.get_text("words")]


NON_PLAN_VIEW = re.compile(
    r"(?im)^\s*(?:[A-Z]?[0-9]+\s+)?(?:[\w-]+[ \t]+){0,4}"
    r"(?:elevations?|sections?|details?|legends?|reflected ceiling plans?)"
    r"(?:[ \t]+[A-Z0-9-]+)?[ \t]*$"
)
NOT_TO_SCALE = re.compile(r"\b(?:not[ \t]+to[ \t]+scale|N\.?[ \t]*T\.?[ \t]*S\.?)\b", re.I)


def _pdf_bars(path, page, words):
    """Require a drawn horizontal segment beneath a labelled, proportional tick sequence."""
    ticks = [(float(t), b) for t, b in words if re.fullmatch(r"\d{1,3}(?:\.\d+)?", t)]
    units = [(t.upper(), b) for t, b in words if t.upper() in measure.UNIT_WORD]
    if not ticks or not units:
        return []
    import pymupdf

    bars = []
    lines = []
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0] == "l":
                a, b = (p * page.rotation_matrix for p in item[1:3])
                if abs(a.y - b.y) < 0.5 and abs(a.x - b.x) >= 15:
                    lines.append((min(a.x, b.x), max(a.x, b.x), a.y))
            elif item[0] == "re":
                r = pymupdf.Rect(item[1]) * page.rotation_matrix
                if r.width >= 15 and 0 < r.height <= 12:
                    lines.extend([(r.x0, r.x1, r.y0), (r.x0, r.x1, r.y1)])
    seen = set()
    for unit, ub in units:
        h = max(ub[3] - ub[1], 4)
        ux, uy = measure._centre(ub)
        nearby = [(v, b, *measure._centre(b)) for v, b in ticks
                  if abs(measure._centre(b)[1] - uy) <= 2 * h and abs(measure._centre(b)[0] - ux) <= 40 * h]
        for v, b, x, y in nearby:
            if v != 0:
                continue
            for last, end, xx, yy in nearby:
                if last <= 0 or xx - x < 15 or abs(y - yy) > h or not (x <= ux <= xx + 6 * h):
                    continue
                stroke = next(((a, z, sy) for a, z, sy in lines
                               if abs(a - x) <= h / 2 and abs(z - xx) <= h / 2 and abs(sy - y) <= 2 * h), None)
                if stroke is None:
                    continue
                a, z, sy = stroke
                inner = [(n, bb, tx) for n, bb, tx, ty in nearby if x < tx < xx and abs(ty - y) <= h / 2]
                if not inner or any(
                    not 0 < n < last or abs((tx - a) / (z - a) - n / last) > 0.08 for n, _, tx in inner
                ):
                    continue
                mpu = last * measure.UNIT_WORD[unit] / (z - a)
                key = (round(mpu, 7), round(a), round(sy))
                if key in seen:
                    continue
                seen.add(key)
                box = measure._union([b, end, ub, [a, sy, z, sy], *(bb for _, bb, _ in inner)])
                text = f"Graphic scale: {last:g} {unit.lower()} over {z - a:.2f} PDF points"
                bars.append(measure.Scale(f"bar:{key}", mpu, "bar", text, 0.8,
                                          [measure.Ref(path, page.number, box, text, "bar")]))
    return bars


def _scale(path, page, bars, ambiguous_view=False):
    if ambiguous_view:
        refs = [ref for bar in bars for ref in bar.refs]
        return None, "This sheet has a not-to-scale label; the applicable scale is unknown.", refs
    stored = measure._active(measure.load(path), page)
    if stored and stored["source"] == "manual":
        return stored["m_per_unit"], stored["text"], [measure.Ref(**r) for r in stored["refs"]]
    notes = measure.notes(path, page)
    if len(notes) > 1:
        return None, "Multiple view scales are printed; calibrate this page in Measure before using a plan span.", []
    choices = bars or notes
    if not choices:
        return None, "No verified scale bar or printed scale found on this page.", []
    first = choices[0]
    if any(abs(s.m_per_unit / first.m_per_unit - 1) > .02 for s in choices[1:]):
        return None, "Graphic scales disagree; the applicable scale could not be inferred.", [r for s in choices for r in s.refs]
    text, refs = first.text, list(first.refs)
    if bars and notes:
        delta = abs(notes[0].m_per_unit / first.m_per_unit - 1)
        if delta > .02:
            return None, f"The bar and printed scale disagree by {delta:.0%}; calibrate this page in Measure.", refs + notes[0].refs
        text += f"; printed scale agrees within {delta:.1%}"
        refs += notes[0].refs
    return first.m_per_unit, text, refs


def _detected(path, page=None):
    from .paths import detector

    model = detector._model()
    if model is None:
        return []
    number = page.number if page is not None else 0
    if page is None:
        hits = detector.detect(path)
    else:
        import numpy as np
        import pymupdf

        zoom = min(2, 2400 / max(page.rect.width, page.rect.height))
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
        result = model.predict(np.ascontiguousarray(rgb[:, :, ::-1]), imgsz=1280, conf=.1, iou=.5,
                               verbose=False, max_det=600)[0]
        hits = [(result.names[int(c)], float(p), [v / zoom for v in b])
                for c, p, b in zip(result.boxes.cls.tolist(), result.boxes.conf.tolist(), result.boxes.xyxy.tolist())]
    return [(CATS[c], Evidence(path, list(b), page=number, label=f"{c} detection ({p:.0%})"),
             "Detected symbol", None)
            for c, p, b in hits if c in CATS and p >= detector.CONF.get(c, detector.CONF["default"])]


def _vector(path):
    from .paths import vector

    if not path.endswith(".pdf") or "/swiss_dwellings/" not in path:
        return []
    stem = path.removesuffix(".pdf")
    plan = vector.load(stem)
    if plan is None or plan.to_pdf is None:
        return []
    objects = []
    for c, boxes in plan.objects.items():
        if c not in CATS:
            continue
        for b in boxes:
            ev = vector._ev(plan, stem, b, f"{c} outline")
            long, short = sorted((b[2] - b[0], b[3] - b[1]), reverse=True)
            geometry = (long, 0) if c == "window" and short > 0 and long >= 4 * short else None
            objects.append((CATS[c], ev, "Drawing geometry", geometry))
    for shape in measure._walls(stem):
        if len(shape) != 4:
            continue
        edges = [shape[(i + 1) % 4] - shape[i] for i in range(4)]
        lengths = [math.hypot(*e) for e in edges]
        if min(lengths) <= 0 or any(abs(float(edges[i] @ edges[(i + 1) % 4])) > .01 * lengths[i] * lengths[(i + 1) % 4]
                                     for i in range(4)):
            continue
        thickness, length = min(lengths), max(lengths)
        if .03 <= thickness <= .8 and length > thickness * 2:
            ev = vector._ev(plan, stem, vector._bbox(shape), "Rectangular DXF wall segment")
            objects.append(("Walls", ev, "DXF wall segment", (thickness, length)))
    return objects


def _rows(objects, words, specs, scale, scanned=False):
    matches = _associate(objects, words, specs)
    rows = {}
    mpu, scale_text, refs = scale
    for cat, ev, method, geometry in objects:
        size, length, attrs = "", 0, ()
        type_name = "Unspecified"
        support = [ev]
        why = [f"Counted from {method.lower()} on this drawing."]
        if id(ev) in matches:
            token, records, tag = matches[id(ev)]
            support.extend([tag, *(r[3] for r in records)])
            unique = {(t, s, fields) for t, s, fields, _ in records}
            if len(unique) == 1:
                typ, size, attrs = next(iter(unique))
                type_name = typ or token
                why.append("The cited plan tags match the schedule exactly. Dimensions are as printed.")
                if size and (" wide" in size or " high" in size):
                    why.append("The schedule does not give both width and height.")
            else:
                why.append(f"Schedule rows for tag {token} disagree; the specification could not be resolved.")
        elif geometry and cat == "Walls":
            thickness, length = geometry
            type_name = "Rectangular wall segment"
            size = f"{thickness * 1000:.0f} mm thick"
            why.append("Measured the short and long edges of a rectangular wall outline in the aligned DXF (metres).")
        elif geometry and cat == "Windows":
            span, _ = geometry
            size = f"~ {span:.2f} m plan span"
            why.append("Used the long edge of a narrow window outline in the aligned DXF (metres). "
                       "Opening width and height are unverified.")
        elif cat == "Windows" and method == "Detected symbol" and mpu:
            x0, y0, x1, y1 = ev.bbox
            span, short = sorted([x1 - x0, y1 - y0], reverse=True)
            if short > 0 and span >= 4 * short and .2 <= span * mpu <= 8:
                size = f"≈ {round(span * mpu, 2):g} m plan span"
                why.append(f"{scale_text}. {span:.1f} {'px' if scanned else 'pt'} × {mpu:.6g} m per drawing unit "
                           f"= {span * mpu:.3f} m before rounding. Used the long side of a narrow window detection; "
                           "this is an estimate, and opening width and height are unverified.")
                support.extend(Evidence(r.file, r.bbox, r.page, r.text, "text") for r in refs if r.bbox)
        if not size:
            if mpu and method == "Detected symbol":
                why.append("A detection box is not a dimension line; it may include swing, trim or surrounding marks.")
            elif not mpu and cat in ("Doors", "Windows"):
                why.append(scale_text)
            support.extend(Evidence(r.file, r.bbox, r.page, r.text, "text") for r in refs if r.bbox and not mpu)
            why.append("Dimensions could not be inferred.")
        if not attrs and cat in ("Doors", "Windows", "Walls"):
            why.append("Material and performance specifications could not be inferred.")
        key = (cat, type_name, size, attrs, tuple(why))
        row = rows.setdefault(key, {"category": cat, "type": type_name, "size": size, "count": 0, "levels": set(),
            "length_m": 0, "area_m2": 0, "volume_m3": 0, "evidence": [], "dimension_evidence": [],
            "reason": why, "specifications": list(attrs)})
        row["count"] += 1
        row["length_m"] += length
        row["evidence"].append(ev)
        for ref in support:
            if ref not in row["dimension_evidence"]:
                row["dimension_evidence"].append(ref)
    return list(rows.values())


def _page_schedules(page, words=None):
    import pymupdf

    from .paths.schedule import extract_words

    tables = extract_words([word[:5] for word in page.get_text("words")])
    if tables:
        for table in tables:
            table.boxes = [list(pymupdf.Rect(box) * page.rotation_matrix) for box in table.boxes]
        return tables
    if page.rotation in (90, 180, 270):
        if words is None:
            words = _words(page)
        return extract_words([(*box, token) for token, box in words])
    return []


def _outside_schedule(box, regions):
    x, y = measure._centre(box)
    return not any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1 in regions)


@lru_cache(maxsize=16)
def _sheet(path, root, mtime, weights_mtime):
    if measure.is_image(path):
        bars = [b for b in measure.bar(path) if b.confidence >= .75]
        return [(0, _detected(path), [(t, list(b)) for t, c, b in measure._ocr(path) if c >= .8], bars, False)], False, [], 0
    import pymupdf

    pages, page_tables = [], []
    excluded = 0
    with pymupdf.open(data_root() / path) as doc:
        for page in doc:
            words = _words(page)
            tables = _page_schedules(page, words)
            page_tables.extend((page.number, t) for t in tables)
            regions = [measure._union(t.boxes) for t in tables if t.boxes]
            words = [(token, box) for token, box in words if _outside_schedule(box, regions)]
            bars = _pdf_bars(path, page, words)
            text = page.get_text()
            objects = _vector(path) if page.number == 0 else []
            if not objects:
                if NON_PLAN_VIEW.search(text):
                    excluded += 1
                else:
                    objects = _detected(path, page)
            objects = [obj for obj in objects if _outside_schedule(obj[1].bbox, regions)]
            pages.append((page.number, objects, words, bars, bool(NOT_TO_SCALE.search(text))))
            if len(pages) == MAX_PAGES:
                break
        return pages, len(doc) > len(pages), page_tables, excluded


def takeoff(path):
    from .paths import detector

    source = data_root() / path
    weights = detector._weights()
    pages, truncated, page_tables, excluded = _sheet(path, data_root().resolve(), source.stat().st_mtime_ns, weights.stat().st_mtime_ns if weights.exists() else 0)
    from .takeoff import _schedule

    schedule = _schedule(path, page_tables) if page_tables else None
    if schedule and not any(objects for _, objects, _, _, _ in pages):
        schedule["notes"].append("No placements were identified outside the schedule table.")
        if truncated:
            schedule["notes"].append(f"Only the first {MAX_PAGES} PDF pages were reviewed.")
        if excluded:
            schedule["notes"].append(f"Skipped symbol counts on {excluded} page(s) labeled with non-plan views.")
        return schedule
    specs, inspected, limited, failed = _specs(path, page_tables)
    rows = []
    for page, objects, words, bars, ambiguous_view in pages:
        page_rows = _rows(objects, words, specs, _scale(path, page, bars, ambiguous_view), measure.is_image(path))
        if len(pages) > 1:
            for row in page_rows:
                row["levels"].add(f"Page {page + 1}")
        rows.extend(page_rows)
    notes = [
        "Counts cover recognized objects on this drawing only. Missing categories and undetected objects are unknown.",
        f"Checked schedules in {inspected} PDF drawing(s). Exact tags can supply dimensions and specifications; "
        "other sheets never add to this drawing's counts.",
        "Wall counts are rectangular DXF segments, where available. Column, beam, slab and full wall quantities "
        "cannot be inferred from symbol detections.",
    ]
    if schedule:
        counted = {row["category"] for row in rows}
        entries = [row for row in schedule["rows"] if row["category"] not in counted]
        for row in entries:
            row["category"] += " (schedule)"
            row["reason"] = ["Count of schedule entries. No placements were identified for this category."]
            row["dimension_evidence"] = row["evidence"]
        rows.extend(entries)
    if specs:
        notes.append("Numeric-only labels cannot be distinguished from dimensions and are not matched to schedules.")
    if excluded:
        notes.append(f"Skipped symbol counts on {excluded} page(s) labeled with non-plan views, including mixed views.")
    if not weights.exists():
        notes.append("Symbol detector weights are unavailable; only supported drawing geometry can be counted.")
    if not rows:
        notes.append("No supported geometry or reliable symbols found. This does not establish a count of zero.")
    if truncated or limited or failed:
        notes.append(f"Review limited to {MAX_PAGES} pages per PDF and {MAX_SHEETS} candidate drawings; "
                     f"{failed} PDF drawing(s) could not be read.")
    return {"source": "drawing", "rows": rows, "notes": notes}
