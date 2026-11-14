"""Facts path: free-form questions answered over facts our parsers already extracted.

The specific paths (ifc, vector, detector, schedule) only parse question shapes seen in the dataset.
This path builds a numbered fact list for the drawing from the same parsers (Swiss rooms/apartments/
symbols, detector boxes, IFC storeys/spaces/element counts, schedule tables), asks Gemini to answer
from those facts only and to cite fact ids. Cited facts become the evidence boxes, so every answer is
still checkable on the drawing. Runs after the specific paths, before the image VLM.

Needs GEMINI_API_KEY; model SITELENS_FACTS_MODEL (default gemini-3.8-flash). Off without a key.
"""
from __future__ import annotations

import json
import os
import re
import urllib.request
from functools import lru_cache

from .. import data_root
from ..answer import Answer, Evidence

EUR_PER_MTOK = (0.30, 2.50)
MAX_FACTS = 900

PROMPT = """You answer questions about one construction drawing. You cannot see it; you get the facts that
were extracted from it, one per line as `id | kind | details`. Use only these facts. Count and add up
carefully. If the facts don't contain the answer, say so.
Drawing: {path}
Question: {q}

Facts:
{facts}

Reply with JSON only: {{"answer": <number when the question asks for a count/area/length, otherwise a short
sentence in the question's language>, "unit": <"count" | "m2" | "m" | "m3" | "ft2" | null>,
"facts": [<ids of the facts you used, e.g. "F12">], "reasoning": "<one short line: how you got it>",
"answerable": <true|false>}}"""


# ---------- fact builders: return [(fact_text, Evidence | None)] ----------

def _swiss(path: str):
    from . import vector as V
    stem = path.rsplit(".", 1)[0]
    plan = V.load(stem)
    if plan is None:
        return []
    out = []
    unit_of = {}
    for letter, poly in plan.units.items():
        for r in plan.rooms:
            if r.number and V._pip(r.text_xy, poly):
                unit_of[id(r)] = letter
    for letter in sorted(plan.units):
        b = V._bbox(plan.units[letter])
        out.append((f"apartment | apartment {letter}", V._ev(plan, stem, b, f"apartment {letter}")))
    for r in plan.rooms:
        apt = unit_of.get(id(r))
        out.append((f"room | '{r.name}' number {r.number or '-'} | net area {r.area} m2"
                    + (f" | in apartment {apt}" if apt else " | not in an apartment (shared)"),
                    V._room_ev(plan, stem, r)))
    names = {"door": "door", "window": "window", "toilet": "toilet (WC seat)", "basin": "washbasin",
             "tub": "bathtub", "shower": "shower"}
    for kind, label in names.items():
        for b in plan.objects.get(kind, []):
            out.append((f"symbol | {label}", V._ev(plan, stem, b, label)))
    return out


def _sheet_words(path: str) -> list[str]:
    """Title block / annotation text of a PDF (scale, project, floor name)."""
    import pymupdf
    full = data_root() / path
    if not str(full).lower().endswith(".pdf") or not full.exists():
        return []
    txt = pymupdf.open(full)[0].get_text()
    keep = [l.strip() for l in txt.splitlines() if re.search(r"(?i)scale|massstab|échelle|scala|1:\d+|grundriss|plan|floor|"
                                                               r"geschoss|étage|piano|project|projekt|site", l)]
    return list(dict.fromkeys(keep))[:15]


def _raster(path: str):
    from . import detector as D
    if D._model() is None:
        return []
    labels = {"room_bedroom": "room: bedroom", "room_bath": "room: bathroom/washroom", "room_wc": "room: separate WC",
              "room_kitchen": "room: kitchen", "room_sauna": "room: sauna", "room_outdoor": "room: balcony/terrace (outdoor)",
              "room_living": "room: living room", "room_entry": "room: entry/hall", "room_storage": "room: storage",
              "room_utility": "room: utility", "room_garage": "room: garage", "floor": "storey (one floor level)",
              "sauna_bench": "sauna bench", "toilet": "toilet (WC seat)", "sink": "sink/washbasin"}
    out = []
    for cls, p, b in D.detect(path):
        # counting thresholds are tuned for exact counts; for facts keep anything plausible, show confidence
        t = min(0.5, D.CONF.get(cls, 0.3 if cls in ("shower", "bathtub") else D.CONF["default"]))
        if p < t:
            continue
        lab = labels.get(cls, cls.replace("_", " "))
        out.append((f"detected | {lab} | confidence {p:.2f} | box x {b[0]:.0f}-{b[2]:.0f}, y {b[1]:.0f}-{b[3]:.0f}",
                    Evidence(file=path, bbox=list(b), label=f"{lab} {p:.2f}")))
    return out


