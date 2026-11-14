"""Ask back instead of guessing: vague questions get a question + options taken from the drawing.

Rules first (free): a count on a multi-storey IFC with no storey named → which floor; an area with no
room named → which area. Then, for short questions that name nothing, Gemini with the drawing's
extracted facts decides whether the question is clear and suggests full, answerable reformulations.
The server never runs this on Stoa's own questions, so scores can't move.
"""
from __future__ import annotations

import os
import re

COUNT = re.compile(r"(?i)how many|hvor mange|mitu|wie viele|kuinka monta|combien|quant[io]|number of|\bcount\b")
AREA = re.compile(r"(?i)\barea\b|m²|\bm2\b|areal|pind|fläche|surface|superficie|pinta-ala")
LENGTH = re.compile(r"(?i)length|længde|pikkus|länge|pituus|longueur")
VOLUME = re.compile(r"(?i)volume|volumen|maht|ruumala|tilavuus")
WHOLE = re.compile(r"(?i)in the model|whole|entire|all floors|building|total|sum|i modellen|gesamt|kokku|yhteens|tout")
NAMED = re.compile(r"\d|['‘’«»“”„\"]")  # a number or a quote: the user named a room, storey or label
QUOTED = re.compile(r"['‘«“„\"]([^'’»”“\"]+)['’»”“\"]")
NOUNS = ["doors", "windows", "walls", "rooms", "spaces", "toilets", "sinks", "bathtubs", "showers", "columns",
         "stairs", "slabs", "beams", "apartments", "bedrooms", "bathrooms", "kitchens"]

PROMPT = """You are SiteLens's question checker. A user asked a question about one construction drawing.
Decide whether it is clear enough to answer exactly from the drawing.
- NOT clear: it could mean several different quantities and the facts show several candidates
  (which room? which floor? which element type? one apartment or the whole floor?).
- Clear: short but unambiguous questions ("how many doors?" on a one-floor plan), and questions that are
  not about the drawing's content at all ("how does this work?").
If not clear, write ONE short question back, in the user's language, and 2 to 4 options. Each option is a
complete, self-contained question in the user's language that names exactly what to measure, using names
that appear in the facts (room names and numbers, storey names in single quotes).
Drawing: {name}
Question: {q}
Facts (excerpt, one per line):
{facts}
Reply with JSON only: {{"about_drawing": true or false, "clear": true or false, "why": "<one short line>",
"ask": "...", "options": ["..."]}}"""


def _noun(question: str) -> str | None:
    q = question.lower()
    return next((n for n in NOUNS if re.search(rf"\b{n[:-1]}s?\b", q)), None)


def understand(question: str) -> str:
    """One first-person line restating what is asked, shown as the first reasoning step."""
    kind = ("how many" if COUNT.search(question) else "an area" if AREA.search(question)
            else "a length" if LENGTH.search(question) else "a volume" if VOLUME.search(question) else None)
    noun = _noun(question)
    names = QUOTED.findall(question)
    if kind is None:
        return "Let me work out what this question needs from the drawing."
    where = f" ({', '.join(repr(n) for n in names[:2])})" if names else ""
    if kind == "how many":
        what = f"to count {noun}" if noun else "a count"
    else:
        what = kind + (f" of {noun}" if noun else "")
    return f"You want {what}{where}. Let me find the reader that can measure that exactly."


def _ifc_storeys(path: str, noun: str | None = None) -> list[str]:
    """Storey names, bottom up; with a noun, only storeys that have such elements, most first."""
    from .paths import ifc as I
    fn = I.model_path(path)
    if fn is None:
        return []
    f = I._file(str(fn))
    st = sorted(f.by_type("IfcBuildingStorey"), key=lambda s: float(getattr(s, "Elevation", 0) or 0))
    names = [s.Name for s in st if s.Name]
    types = next((t for rx, t in I.ELEMENTS if noun and re.search(rx, noun)), None)
    if types is None:
        return names
    n = {s: len(I._storey_elements(f, s, types)) for s in names}
    return sorted((s for s in names if n[s]), key=lambda s: -n[s])


def _rooms(path: str) -> list[tuple[str, str, float]]:
    """(number, name, area) of labelled rooms on a Swiss vector plan, largest first."""
    if "/swiss_dwellings/" not in path:
        return []
    from .paths import vector as V
    plan = V.load(path.rsplit(".", 1)[0])
    if plan is None:
        return []
    rs = [(r.number, r.name, r.area) for r in plan.rooms if r.number and r.area]
    return sorted(rs, key=lambda r: -r[2])


def _rules(path: str, question: str) -> dict | None:
    named, whole = NAMED.search(question), WHOLE.search(question)
    if named or whole:
        return None
    is_ifc = path.endswith(".ifc") or "_plan-" in path and "/ifc_" in path
    if is_ifc and COUNT.search(question) and (noun := _noun(question)):
        st = _ifc_storeys(path, noun)
        if len(st) > 1:
            return {"why": f"{noun.capitalize()} are on {len(st)} floors of this model and you didn't say which one.",
                    "ask": f"Which floor? {noun.capitalize()} are on {len(st)} floors:",
                    "options": [f"How many {noun} are shown on the floor plan of '{s}'?" for s in st[:5]]}
    if AREA.search(question) and not COUNT.search(question):
        if is_ifc:
            st = _ifc_storeys(path, "spaces")
            if st:
                return {"why": "An area needs a room or a floor, and none was named.",
                        "ask": "Which area: all rooms on a floor, or one room?",
                        "options": [f"What is the total net floor area of all rooms on '{s}', in m²?" for s in st[:5]]}
        rooms = _rooms(path)
        if len(rooms) > 1:
            opts = [f"What is the net floor area of room {n} ('{name}') in m²?" for n, name, _ in rooms[:4]]
            return {"why": f"This plan has {len(rooms)} rooms with an area, and none was named.",
                    "ask": f"Which area? This plan has {len(rooms)} rooms; the largest are:", "options": opts}
    return None


def _llm(path: str, question: str) -> dict | None:
    if not os.environ.get("GEMINI_API_KEY") or NAMED.search(question) or len(question.split()) > 8:
        return None
    from .paths import facts as F
    lines = [t for t, _ in F.facts_for(path)][:200]
    if not lines:
        return None
    try:
        j, cost, _ = F._gemini(PROMPT.format(name=path.rsplit("/", 1)[-1], q=question, facts="\n".join(lines)))
    except Exception:
        return None  # checking is a bonus: on failure, just try to answer
    if j.get("about_drawing") is False:
        return {"general": True, "cost_eur": round(cost, 6)}  # skip the readers, answer it in general
    opts = [o for o in j.get("options") or [] if isinstance(o, str) and o.strip()][:4]
    if j.get("clear", True) or not j.get("ask") or len(opts) < 2:
        return None
    return {"why": j.get("why") or "The question could mean several things on this drawing.",
            "ask": j["ask"], "options": opts, "cost_eur": round(cost, 6)}


def check(path: str, question: str) -> dict | None:
    """{"why", "ask", "options", "cost_eur"} when the question is too vague to answer exactly;
    {"general": True, "cost_eur"} when it isn't about the drawing at all; else None."""
    c = _rules(path, question) or _llm(path, question)
    if c:
        c.setdefault("cost_eur", 0.0)
    return c
