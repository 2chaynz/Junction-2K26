"""Takeoff list: every door, window, wall, column, beam, slab, stair in a drawing, grouped by type and size.

IFC: element attributes, material layers and base quantities (ifcopenshell), counted like the IFC path so
totals match its answers. Vector PDF with a door/window schedule: one row per type × size from the schedule.
Every row cites its elements (IFC guids or schedule-row boxes). No model calls, cost 0.
"""
from __future__ import annotations

import csv
import io
import re
from collections import defaultdict
from functools import lru_cache

from . import data_root
from .answer import Evidence

CATEGORIES = [  # (label, IFC types, how the size is read)
    ("Doors", ("IfcDoor", "IfcDoorStandardCase"), "opening"),
    ("Windows", ("IfcWindow", "IfcWindowStandardCase"), "opening"),
    ("Walls", ("IfcWall", "IfcWallStandardCase"), "layered"),
    ("Curtain walls", ("IfcCurtainWall",), "none"),
    ("Columns", ("IfcColumn", "IfcColumnStandardCase"), "profile"),
    ("Beams", ("IfcBeam", "IfcBeamStandardCase"), "profile"),
    ("Slabs", ("IfcSlab", "IfcSlabStandardCase"), "layered"),
    ("Stairs", ("IfcStair",), "none"),
    ("Roofs", ("IfcRoof",), "none"),
]
FIELDS = ["category", "type", "size", "count", "levels", "length_m", "area_m2", "volume_m3"]


def _mm(v: float | None, scale: float) -> int | None:
    return round(v * scale * 1000) if isinstance(v, (int, float)) and v > 0 else None


def _layers(e) -> float | None:
    """Total material layer thickness in model units, from the element or its type."""
    import ifcopenshell.util.element as U
    m = U.get_material(e, should_inherit=True)
    if m is None:
        return None
    if m.is_a("IfcMaterialLayerSetUsage"):
        m = m.ForLayerSet
    if m.is_a("IfcMaterialLayerSet"):
        return sum(l.LayerThickness or 0 for l in m.MaterialLayers) or None
    return None


def _type_name(e) -> str:
    import ifcopenshell.util.element as U
    t = U.get_type(e)
    name = (t.Name if t is not None else None) or e.ObjectType or e.Name or e.is_a()[3:]
    # ArchiCAD appends internal ids to material names, Revit appends ":<element id>" to type names
    return re.sub(r"\s+\d{6,}\b|:\d{4,}$", "", str(name)).strip()


def _ifc(path: str) -> dict:
    import ifcopenshell.util.element as U
    import ifcopenshell.util.unit as UU
    from .paths.ifc import _file, _qty, _storey_elements, model_path
    full = model_path(path)
    f = _file(str(full))
    s = UU.calculate_unit_scale(f)
    groups: dict[tuple, dict] = {}
    for cat, types, how in CATEGORIES:
        for e in _storey_elements(f, None, types):
            if how == "opening":
                w = _mm(getattr(e, "OverallWidth", None) or _qty(e, ("Width",)), s)
                h = _mm(getattr(e, "OverallHeight", None) or _qty(e, ("Height",)), s)
                size = f"{w} × {h} mm" if w and h else ""
            elif how == "layered":
                t = _mm(_layers(e) or _qty(e, ("Width", "Depth", "Thickness")), s)
                size = f"{t} mm thick" if t else ""
            elif how == "profile":
                w, d = _mm(_qty(e, ("Width",)), s), _mm(_qty(e, ("Depth", "Height")), s)
                size = f"{w} × {d} mm" if w and d else ""
            else:
                size = ""
            key = (cat, _type_name(e), size)
            g = groups.setdefault(key, {"category": cat, "type": key[1], "size": size, "count": 0, "levels": set(),
                                        "length_m": 0.0, "area_m2": 0.0, "volume_m3": 0.0, "evidence": [],
                                        "by_level": defaultdict(int)})
            g["count"] += 1
            st = U.get_container(e) or U.get_aggregate(e)
            if st is not None and st.Name:
                g["levels"].add(st.Name)
                g["by_level"][st.Name] += 1
            if cat in ("Walls", "Curtain walls", "Columns", "Beams"):
                g["length_m"] += (_qty(e, ("Length",)) or 0) * s
            if cat in ("Walls", "Curtain walls"):
                g["area_m2"] += (_qty(e, ("NetSideArea", "GrossSideArea")) or 0) * s * s
            if cat in ("Slabs", "Roofs"):
                g["area_m2"] += (_qty(e, ("NetArea", "GrossArea")) or 0) * s * s
            if cat in ("Walls", "Columns", "Beams", "Slabs"):
                g["volume_m3"] += (_qty(e, ("NetVolume", "GrossVolume")) or 0) * s ** 3
            g["evidence"].append(Evidence(file=path, bbox=[], label=f"{cat.lower().rstrip('s')} {e.Name or e.GlobalId}",
                                          kind="ifc", ifc_guid=e.GlobalId))
    rows = sorted(groups.values(), key=lambda g: ([c for c, *_ in CATEGORIES].index(g["category"]), g["type"], g["size"]))
    notes = ["sizes from element attributes and material layers; totals from the model's base quantities"]
    if any(r["size"] == "" and r["category"] in ("Doors", "Windows", "Walls", "Slabs") for r in rows):
        notes.append("blank size: the model doesn't carry that dimension")
    return {"source": "ifc", "rows": rows, "notes": notes}


