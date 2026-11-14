"""IFC path: answers room-area questions straight from the BIM model. No model calls, cost 0.
Measured on the preview: 782/804 room-area questions within 2%.
Plan PDFs `<model>_plan-*.pdf` were rendered from `<model>.ifc`, so they route here too."""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from .. import data_root
from ..answer import Answer, Evidence

QUOTED = re.compile(r"['‘«“„]([^'’»”“]+)['’»”“]")
AREA_KEY = re.compile(r"(?i)^(?!.*(gross|brutto)).*(netfloorarea|net floor area|netarea|pindala|nettoareal|nettofl.che|^area$)")


def model_path(path: str) -> Path | None:
    p = re.sub(r"_plan-.*\.(pdf|svg)$", ".ifc", path)
    full = data_root() / p
    return full if p.endswith(".ifc") and full.exists() else None


@lru_cache(maxsize=8)
def spaces(ifc_file: str) -> list[dict]:
    import ifcopenshell
    import ifcopenshell.util.element as U
    f = ifcopenshell.open(ifc_file)
    out = []
    for s in f.by_type("IfcSpace"):
        area = None
        for pset in U.get_psets(s).values():
            for k, v in pset.items():
                if area is None and AREA_KEY.search(k):
                    try:
                        area = float(str(v).replace(",", "."))
                    except ValueError:
                        pass
        if not area:
            area = _footprint_area(s)
        storey = U.get_container(s) or U.get_aggregate(s)
        out.append(dict(name=s.Name or "", long=s.LongName or "", storey=storey.Name if storey else "",
                        area=area, guid=s.GlobalId))
    return out


def _footprint_area(space) -> float | None:
    """Floor area from the space's mesh: sum of downward-facing triangles."""
    try:
        import numpy as np
        import ifcopenshell.geom as G
        st = G.settings()
        st.set("use-world-coords", True)
        g = G.create_shape(st, space).geometry
        v = np.array(g.verts).reshape(-1, 3)
        t = np.array(g.faces).reshape(-1, 3)
        n = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
        a = np.linalg.norm(n, axis=1) / 2
        down = n[:, 2] < -0.9 * np.linalg.norm(n, axis=1)
        return round(float(a[down].sum()), 2) or None
    except Exception:
        return None


def _matches(room: str, s: dict) -> bool:
    return room in (s["long"], s["name"], f"{s['long']} ({s['name']})", f"{s['long']} (Rum nr. {s['name']})")


ELEMENTS = [  # question keyword (en / da / et / de / fi) → IFC types
    (r"(?i)\bdoors?\b|døre|\bust\b|türen|ovea", ("IfcDoor",)),
    (r"(?i)windows?|vinduer|akne|aken|fenster|ikkun", ("IfcWindow",)),
    (r"(?i)columns?|søjler|sammas|stützen|pilar", ("IfcColumn",)),
    (r"(?i)stairs?|trapper|trepp|treppen|portai", ("IfcStair",)),
    (r"(?i)slabs?|dæk|plaat|platten|laatt", ("IfcSlab",)),
    (r"(?i)walls?|vægge|sein|wände|seini", ("IfcWall", "IfcWallStandardCase", "IfcCurtainWall")),
    (r"(?i)rooms?|spaces?|\brum\b|ruumi|räume|tilo|huone", ("IfcSpace",)),
]
MEASURE = [  # (question pattern, quantity names, kind, unit)
    (r"(?i)side area|sideareal|külgpind|seitenfläche", ("NetSideArea", "GrossSideArea"), "area", "m2"),
    (r"(?i)volume|volumen|maht|ruumala|tilavuus", ("NetVolume", "GrossVolume"), "volume", "m3"),
    (r"(?i)length|længde|pikkus|länge|pituus", ("Length",), "length", "m"),
]


@lru_cache(maxsize=8)
def _file(ifc_file: str):
    import ifcopenshell
    return ifcopenshell.open(ifc_file)


def _storey_elements(f, storey: str | None, types) -> list:
    import ifcopenshell.util.element as U
    out = []
    for t in types:
        for e in f.by_type(t, include_subtypes=False) if t != "IfcWall" else f.by_type("IfcWall", include_subtypes=False):
            if e.Decomposes and e.Decomposes[0].RelatingObject.is_a(t):
                continue  # part of a bigger element (e.g. stair flights inside an IfcStair)
            st = U.get_container(e) or U.get_aggregate(e)
            if storey is None or (st is not None and st.Name == storey):
                out.append(e)
    return out


def _qty(e, names) -> float | None:
    import ifcopenshell.util.element as U
    q = U.get_psets(e, qtos_only=True)
    for qs in (q.get("BaseQuantities"),) + tuple(v for k, v in q.items() if k != "BaseQuantities"):
        if not qs:
            continue
        for n in names:
            if isinstance(qs.get(n), (int, float)):
                return float(qs[n])
    return None