@lru_cache(maxsize=4)
def _ifc_open(fn: str):
    import ifcopenshell
    return ifcopenshell.open(fn)


def _ifc(path: str):
    from . import ifc as I
    fn = I.model_path(path)
    if fn is None:
        return []
    f = _ifc_open(str(fn))
    rel = str(fn.relative_to(data_root())).replace("\\", "/")
    out = []
    storeys = sorted(f.by_type("IfcBuildingStorey"), key=lambda s: float(getattr(s, "Elevation", 0) or 0))
    for s in storeys:
        out.append((f"storey | '{s.Name}' | elevation {getattr(s, 'Elevation', None)}", None))
    for t in ("IfcDoor", "IfcWindow", "IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcStair", "IfcColumn", "IfcBeam",
              "IfcSpace", "IfcFlowTerminal", "IfcRailing", "IfcRoof"):
        try:
            n = len(f.by_type(t))
        except RuntimeError:
            continue
        if n:
            out.append((f"element count | {t} | {n}", None))
    for s in I.spaces(str(fn)):
        out.append((f"space | '{s['long']}' ({s['name']}) | storey '{s['storey']}' | area {s['area']} m2",
                    Evidence(file=rel, bbox=[], kind="ifc", ifc_guid=s["guid"], label=f"{s['long']} ({s['name']})")))
    return out


def _tables(path: str):
    try:
        from . import schedule as S
    except ImportError:
        return []
    out = []
    for t in S.extract(path):
        out.append((f"table | '{t.title}' | columns: " + " / ".join(t.header), None))
        for r, b in zip(t.rows, t.boxes):
            out.append((f"row of '{t.title}' | " + " / ".join(c for c in r if c), Evidence(file=path, bbox=b, label=r[0])))
    return out


def facts_for(path: str) -> list[tuple[str, Evidence | None]]:
    src = path.split("/")[1] if "/" in path else ""
    low = path.lower()
    if src == "swiss_dwellings":
        F = _swiss(path)
    elif low.endswith((".png", ".jpg", ".jpeg")):
        F = _raster(path)
    elif src in ("ifc_models", "ifc_bench"):
        F = _ifc(path)
    elif low.endswith(".pdf"):
        F = _tables(path)
    else:
        F = []
    if low.endswith(".pdf"):
        F += [(f"sheet text | {w}", None) for w in _sheet_words(path)]
    return F[:MAX_FACTS]


# ---------- answer ----------

def _gemini(prompt: str):
    key = os.environ.get("GEMINI_API_KEY")
    model = os.environ.get("SITELENS_FACTS_MODEL", "gemini-3.8-flash")
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0}}
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": key})
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.load(r)
    u = d.get("usageMetadata", {})
    cost = (u.get("promptTokenCount", 0) * EUR_PER_MTOK[0]
            + (u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0)) * EUR_PER_MTOK[1]) / 1e6
    text = d["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text[text.find("{"): text.rfind("}") + 1]), cost, model


def answer(path: str, question: str) -> Answer | None:
    if not os.environ.get("GEMINI_API_KEY"):
        return None
    F = facts_for(path)
    if not F:
        return None
    lines = "\n".join(f"F{i} | {t}" for i, (t, _) in enumerate(F))
    j, cost, model = _gemini(PROMPT.format(path=path.rsplit("/", 1)[-1], q=question, facts=lines))
    if not j.get("answerable", True) or j.get("answer") in (None, ""):
        return None
    ids = [int(m) for x in j.get("facts") or [] for m in re.findall(r"\d+", str(x)) if int(m) < len(F)]
    ev = [F[i][1] for i in dict.fromkeys(ids) if F[i][1] is not None]
    v = j["answer"]
    if isinstance(v, str) and re.fullmatch(r"-?\d+(\.\d+)?", v.strip()):
        v = float(v)
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return Answer(value=v, unit=j.get("unit"), method="facts+llm", confidence=0.6, cost_eur=round(cost, 6),
                  evidence=ev,
                  trace=[f"{len(F)} facts extracted from the drawing (no image sent)",
                         f"{model}: {j.get('reasoning', '')}".strip(),
                         f"cited {len(ids)} fact(s)"])