def _schedule(path: str) -> dict | None:
    from .paths.schedule import extract
    rows: list[dict] = []
    for t in extract(path):
        cat = "Doors" if "door" in t.title.lower() else "Windows" if "window" in t.title.lower() else None
        if cat is None:
            continue
        kt, kw, kh = t.col("type"), t.col("width", "wd"), t.col("height", "ht")
        groups: dict[tuple, dict] = defaultdict(lambda: {"count": 0, "evidence": []})
        for r, box in zip(t.rows, t.boxes):
            typ = r[kt] if kt is not None and kt < len(r) else ""
            w = r[kw] if kw is not None and kw < len(r) else ""
            h = r[kh] if kh is not None and kh < len(r) else ""
            if not (typ or w or h):
                continue   # notes / sub-rows the table reader picked up: no type and no size
            g = groups[(typ, f"{w} × {h}" if w and h else w or h)]
            g["count"] += 1
            g["evidence"].append(Evidence(file=path, bbox=box, label=f"{t.title}: {r[0]}", kind="text"))
        for (typ, size), g in groups.items():
            rows.append({"category": cat, "type": typ or "(no type)", "size": size, "count": g["count"], "levels": set(),
                         "length_m": 0.0, "area_m2": 0.0, "volume_m3": 0.0, "evidence": g["evidence"]})
    if not rows:
        return None
    rows.sort(key=lambda r: (r["category"], r["type"], r["size"]))
    return {"source": "schedule", "rows": rows,
            "notes": ["read from the sheet's door/window schedule; walls, columns and beams need an IFC model"]}


def _detector(path: str) -> dict | None:
    """Scanned plans: counts from the trained detector (no dimensions on a raster)."""
    from .paths import detector
    rows = []
    for cat, q in (("Doors", "How many doors are there?"), ("Windows", "How many windows are there?")):
        a = detector.answer(path, q)
        if a is None or not isinstance(a.value, (int, float)):
            continue
        rows.append({"category": cat, "type": "(detected)", "size": "", "count": int(a.value), "levels": set(),
                     "length_m": 0.0, "area_m2": 0.0, "volume_m3": 0.0, "evidence": a.evidence})
    if not rows:
        return None
    return {"source": "detector", "rows": rows,
            "notes": ["counted by the symbol detector on the scan; a raster carries no dimensions"]}


@lru_cache(maxsize=16)
def _cached(path: str) -> dict | None:
    from .paths.ifc import model_path
    if model_path(path) is not None:
        return _ifc(path)
    if path.lower().endswith(".pdf") and (data_root() / path).exists():
        return _schedule(path)
    if path.lower().endswith((".png", ".jpg", ".jpeg")) and (data_root() / path).exists():
        return _detector(path)
    return None