def _aggregate(ifc: Path, question: str) -> Answer | None:
    """Counts and quantity totals per storey: 'How many doors on X', 'total length of all walls on X'."""
    import ifcopenshell.util.unit as UU
    quoted = QUOTED.findall(question)
    if len(quoted) != 1:
        return None
    storey = quoted[0]
    f = _file(str(ifc))
    whole_model = storey not in {s.Name for s in f.by_type("IfcBuildingStorey")}
    if whole_model and not re.search(r"(?i)in the model|i modellen|mudelis|im modell", question):
        return None
    if re.search(r"(?i)sanitary|sanitær|sanitaar", question):
        types = ("IfcSanitaryTerminal", "IfcFlowTerminal")
    else:
        types = next((t for rx, t in ELEMENTS if re.search(rx, question)), None)
    if types is None:
        return None
    if types == ("IfcSpace",) and re.search(r"(?i)area|areal|pind|fläche", question) and not whole_model:
        rs = [x for x in spaces(str(ifc)) if x["storey"] == storey and x["area"]]
        if not rs:
            return None
        total = round(sum(x["area"] for x in rs), 2)
        rel = str(ifc.relative_to(data_root())).replace("\\", "/")
        return Answer(value=total, unit="m2", method="ifc", confidence=0.85,
                      evidence=[Evidence(file=rel, bbox=[], kind="ifc", ifc_guid=x["guid"], label=f"{x['long']} {x['area']} m²")
                                for x in rs],
                      trace=[f"{len(rs)} spaces on '{storey}'", f"sum of areas = {total} m²"])
    els = _storey_elements(f, None if whole_model else storey, types)
    rel = str(ifc.relative_to(data_root())).replace("\\", "/")
    ev = [Evidence(file=rel, bbox=[], kind="ifc", ifc_guid=e.GlobalId, label=f"{e.is_a()} {e.Name or ''}".strip())
          for e in els]
    measure = next((m for m in MEASURE if re.search(m[0], question)), None)
    if measure is None:
        if not re.search(r"(?i)how many|hvor mange|mitu|wie viele|kuinka monta", question):
            return None
        return Answer(value=len(els), unit="count", method="ifc", confidence=0.85, evidence=ev,
                      trace=[f"{'/'.join(types)} on storey '{storey}': {len(els)}"])
    _, names, kind, unit = measure
    if types == ("IfcSpace",) and kind == "area":
        return None
    vals = [_qty(e, names) for e in els]
    if not els or any(v is None for v in vals):
        return None
    scale = UU.calculate_unit_scale(f, {"length": "LENGTHUNIT", "area": "AREAUNIT", "volume": "VOLUMEUNIT"}[kind])
    total = round(sum(vals) * scale, 3)
    return Answer(value=total, unit=unit, method="ifc", confidence=0.85, evidence=ev,
                  trace=[f"{len(els)} {'/'.join(types)} on '{storey}'", f"sum of {names[0]} = {total} {unit}"])


def answer(path: str, question: str) -> Answer | None:
    ifc = model_path(path)
    if ifc is None:
        return None
    if re.search(r"(?i)total|samlede|kokku|gesamt|yhteens|how many|hvor mange|mitu|wie viele", question) and \
            not re.search(r"(?i)floor area of the room|nettoareal af rummet|netopõrandapind", question):
        a = _aggregate(ifc, question)
        if a is not None or not re.search(r"(?i)rooms|spaces|rum|ruumi", question):
            return a
    if not re.search(r"(?i)area|m²|m2|pind|areal|fl.che|superficie", question):
        return None  # TODO (T4): counts, wall lengths, slab volumes, text questions
    quoted = QUOTED.findall(question)
    if len(quoted) < 2:
        return None  # TODO (ifc ticket): counts, wall lengths, slab volumes, text questions
    room, storey = quoted[0], quoted[1]
    hits = [s for s in spaces(str(ifc)) if s["storey"] == storey and _matches(room, s)]
    if not hits or not hits[0]["area"]:
        return None
    s = hits[0]
    return Answer(
        value=round(s["area"], 2), unit="m2", method="ifc", confidence=0.95,
        evidence=[Evidence(file=str(ifc.relative_to(data_root())).replace("\\", "/"), bbox=[], kind="ifc",
                           ifc_guid=s["guid"], label=f"{s['long']} ({s['name']}) on {s['storey']}")],
        trace=[f"IfcSpace {s['name']} '{s['long']}' on storey '{s['storey']}'", f"area property = {s['area']} m²"],
    )
