"""Cross-check path: does the door schedule agree with the plans in the same drawing set?

Set = every page of every PDF in the asked sheet's folder (one issue). Door marks (101.A, 208.J) are read from
the text layer. Schedule rows = marks at the start of a dense text row on a page titled DOOR SCHEDULE; every
other mark is a drawn tag. Reports: scheduled but not drawn, drawn but not scheduled, and marks whose number
doesn't match the room the schedule puts them in. Each conflict cites both sides. No model calls.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from .. import data_root
from ..answer import Answer, Evidence

ASK = re.compile(r"(?i)\b(conflicts?|cross-?check\w*|discrepanc\w*|inconsisten\w*|mismatch\w*|consistent|match(es)?|agree)\b")
TOPIC = re.compile(r"(?i)\b(doors?|schedules?|plans?|sets?|drawings?|sheets?)\b")
MARK = re.compile(r"^(\d{2,3})\.[A-Z]\d?$")
ROOM = re.compile(r"^\d{3}$")
ROW_MIN_WORDS = 5     # a schedule row has the mark plus size / type / material columns to its right
ROW_REACH = 600.0     # pt to the right of the mark that still counts as the same row


@dataclass
class Hit:
    file: str
    page: int
    bbox: list[float]
    room: str | None = None   # schedule rows only


@dataclass
class SetIndex:
    scheduled: dict[str, Hit] = field(default_factory=dict)
    drawn: dict[str, list[Hit]] = field(default_factory=dict)
    schedule_pages: list[tuple[str, int]] = field(default_factory=list)
    pages: int = 0


def _open(p: Path):
    import pymupdf
    s = str(p.resolve())
    if os.name == "nt" and len(s) > 250:   # Stoa folder names push some sheets past MAX_PATH
        s = "\\\\?\\" + s
    return pymupdf.open(s)


def _rows(words, page_no: int, rel: str, idx: SetIndex):
    """Schedule rows on one DOOR SCHEDULE page; returns the marks that are rows, so the rest count as drawn."""
    used = set()
    for i, w in enumerate(words):
        if not MARK.match(w[4]):
            continue
        yc = (w[1] + w[3]) / 2
        row = [x for x in words if abs((x[1] + x[3]) / 2 - yc) < 2 and -2 < x[0] - w[0] < ROW_REACH]
        left = [x for x in words if abs((x[1] + x[3]) / 2 - yc) < 2 and 0 < w[0] - x[0] < 200 and MARK.match(x[4])]
        if len(row) < ROW_MIN_WORDS or left:
            if len(row) >= ROW_MIN_WORDS:
                used.add(i)   # repeat mark column inside a row: neither a row nor a drawn tag
            continue
        used.add(i)
        x1 = max(x[2] for x in row)
        room = next((x[4] for x in sorted(row, key=lambda x: x[0]) if ROOM.match(x[4])), None)
        idx.scheduled.setdefault(w[4], Hit(rel, page_no, [w[0], min(x[1] for x in row), x1, max(x[3] for x in row)], room))
    return used


@lru_cache(maxsize=16)
def index(folder_rel: str) -> SetIndex:
    import pymupdf
    idx = SetIndex()
    root = data_root()
    for f in sorted((root / folder_rel).glob("*.pdf")):
        rel = f"{folder_rel}/{f.name}"
        try:
            doc = _open(f)
        except Exception:
            continue
        for pno, page in enumerate(doc):
            idx.pages += 1
            M = page.rotation_matrix
            words = []
            for w in page.get_text("words"):
                r = pymupdf.Rect(w[:4]) * M
                words.append((r.x0, r.y0, r.x1, r.y1, w[4]))
            used: set[int] = set()
            if re.search(r"(?i)door\s+schedule", page.get_text()):
                idx.schedule_pages.append((rel, pno))
                used = _rows(words, pno, rel, idx)
            for i, w in enumerate(words):
                if i not in used and MARK.match(w[4]):
                    idx.drawn.setdefault(w[4], []).append(Hit(rel, pno, list(w[:4])))
    return idx


def check(idx: SetIndex) -> dict:
    s, d = set(idx.scheduled), set(idx.drawn)
    wrong_room = sorted(m for m, h in idx.scheduled.items() if h.room and MARK.match(m).group(1) != h.room)
    m = s & d
    # under half overlap = that side is only partly in this folder (glazing-only schedule, plans issued
    # separately): listing every door as missing would be noise, so skip that direction and say why
    partial_plans, partial_sched = len(m) < 0.5 * len(s), len(m) < 0.5 * len(d)
    return {"not_drawn": [] if partial_plans else sorted(s - d),
            "not_scheduled": [] if partial_sched else sorted(d - s),
            "wrong_room": wrong_room, "matched": sorted(m),
            "partial": [k for k, v in (("plans", partial_plans), ("schedule", partial_sched)) if v]}


def answer(path: str, question: str) -> Answer | None:
    if "/opening_design/" not in path or not path.lower().endswith(".pdf"):
        return None
    # weak words (match, agree) only with doors named: "do the room areas match the plan?" isn't ours
    if not ((STRONG.search(question) and TOPIC.search(question)) or (ASK.search(question) and DOORS.search(question))):
        return None
    folder = path.rsplit("/", 1)[0]
    idx = index(folder)
    if not idx.scheduled or not idx.drawn:
        return None   # needs both a door schedule and a drawn sheet in this set
    c = check(idx)
    ev: list[Evidence] = []

    def sched(m, why):
        h = idx.scheduled[m]
        ev.append(Evidence(file=h.file, page=h.page, bbox=h.bbox, label=f"schedule: {m} · {why}", kind="text"))

    def drawn(m, why):
        for h in idx.drawn[m][:3]:
            ev.append(Evidence(file=h.file, page=h.page, bbox=h.bbox, label=f"plan: {m} · {why}", kind="text"))

    why: dict[str, list[str]] = {}
    for m in c["not_drawn"]:
        sched(m, "on no plan or elevation in this set")
        why.setdefault(m, []).append("is in the schedule but on no drawing")
    for m in c["not_scheduled"]:
        drawn(m, "not in the door schedule")
        why.setdefault(m, []).append("is drawn but not in the schedule")
    for m in c["wrong_room"]:
        room, num = idx.scheduled[m].room, MARK.match(m).group(1)
        sched(m, f"scheduled in room {room}")
        if m in idx.drawn:
            drawn(m, f"number says room {num}")
        why.setdefault(m, []).append(f"is scheduled in room {room} but numbered for room {num}")
    lines = [f"door {m} " + " and ".join(w) for m, w in sorted(why.items())]
    n = len(lines)
    value = (f"No conflicts: all {len(c['matched'])} door marks in the schedule appear on the drawings" if not n
             else f"{n} conflict{'s' if n > 1 else ''}: " + "; ".join(lines))
    if c["partial"]:
        value += (f" (only {len(c['matched'])} of {max(len(idx.scheduled), len(idx.drawn))} marks overlap: "
                  f"{' and '.join(c['partial'])} in this folder are partial, so missing doors are not listed)")
    if not n:   # show what was matched so the check is visible
        for m in c["matched"]:
            sched(m, "matched")
    sheets = sorted({h.file.rsplit('/', 1)[1] for hs in idx.drawn.values() for h in hs})
    return Answer(value=value, unit=None, method="crosscheck", confidence=0.5 if c["partial"] else 0.8 if n else 0.7, evidence=ev,
                  trace=[f"set: {idx.pages} pages in '{folder.rsplit('/', 1)[-1]}'",
                         f"door schedule on {len(idx.schedule_pages)} page(s): {len(idx.scheduled)} marks",
                         f"drawn door tags: {len(idx.drawn)} marks on {len(sheets)} file(s)",
                         f"matched {len(c['matched'])}, scheduled-not-drawn {len(c['not_drawn'])}, "
                         f"drawn-not-scheduled {len(c['not_scheduled'])}, room mismatch {len(c['wrong_room'])}",
                         *([f"partial set: {', '.join(c['partial'])}"] if c["partial"] else []),
                         "doors only; sizes are not compared (plan tags carry no size)"])