def takeoff(path: str) -> dict:
    """{"path", "source": ifc|schedule|detector|none, "rows": [...], "notes": [...]}; rows JSON-ready."""
    t = _cached(path)
    if t is None:
        return {"path": path, "source": "none", "rows": [],
                "notes": ["no takeoff for this drawing: needs an IFC model, a sheet with a door/window schedule, or a scan"]}
    rows = [{**r, "levels": sorted(r["levels"]), "length_m": round(r["length_m"], 2), "area_m2": round(r["area_m2"], 2),
             "volume_m3": round(r["volume_m3"], 3), "by_level": dict(r.get("by_level", {})), "evidence": [e.__dict__ for e in r["evidence"]]} for r in t["rows"]]
    return {"path": path, "source": t["source"], "rows": rows, "notes": t["notes"]}


def to_csv(t: dict) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Category", "Type", "Size", "Count", "Levels", "Length (m)", "Area (m2)", "Volume (m3)"])
    for r in t["rows"]:
        w.writerow([r["category"], r["type"], r["size"], r["count"], "; ".join(r["levels"]),
                    r["length_m"] or "", r["area_m2"] or "", r["volume_m3"] or ""])
    return out.getvalue()


# ---- Chat: "How many doors are in the living room and what are their dimensions?" --------------------------
# A router path (see router.PATHS): a count, one Evidence per element, and a table where row i = evidence i.

LIST_CATS = [  # (question words, label, IFC types): plural only, a list is never about one element
    (r"\bdoors\b|türen|døre", "door", ("IfcDoor", "IfcDoorStandardCase")),
    (r"\bwindows\b|fenster|vinduer", "window", ("IfcWindow", "IfcWindowStandardCase")),
    (r"\bcolumns\b|stützen|søjler", "column", ("IfcColumn", "IfcColumnStandardCase")),
    (r"\bbeams\b|träger|bjælker", "beam", ("IfcBeam", "IfcBeamStandardCase")),
    (r"\bwalls\b|wände|vægge", "wall", ("IfcWall", "IfcWallStandardCase")),
]
WANT_LIST = re.compile(r"(?i)\b(dimensions?|sizes?|sized|widths?|heights?|thick\w*|measure\w*|list|schedule of|each|"
                       r"every|all (?:the )?|bill of quantities|take-?off|csv|table|export|abmessung\w*|größe\w*)\b")
# Aggregates, type breakdowns and qualifiers this list can't filter by (exterior, structural...) belong to other
# paths, which Stoa scores: a list would answer them wrong.
NOT_LIST = re.compile(r"(?i)\b(average|mean|median|largest|greatest|smallest|narrowest|widest|biggest|tallest|"
                      r"shortest|longest|maximum|minimum|max|min|types?|kinds?|breakdown|compositions?|materials?|"
                      r"total|sum|percent\w*|ratio|distinct|different|distribution|listed|external|exterior|"
                      r"interior|internal|structural|load-?bearing|main|entrance|insulation|complian\w*|accessib\w*|"
                      r"spans?|defensive|finish\w*|how many rooms)\b")
SINGLE_MARK = re.compile(r"\b\d{2,3}\.[A-Z]\d?\b|\b(?:door|window)\s+(?:no\.?\s*)?\d{2,4}\b|\b[0-9A-Za-z_$]{22}\b", re.I)
QUOTE = re.compile(r"['‘«“„\"]([^'’»”“\"]+)['’»”“\"]")
ROOM_PHRASE = re.compile(r"(?i)\b(?:in|of|for|inside|from)\s+(?:the\s+)?(?:room|space)?\s*"
                         r"([A-Za-z0-9ÄÖÜäöüß][\w ÄÖÜäöüß./()-]{0,40}?)\s*(?:\?|,|\band\b|\bwith\b|\bincluding\b|$)")
