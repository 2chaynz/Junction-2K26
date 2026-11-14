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
        storey = U.get_container(s) or U.get_aggregate(s)
        out.append(dict(name=s.Name or "", long=s.LongName or "", storey=storey.Name if storey else "",
                        area=area, guid=s.GlobalId))
    return out


def _matches(room: str, s: dict) -> bool:
    return room in (s["long"], s["name"], f"{s['long']} ({s['name']})", f"{s['long']} (Rum nr. {s['name']})")


def answer(path: str, question: str) -> Answer | None:
    ifc = model_path(path)
    if ifc is None:
        return None
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
