"""Resolve explicit plan references in vector PDFs without guessing a target."""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import pymupdf

from .. import data_root
from ..answer import Answer, Evidence

TOKEN = r"[A-Z0-9]+(?:[.\-][A-Z0-9]+)*"
TAG = re.compile(rf"\b(door|window|footing|beam|column)(?:\s+(?:mark|tag|type))?\s+['\"]?({TOKEN})(?![\w.-])", re.I)
DETAIL = re.compile(r"\bdetail\s+(\d+[A-Z]?)\s*(?:/|on(?:\s+sheet)?\s+|of(?:\s+sheet)?\s+)([A-Z]+\d[\w.-]*\d|[A-Z]+\d)\b", re.I)
GRID = re.compile(r"\b(?:(horizontal|vertical)\s+)?grid(?:\s+line)?\s+([A-Z0-9]+)\b", re.I)
ANCHOR = re.compile(r"\b(?:on|in|from)\s+(?:this|the)\s+(?:plan|drawing)\b|\bgrid\b", re.I)
ID_HEADERS = {"mark", "tag", "type", "id", "number", "no", "door no", "window no"}


@dataclass
class Page:
    path: str
    pdf: pymupdf.Page

    def cite(self, rect, label: str) -> Evidence:
        box = pymupdf.Rect(rect) * self.pdf.rotation_matrix
        return Evidence(self.path, list(box), self.pdf.number, label, "text")

    def lines(self):
        for block in self.pdf.get_text("dict", flags=pymupdf.TEXTFLAGS_TEXT)["blocks"]:
            for line in block["lines"]:
                yield " ".join(s["text"].strip() for s in line["spans"]), pymupdf.Rect(line["bbox"])


def _axis_hits(page: Page, anchors, grid: re.Match):
    orientation, label = grid.groups()
    label_boxes = [pymupdf.Rect(w[:4]) for w in page.pdf.get_text("words") if w[4].upper() == label.upper()]
    rotation = page.pdf.rotation_matrix
    matched = []
    for drawing in page.pdf.get_drawings():
        for item in drawing["items"]:
            if item[0] != "l":
                continue
            a, b = (point * rotation for point in item[1:])
            horizontal = abs(a.y - b.y) <= 1 and abs(a.x - b.x) >= 60
            vertical = abs(a.x - b.x) <= 1 and abs(a.y - b.y) >= 60
            if not (horizontal or vertical) or (orientation and orientation.lower() != ("horizontal" if horizontal else "vertical")):
                continue
            for box in label_boxes:
                display = box * rotation
                center = (display.tl + display.br) / 2
                if min(abs(center - a), abs(center - b)) > 24:
                    continue
                corridor = pymupdf.Rect(min(a.x, b.x) - 12, min(a.y, b.y) - 12,
                                         max(a.x, b.x) + 12, max(a.y, b.y) + 12)
                for anchor in anchors:
                    if corridor.contains(((anchor.tl + anchor.br) / 2) * rotation):
                        matched.append((tuple(anchor), tuple(box)))
    return list(dict.fromkeys(matched))


def _schedule_rows(page: Page, category: str, tag: str):
    titles = [rect for line, rect in page.lines() if re.fullmatch(rf"(?:\w+\s+)*{category}\s+schedule", line.strip(), re.I)]
    if not titles:
        return
    for table in page.pdf.find_tables().tables:
        bounds = pymupdf.Rect(table.bbox)
        if not any(0 <= bounds.y0 - title.y1 <= 40 and bounds.x0 <= title.x0 <= bounds.x1 for title in titles):
            continue
        rows = table.extract()
        columns = [i for i, name in enumerate(rows[0]) if (name or "").lower().strip().rstrip(".") in ID_HEADERS | {category, f"{category} mark", f"{category} type"}]
        for cells, row in zip(rows[1:], table.rows[1:]):
            if not any((cells[i] or "").strip().upper() == tag for i in columns):
                continue
            fields = [f"{header.strip()} {cell.strip()}" for header, cell in zip(rows[0], cells) if header and cell]
            yield page.cite(row.bbox, "Schedule row · " + " · ".join(fields))