LEVEL_PHRASE = re.compile(r"(?i)\b(?:on|at)\s+(?:the\s+)?((?:level|floor|storey|story|etage|geschoss)\s*[\w-]+|[\w-]+\s+(?:level|floor))\b")
STOP = {"model", "drawing", "sheet", "plan", "building", "project", "file", "it", "this", "total", "all", "them",
        "their dimensions", "dimensions", "sizes", "doors", "windows", "columns", "beams", "walls", "slabs",
        "the building", "the model", "whole building", "whole model"}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9äöüß]+", " ", s.lower()).strip()


def _scope(question: str) -> list[str]:
    """Room / level names named in the question, most specific first ('in X' before 'of X')."""
    out = QUOTE.findall(question) + [m.group(1) for m in LEVEL_PHRASE.finditer(question)]
    for kw in ("in", "inside", "for", "from", "of"):   # one search per keyword: matches may overlap
        for m in re.finditer(rf"(?i)\b{kw}\b", question):
            r = ROOM_PHRASE.match(question, m.start())
            if r:
                out.append(r.group(1))
    clean: list[str] = []
    for c in out:
        c = re.sub(r"(?i)^(?:the|room|space)\s+", "", c.strip())
        for v in (c, re.sub(r"(?i)\s+(?:room|space)$", "", c)):   # 'Living Room' first, then 'Living'
            if v and _norm(v) not in STOP and v not in clean and not re.match(r"(?i)(the\s+)?(doors?|windows?)\b", v):
                clean.append(v)
    return clean


def _pick_space(spaces, names: list[str]):
    """IfcSpaces the names mean: exact name / long name, else whole-word containment. Several flats can share a
    room name ('Bedroom 1' in units A and B): all exact matches are returned."""
    def full(s):
        return _norm(f"{s.LongName or ''} {s.Name or ''}")
    for n in names:
        nn = _norm(n)
        exact = [s for s in spaces if nn in (_norm(s.Name or ""), _norm(s.LongName or ""), full(s))]
        if exact:
            return exact, n
        part = [s for s in spaces if re.search(rf"\b{re.escape(nn)}\b", full(s))]
        if part:   # 'bedroom' matching 'Bedroom 1', 'Bedroom 2'...: keep the shortest long name, in every unit
            best = min(len(s.LongName or s.Name or "") for s in part)
            return [s for s in part if len(s.LongName or s.Name or "") == best], n
    return [], None


def _space_label(s) -> str:
    if s.LongName and s.Name and s.LongName != s.Name:
        return f"{s.LongName} ({s.Name})"
    return s.LongName or s.Name or s.GlobalId


def _boundaries(f) -> dict:
    """element guid → IfcSpaces it bounds (IfcRelSpaceBoundary)."""
    out: dict[str, set] = defaultdict(set)
    for b in f.by_type("IfcRelSpaceBoundary"):
        e, sp = b.RelatedBuildingElement, b.RelatingSpace
        if e is not None and sp is not None and sp.is_a("IfcSpace"):
            out[e.GlobalId].add(sp)
    return out


def _in_space_geom(space, elements, scale):
    """Fallback without space boundaries: elements placed inside the room's bounding box (+0.3 m)."""
    import numpy as np
    import ifcopenshell.geom as G
    import ifcopenshell.util.placement as P
    st = G.settings()
    st.set("use-world-coords", True)
    v = np.array(G.create_shape(st, space).geometry.verts).reshape(-1, 3)
    lo, hi = v.min(0) - [0.3, 0.3, 0.5], v.max(0) + [0.3, 0.3, 0.5]
    out = []
    for e in elements:
        if e.ObjectPlacement is not None:
            p = np.array(P.get_local_placement(e.ObjectPlacement)[:3, 3]) * scale
            if (p >= lo).all() and (p <= hi).all():
                out.append(e)
    return out


