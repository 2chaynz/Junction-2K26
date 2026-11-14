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


if __name__ == "__main__":
    import sys
    t = takeoff(sys.argv[1])
    sys.stdout.write(to_csv(t))
    print(*t["notes"], sep="\n", file=sys.stderr)
