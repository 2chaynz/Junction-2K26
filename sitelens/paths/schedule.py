"""Schedule path: answers questions about door / finish / window schedules on vector PDF sheets.

1. extract(): each schedule on the sheet → table (header + rows, every cell with its bbox), rebuilt from the
   PDF text layer in display orientation, columns from the header words.
2. answer(): picks the schedule the question names, then counts rows whose cells match the codes in the
   question (door type B2, note A, 3'-0" wide, F4 …), or looks up one row (door 121.A, room 128) and returns
   the asked column. Evidence = the matched rows. No model calls.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache

from .. import data_root
from ..answer import Answer, Evidence

DEBUG = False
ROW_GAP = 5.0          # pt: words within this vertical distance share a row (scaled by font size)


@dataclass
class Table:
    title: str
    header: list[str]
    cols: list[float]                     # left x of each column
    rows: list[list[str]] = field(default_factory=list)
    boxes: list[list[float]] = field(default_factory=list)   # row bbox in page points (display orientation)

    def col(self, *names: str) -> int | None:
        for n in names:
            for i, h in enumerate(self.header):
                if re.search(n, h, re.I):
                    return i
        return None


def _words(path: str):
    import pymupdf
    page = pymupdf.open(data_root() / path)[0]
    M = page.rotation_matrix
    out = []
    for w in page.get_text("words"):
        r = pymupdf.Rect(w[:4]) * M
        out.append((r.x0, r.y0, r.x1, r.y1, w[4]))
    return out


def _rows(words):
    rows: list[list] = []
    for w in sorted(words, key=lambda w: ((w[1] + w[3]) / 2, w[0])):
        yc = (w[1] + w[3]) / 2
        if rows and abs(rows[-1][0] - yc) <= max(ROW_GAP, (w[3] - w[1]) * 0.6):
            rows[-1][1].append(w)
        else:
            rows.append([yc, [w]])
    return [sorted(ws, key=lambda w: w[0]) for _, ws in rows]


def _join_tokens(ws) -> list[tuple[float, float, str]]:
    """Merge words closer than a space into phrases: (x0, x1, text)."""
    out: list[list] = []
    for w in ws:
        h = w[3] - w[1]
        if out and w[0] - out[-1][1] < h * 0.6:
            out[-1][1] = w[2]
            out[-1][2] += (" " if w[0] - out[-1][1] > h * 0.12 else "") + w[4]
        else:
            out.append([w[0], w[2], w[4]])
    return [tuple(o) for o in out]


@lru_cache(maxsize=32)
def extract(path: str) -> list[Table]:
    W = _words(path)
    tables = []
    for i, w in enumerate(W):
        if w[4].lower() not in ("schedule", "schedules", "key", "legend"):
            continue
        title_ws = [x for x in W if abs((x[1] + x[3]) / 2 - (w[1] + w[3]) / 2) < 2 and abs(x[0] - w[0]) < 300]
        title = " ".join(x[4] for x in sorted(title_ws, key=lambda x: x[0]))
        if len(title) > 60:
            continue
        cx = (w[0] + w[2]) / 2
        # candidate region: below the title, horizontally around it; grow until a big vertical gap
        below = [x for x in W if x[1] > w[3] and abs((x[0] + x[2]) / 2 - cx) < 560]
        rows = _rows(below)
        body, last_y = [], w[3]
        for r in rows:
            y = min(x[1] for x in r)
            if y - last_y > 40:
                break
            body.append(r)
            last_y = max(x[3] for x in r)
        if len(body) < 4:
            continue
        if DEBUG: print("cand", title, len(body), [r[0][4] for r in body[:6]])
        # header = rows before the first row whose first token looks like an id (100.A1, 128, 101)
        first = next((k for k, r in enumerate(body) if re.match(r"^\d{2,4}(\.[A-Z0-9]+)?$|^[A-Z]{1,3}-?\d", r[0][4])), None)
        if not first:
            continue
        head_rows, data_rows = body[:first], body[first:]
        x_min = min(x[0] for r in data_rows for x in r)
        x_max = max(x[2] for r in data_rows for x in r)
        data_rows = [[x for x in r if x_min - 5 <= x[0] <= x_max] for r in data_rows]
        # columns: left edges of tokens, clustered over all data rows
        lefts = sorted(t[0] for r in data_rows for t in _join_tokens(r))
        cols: list[float] = []
        for x in lefts:
            if not cols or x - cols[-1] > 12:
                cols.append(x)
        # keep columns used by ≥ 15% of rows
        use = [sum(1 for r in data_rows if any(abs(t[0] - c) <= 12 for t in _join_tokens(r))) for c in cols]
        cols = [c for c, u in zip(cols, use) if u >= max(2, 0.15 * len(data_rows))]
        def cell_of(x):
            return max((k for k, c in enumerate(cols) if x >= c - 12), default=0)
        header = [""] * len(cols)
        for r in head_rows:
            for t in _join_tokens(r):
                k = min(range(len(cols)), key=lambda k: abs(cols[k] - t[0]))
                header[k] = (header[k] + " " + t[2]).strip()
        tb = Table(title=title, header=header, cols=cols)
        for r in data_rows:
            cells = [""] * len(cols)
            for t in _join_tokens(r):
                k = cell_of(t[0])
                cells[k] = (cells[k] + " " + t[2]).strip()
            if sum(1 for c in cells if c) < 2:
                continue   # stray note line
            tb.rows.append(cells)
            tb.boxes.append([min(x[0] for x in r), min(x[1] for x in r), max(x[2] for x in r), max(x[3] for x in r)])
        if tb.rows:
            tables.append(tb)
    return tables


def _norm(s: str) -> str:
    return re.sub(r"\s+", "", s.replace("’", "'").replace("”", '"').replace("″", '"')).upper()


def _pick(tables: list[Table], q: str) -> Table | None:
    want = ("door" if re.search(r"(?i)\bdoor", q) else "finish" if re.search(r"(?i)finish|room schedule|area", q)
            else "window" if re.search(r"(?i)window", q) else "")
    cand = [t for t in tables if want and want in t.title.lower()] or tables
    return max(cand, key=lambda t: len(t.rows)) if cand else None


CODE = re.compile(r"""\b(?:type|note|finish|base|key|group)\s+([A-Z]{1,3}-?\d{0,2})\b|(\d+'-\s?\d+(?:\s\d+/\d+)?")""", re.I)


LLM_PROMPT = """You answer questions about construction drawing schedules. Below are the tables extracted from one
sheet (title, header, then rows as `index | cells`). Cells may have merged words. Use only these tables.
Question: {q}

{tables}

Reply with JSON only: {{"answer": <number for counts/areas, otherwise short text exactly as written on the sheet>,
"table": "<title of the table you used>", "rows": [<row indexes you used>]}}
If the tables cannot answer the question, reply {{"answer": null}}."""
EUR_PER_MTOK = (0.30, 2.50)


def _table_text(tables: list[Table]) -> str:
    out = []
    for t in tables:
        out.append(f"## {t.title}\nheader: " + " | ".join(t.header))
        out += [f"{i} | " + " | ".join(r) for i, r in enumerate(t.rows)]
    return "\n".join(out)


def _llm(path: str, question: str, tables: list[Table]) -> Answer | None:
    import json
    import os
    import urllib.request
    key = os.environ.get("GEMINI_API_KEY")
    if not key or not tables:
        return None
    model = os.environ.get("SITELENS_SCHEDULE_MODEL", "gemini-3.5-flash")
    body = {"contents": [{"parts": [{"text": LLM_PROMPT.format(q=question, tables=_table_text(tables))}]}],
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
    j = json.loads(text[text.find("{"): text.rfind("}") + 1])
    if j.get("answer") in (None, ""):
        return None
    t = next((t for t in tables if t.title == j.get("table")), tables[0])
    idx = [i for i in j.get("rows") or [] if isinstance(i, int) and 0 <= i < len(t.rows)]
    v = j["answer"]
    if isinstance(v, str) and re.fullmatch(r"[\d,]+(\.\d+)?", v.strip()):
        v = float(v.replace(",", ""))
    return Answer(value=v, unit=None, method="vector+llm", confidence=0.7, cost_eur=round(cost, 6),
                  evidence=[Evidence(file=path, bbox=t.boxes[i], label=" | ".join(c for c in t.rows[i] if c)[:80]) for i in idx],
                  trace=[f"{len(tables)} tables extracted from the sheet's text layer", f"{model} read table '{t.title}'",
                         f"rows used: {idx[:20]}{' …' if len(idx) > 20 else ''}"])


def answer(path: str, question: str) -> Answer | None:
    if "/opening_design/" not in path or not path.lower().endswith(".pdf"):
        return None
    tables = extract(path)
    try:
        a = _llm(path, question, tables)
        if a is not None:
            return a
    except Exception:  # API down / quota: fall back to rules
        pass
    return _rules(path, question, tables)


def _rules(path: str, question: str, tables: list[Table]) -> Answer | None:
    t = _pick(tables, question)
    if t is None or not t.rows:
        return None
    q = question

    def ev(idx, label):
        return [Evidence(file=path, bbox=t.boxes[i], label=label) for i in idx]

    # lookup: a specific door / room
    ref = re.search(r"\b(?:door|room)\s+(\d{2,4}(?:\.[A-Z0-9]+)?)\b", q, re.I)
    count_q = re.search(r"(?i)how many|number of", q)
    if count_q:
        codes = [(m.group(1) or m.group(2)) for m in CODE.finditer(q)]
        if ref and re.search(r"(?i)for room|list for", q):
            idx = [i for i, r in enumerate(t.rows) if any(_norm(c) == _norm(ref.group(1)) for c in r)]
            label = f"rows for {ref.group(1)}"
        elif codes:
            target = _norm(codes[0])
            idx = [i for i, r in enumerate(t.rows) if any(target == _norm(c) or target in _norm(c).split("/")
                                                          or re.fullmatch(rf"(.*\W)?{re.escape(target)}(\W.*)?", _norm(c))
                                                          for c in r)]
            label = f"rows with {codes[0]}"
        elif re.search(r"(?i)listed|in total|how many (doors|rooms|windows)\b.*schedule\?", q):
            idx = list(range(len(t.rows)))
            label = "all rows"
        else:
            return None
        return Answer(value=len(idx), unit="count", method="vector", confidence=0.6, evidence=ev(idx, label),
                      trace=[f"table '{t.title}' ({len(t.rows)} rows)", f"{label}: {len(idx)}"])
    if ref:
        i = next((i for i, r in enumerate(t.rows) if _norm(r[0]) == _norm(ref.group(1))
                  or (len(r) > 1 and _norm(r[1]) == _norm(ref.group(1)))), None)
        if i is None:
            return None
        r = t.rows[i]
        k = (t.col("area") if re.search(r"(?i)\barea\b", q) else t.col("width") if re.search(r"(?i)width", q)
             else t.col("height") if re.search(r"(?i)height", q) else t.col("hardware", "group") if re.search(r"(?i)hardware", q)
             else t.col("matl", "material") if re.search(r"(?i)material", q) else t.col("type") if re.search(r"(?i)type", q)
             else None)
        if k is None or not r[k]:
            return None
        v = r[k]
        if re.search(r"(?i)\barea\b", q):
            m = re.search(r"[\d,]+", v)
            v = float(m.group().replace(",", "")) if m else v
        return Answer(value=v, unit=None, method="vector", confidence=0.6, evidence=ev([i], f"{t.header[k]}: {r[k]}"),
                      trace=[f"table '{t.title}', row {r[0]}", f"column '{t.header[k]}' = {r[k]}"])
    return None