def _ifc_list(path: str, question: str, label: str, types: tuple):
    import ifcopenshell.util.element as U
    import ifcopenshell.util.unit as UU
    from .answer import Answer
    from .paths.ifc import _file, _qty, _storey_elements, model_path
    f = _file(str(model_path(path)))
    s = UU.calculate_unit_scale(f)
    names = _scope(question)
    elements = _storey_elements(f, None, types)
    bounds = _boundaries(f)
    trace, conf, storey = [], 0.95, None
    rooms, said = _pick_space(f.by_type("IfcSpace"), names) if names else ([], None)
    space = rooms[0] if rooms else None
    if rooms:
        what = ", ".join(_space_label(r) for r in rooms)
        trace.append(f"you asked about '{said}': matched {'room' if len(rooms) == 1 else f'{len(rooms)} rooms'} "
                     f"{what} in the BIM model")
        if any(bounds.get(e.GlobalId) for e in elements):
            elements = [e for e in elements if bounds.get(e.GlobalId, set()) & set(rooms)]
            trace.append(f"the model's space boundaries link {len(elements)} {label}(s) to "
                         f"{'this room' if len(rooms) == 1 else 'these rooms'}")
        else:
            elements = [e for r in rooms for e in _in_space_geom(r, elements, s)]
            conf = 0.75
            trace.append(f"the model has no space boundaries for {label}s, so I took those placed inside the "
                         f"room's footprint (+0.3 m): {len(elements)}")
    elif names:
        storeys = [st for st in f.by_type("IfcBuildingStorey") if st.Name]
        hit = next(((n, st) for n in names for st in storeys if _norm(n) == _norm(st.Name)), None)
        if hit is None:
            return None   # names a room/level this model doesn't have: let other paths try
        said, storey = hit
        elements = [e for e in elements if (U.get_container(e) or U.get_aggregate(e)) == storey]
        trace.append(f"matched level '{storey.Name}': {len(elements)} {label}(s) on it")
    else:
        trace.append(f"no room or level named, so I list every {label} in the model ({len(elements)})")

    opening = label in ("door", "window")
    cols = (["#", "Mark", "Name", "Type", "Width (mm)", "Height (mm)", "Level", "Rooms it connects", "IFC GUID"]
            if opening else ["#", "Mark", "Name", "Type", "Size", "Length (m)", "Level", "IFC GUID"])
    rows, ev, groups = [], [], defaultdict(int)
    for i, e in enumerate(sorted(elements, key=lambda e: (e.Tag or e.Name or "", e.GlobalId)), 1):
        st = U.get_container(e) or U.get_aggregate(e)
        lvl = st.Name if st is not None and st.Name else ""
        mark = e.Tag or ""
        name = (e.Name or "").split(":")[0]   # Revit: 'Family:Type:id' -> family
        if opening:
            w = _mm(getattr(e, "OverallWidth", None) or _qty(e, ("Width",)), s)
            h = _mm(getattr(e, "OverallHeight", None) or _qty(e, ("Height",)), s)
            conn = " ↔ ".join(sorted(_space_label(x) for x in bounds.get(e.GlobalId, ())))
            size = f"{w} × {h} mm" if w and h else "size not in model"
            rows.append([i, mark, name, _type_name(e), w or "", h or "", lvl, conn, e.GlobalId])
        else:
            t, d = _layers(e) or _qty(e, ("Width",)), _qty(e, ("Depth", "Height"))
            size = (f"{_mm(t, s)} mm thick" if label == "wall" and t else
                    f"{_mm(t, s)} × {_mm(d, s)} mm" if t and d else "size not in model")
            ln = _qty(e, ("Length",))
            rows.append([i, mark, name, _type_name(e), size, round(ln * s, 2) if ln else "", lvl, e.GlobalId])
        groups[size] += 1
        ev.append(Evidence(file=path, bbox=[], label=f"{label} {mark or name} · {size}", kind="ifc", ifc_guid=e.GlobalId))
    if rooms and not elements:
        trace.append(f"no {label} bounds {'this room' if len(rooms) == 1 else 'these rooms'} in the model: "
                     "it is probably open to a neighbouring space")
    if opening:
        trace.append(f"sizes from each {label}'s OverallWidth × OverallHeight (model units → mm)")
    summary = "; ".join(f"{n} × {g}" for g, n in sorted(groups.items(), key=lambda x: -x[1]))
    if rows:
        trace.append("result: " + summary)
    where = ((_space_label(space) if len(rooms) == 1 else f"{said} ({len(rooms)} rooms)") if rooms
             else storey.Name if storey is not None else "the model")
    value, unit = _value(question, len(rows), label, summary)
    return Answer(value=value, unit=unit, method="takeoff", confidence=conf, evidence=ev, trace=trace,
                  table={"title": f"{label.capitalize()}s in {where}", "columns": cols, "rows": rows})