def _detail_hits(page: Page, detail: str, sheet: str):
    lines = list(page.lines())
    sheet_label = re.compile(rf"(?:sheet(?:\s+(?:no\.?|number))?\s*[:#]?\s+){re.escape(sheet)}", re.I)
    if Path(page.path).stem.upper() != sheet and not any(sheet_label.fullmatch(line.strip()) for line, _ in lines):
        return
    for line, rect in lines:
        if re.fullmatch(rf"detail\s+{re.escape(detail)}(?:\s*[:–-]\s+.+)?", line.strip(), re.I):
            yield page.cite(rect, f"Detail {detail} on sheet {sheet}")


def answer(path: str, question: str) -> Answer | None:
    if Path(path).suffix.lower() != ".pdf":
        return None
    details = list(DETAIL.finditer(question))
    schedule_lookup = re.search(r"\bschedule\b", question, re.I) and ANCHOR.search(question)
    tag_match = TAG.search(question) if schedule_lookup else None
    if not details and (not tag_match or not any(c.isdigit() for c in tag_match[2])):
        return None

    root = data_root().resolve()
    source = (root / path).resolve()
    if not source.is_relative_to(root) or not source.is_file():
        return None
    detail, sheet = (v.upper() for v in details[0].groups()) if details else ("", "")
    category, tag = (tag_match[1].lower(), tag_match[2].upper()) if tag_match else ("", "")
    grids = list(GRID.finditer(question))
    grid = grids[0] if grids else None
    label = f"Detail {detail} on sheet {sheet}" if detail else f"{category.title()} {tag}"
    if len(details) > 1 or len(grids) > 1 or (detail and grid):
        return Answer(value="Please ask for one explicit plan reference at a time.", method="plan_reference")
    anchors, targets = [], []
    for file in sorted(source.parent.iterdir()):
        if file.suffix.lower() != ".pdf" or not file.resolve().is_relative_to(root):
            continue
        try:
            doc = pymupdf.open(file)
        except (pymupdf.FileDataError, OSError):
            continue
        with doc:
            for pdf in doc:
                page = Page(file.relative_to(root).as_posix(), pdf)
                if detail:
                    targets.extend(_detail_hits(page, detail, sheet))
                    if file == source:
                        anchors.extend([page.cite(rect, f"Plan callout · {label}")] for line, rect in page.lines()
                                       if re.fullmatch(rf"(?:detail\s+)?{re.escape(detail)}\s*/\s*{re.escape(sheet)}", line.strip(), re.I))
                    continue
                rows = list(_schedule_rows(page, category, tag))
                targets.extend(rows)
                if file != source:
                    continue
                marks = [pymupdf.Rect(w[:4]) for w in pdf.get_text("words") if w[4].upper() == tag]
                marks = [mark for mark in marks if not any(pymupdf.Rect(row.bbox).intersects(mark * pdf.rotation_matrix) for row in rows)]
                if grid:
                    anchors.extend([page.cite(mark, f"Plan tag · {tag}"), page.cite(bubble, f"Grid label · {grid[2]}")]
                                   for mark, bubble in _axis_hits(page, marks, grid))
                else:
                    anchors.extend([page.cite(mark, f"Plan tag · {tag}")] for mark in marks)

    evidence = [item for anchor in anchors for item in anchor] + targets
    if len(anchors) != 1 or len(targets) != 1:
        return Answer(value=f"Could not verify a unique link for {label}. Found {len(anchors)} plan locations and {len(targets)} matching targets.",
                      method="plan_reference", evidence=evidence,
                      trace=["An exact link requires one plan location and one matching target."])
    return Answer(value=targets[0].label, method="plan_reference", confidence=0.95, evidence=evidence,
                  trace=[f"Found one plan location for {label}.", "Matched one exact target in the drawing set."])