def _value(question: str, n: int, label: str, summary: str):
    """'How many…' gets the count; 'what size…' gets the sizes, so the chat answer reads on its own."""
    if re.search(r"(?i)\bhow many\b|\bnumber of\b|\bcount\b|wie viele|hvor mange", question) or not summary:
        return n, "count"
    return f"{n} {label}{'s' if n != 1 else ''}: {summary}", None


def _schedule_list(path: str, question: str, label: str):
    from .answer import Answer
    from .paths.schedule import extract
    tables = [t for t in extract(path) if label in t.title.lower()]
    if not tables:
        return None
    t = max(tables, key=lambda t: len(t.rows))
    names = _scope(question)
    trace = [f"read the {t.title.lower()} on this sheet: {len(t.rows)} rows; columns "
             + ", ".join(h for h in t.header if h)]
    idx, n = list(range(len(t.rows))), None
    if names:
        def hit(r, n):
            nn = _norm(n)
            return any(c and (nn == _norm(c) or re.search(rf"\b{re.escape(nn)}\b", _norm(c))) for c in r)
        n = next((n for n in names if any(hit(r, n) for r in t.rows)), None)
        if n is None:
            return None
        idx = [i for i, r in enumerate(t.rows) if hit(r, n)]
        trace.append(f"kept the rows that name '{n}': {len(idx)}")
    else:
        trace.append(f"no room named, so I list every row ({len(idx)})")
    trace.append("each row is cited on the sheet; sizes exactly as printed in the schedule")
    keep = [k for k in range(len(t.header)) if t.header[k] or any(k < len(t.rows[i]) and t.rows[i][k] for i in idx)]
    cols = ["#"] + [t.header[k] or f"col {k + 1}" for k in keep]
    rows = [[n_ + 1] + [t.rows[i][k] if k < len(t.rows[i]) else "" for k in keep] for n_, i in enumerate(idx)]
    ev = [Evidence(file=path, bbox=t.boxes[i], label=" | ".join(c for c in t.rows[i] if c)[:80], kind="text") for i in idx]
    kw, kh = t.col("width", "wd"), t.col("height", "ht")
    sizes: dict[str, int] = defaultdict(int)
    for i in idx:
        r = t.rows[i]
        w = r[kw] if kw is not None and kw < len(r) else ""
        h = r[kh] if kh is not None and kh < len(r) else ""
        if w or h:
            sizes[f"{w} × {h}" if w and h else w or h] += 1
    summary = "; ".join(f"{c} × {s}" for s, c in sorted(sizes.items(), key=lambda x: -x[1]))
    if summary:
        trace.append("result: " + summary)
    value, unit = _value(question, len(rows), label, summary)
    return Answer(value=value, unit=unit, method="takeoff", confidence=0.85, evidence=ev, trace=trace,
                  table={"title": f"{label.capitalize()}s in {repr(n) if n else 'the schedule'}", "columns": cols, "rows": rows})


def answer(path: str, question: str):
    """Router path. Only questions asking for a list or sizes of a category, never one marked element."""
    cat = next(((label, types) for rx, label, types in LIST_CATS if re.search(rx, question, re.I)), None)
    if cat is None or not WANT_LIST.search(question) or SINGLE_MARK.search(question) or NOT_LIST.search(question):
        return None
    from .paths.ifc import model_path
    if model_path(path) is not None:
        return _ifc_list(path, question, *cat)
    if path.lower().endswith(".pdf") and cat[0] in ("door", "window") and (data_root() / path).exists():
        return _schedule_list(path, question, cat[0])
    return None


if __name__ == "__main__":
    import sys
    t = takeoff(sys.argv[1])
    sys.stdout.write(to_csv(t))
    print(*t["notes"], sep="\n", file=sys.stderr)
