"""Revision diff: what changed between two issues of the same vector PDF sheet. No model calls, cost 0.

Text lines are matched by content and position after aligning the sheets on lines they share.
Geometry is compared on renders, not vector paths: exporters split the same line into different
segments from one issue to the next, so path-level matching reports noise.
Pairs of issues the router can find live in `sitelens/diff_pairs.json`.

  python -m sitelens.paths.diff <old.pdf> <new.pdf>      (dataset-relative or absolute paths)
"""
from __future__ import annotations

import json
import os
import re
import statistics
import time
from collections import Counter, defaultdict, deque
from pathlib import Path

import fitz  # PyMuPDF
import numpy as np

from ..answer import Answer, Evidence

PAIRS = Path(__file__).resolve().parent.parent / "diff_pairs.json"
CUE = re.compile(r"(?i)what (?:has )?changed|changes?\b|revis|differen|compare|previous issue|addend"
                 r"|was hat sich|änderung|muutos|muuttunut|mis muutus|modifi|cambiat|ændr")
# Plot stamps change on every print; they are not design changes.
NOISE = re.compile(r"^(?:\d{1,2}/\d{1,2}/\d{2,4}|\d{1,2}:\d{2}(?::\d{2})?|[AP]M)$")
MATCH_TOL = 6.0   # pt: same line if centres this close after alignment
ROW_SHIFT = 120.0 # pt: same text in the same column this far up/down = shifted schedule row
NEAR = 4.0        # pt: removed and added notes this close overlap → one "changed" item
MOVE_TOL = 200.0  # pt: an identical note within this distance moved, it was not removed + added
RES = 0.5         # px per pt for the geometry render
DARK = 170        # grey level below which a pixel is ink
SLACK = 2         # px: ink that moved less than this is not a change
CELL = 8          # px: change cells; regions are connected cells
CELL_MIN = 6      # changed px for a cell to count
REGION_MIN = 3    # cells: smaller regions are render noise
TABLE_GAP = 25.0  # pt: text changes this close belong to one table
TABLE_MIN = 8     # text changes in one cluster before it is reported as one reworked table
ORDER = ("changed", "removed", "added", "table", "drawing")  # most telling first
MAX_ITEMS = 60


LONG = "\\\\?\\"


def _long(p: Path) -> Path:
    # Some opening_design paths exceed Windows MAX_PATH (260) once joined to the dataset root.
    if os.name == "nt" and not str(p).startswith(LONG):
        return Path(LONG + os.path.abspath(p))
    return p


def _resolve(p: str) -> Path:
    cands = [Path(p)]
    from .. import data_root
    try:
        cands.append(data_root() / p)
    except RuntimeError:
        pass
    for q in cands:
        if q.is_file() or _long(q).is_file():
            return _long(q)
    raise FileNotFoundError(p)


def _open(p: str) -> fitz.Document:
    return fitz.open(stream=_resolve(p).read_bytes(), filetype="pdf")


def _lines(page) -> list[tuple[str, fitz.Rect]]:
    """Text lines as (text, bbox in rendered-page coords), plot stamps dropped."""
    rot = page.rotation_matrix
    groups: dict[tuple, list] = defaultdict(list)
    for x0, y0, x1, y1, w, b, ln, _ in page.get_text("words"):
        if not NOISE.match(w):
            groups[(b, ln)].append((fitz.Rect(x0, y0, x1, y1) * rot, w))
    out = []
    for ws in groups.values():
        r = fitz.Rect(ws[0][0])
        for wr, _ in ws[1:]:
            r |= wr
        out.append((" ".join(w for _, w in ws), r))
    return out


def _norm(t: str) -> str:
    return re.sub(r"[\s-]+", " ", t).strip().upper()


def _stamps(page) -> list[fitz.Rect]:
    return [fitz.Rect(w[:4]) * page.rotation_matrix for w in page.get_text("words") if NOISE.match(w[4])]


def _centre(r: fitz.Rect) -> tuple[float, float]:
    return (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2


def _map(r: fitz.Rect, t) -> fitz.Rect:
    s, dx, dy = t
    return fitz.Rect(r.x0 * s + dx, r.y0 * s + dy, r.x1 * s + dx, r.y1 * s + dy)


def _unmap(r: fitz.Rect, t) -> fitz.Rect:
    s, dx, dy = t
    return fitz.Rect((r.x0 - dx) / s, (r.y0 - dy) / s, (r.x1 - dx) / s, (r.y1 - dy) / s)


def _group(lines: list[tuple[str, fitz.Rect]]) -> list[tuple[str, fitz.Rect]]:
    """Merge changed lines that touch (one multi-line note) → [(text in reading order, bbox)]."""
    groups: list[list] = []
    for txt, r in sorted(lines, key=lambda x: (x[1].y0, x[1].x0)):
        h = max(r.height, 4.0)
        grow = r + (-2, -0.6 * h, 2, 0.6 * h)
        g = next((g for g in groups if g[1].intersects(grow)), None)
        if g:
            g[0].append((txt, r))
            g[1] |= r
        else:
            groups.append([[(txt, r)], fitz.Rect(r)])
    return [(" ".join(t for t, _ in sorted(ls, key=lambda x: (round(x[1].y0), x[1].x0))), box) for ls, box in groups]


def _dist(a: fitz.Rect, b: fitz.Rect) -> float:
    (ax, ay), (bx, by) = _centre(a), _centre(b)
    return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5


def _text_diff(old, new, t):
    """→ removed [(text, old_rect)], added [(text, new_rect)] after matching by text + position."""
    pool: dict[str, list[int]] = defaultdict(list)
    for i, (txt, _) in enumerate(new):
        pool[txt].append(i)
    used, left = set(), []
    for txt, r in old:
        m = _map(r, t)
        hit = next((i for i in pool.get(txt, []) if i not in used and _dist(m, new[i][1]) < MATCH_TOL), None)
        if hit is None:
            left.append((txt, r))
        else:
            used.add(hit)
    removed = []
    for txt, r in left:  # same text, same column, rows shifted: a schedule row was inserted or deleted
        m = _map(r, t)
        hit = min((i for i in pool.get(txt, []) if i not in used and abs(m.x0 - new[i][1].x0) < MATCH_TOL
                   and abs(m.y0 - new[i][1].y0) < ROW_SHIFT), key=lambda i: abs(m.y0 - new[i][1].y0), default=None)
        if hit is None:
            removed.append((txt, r))
        else:
            used.add(hit)
    return removed, [new[i] for i in range(len(new)) if i not in used]


def _align(old, new, po, pn) -> tuple[float, float, float]:
    """(scale, dx, dy) mapping old page coords → new, from text lines unique to both sheets."""
    s = pn.rect.width / po.rect.width if abs(pn.rect.width - po.rect.width) > 1 else 1.0
    co, cn = Counter(t for t, _ in old), Counter(t for t, _ in new)
    po_, pn_ = ({t: r for t, r in L if c[t] == 1 and len(t) > 3} for L, c in ((old, co), (new, cn)))
    common = [t for t in po_ if t in pn_]
    cands = [(s, 0.0, 0.0)]
    if len(common) >= 3:
        cands.append((s, statistics.median(_centre(pn_[t])[0] - s * _centre(po_[t])[0] for t in common),
                      statistics.median(_centre(pn_[t])[1] - s * _centre(po_[t])[1] for t in common)))
    return min(cands, key=lambda t: sum(map(len, _text_diff(old, new, t))))


def _ink(page, scale: float) -> np.ndarray:
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csGRAY, alpha=False)
    return np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.stride)[:, :pix.width] < DARK


def _fit(a: np.ndarray, shape, dx: int, dy: int) -> np.ndarray:
    """a shifted by (dx, dy) px onto a canvas of `shape`."""
    out = np.zeros(shape, bool)
    h, w = shape
    ys, xs = max(0, dy), max(0, dx)
    ye, xe = min(h, a.shape[0] + dy), min(w, a.shape[1] + dx)
    if ye > ys and xe > xs:
        out[ys:ye, xs:xe] = a[ys - dy:ye - dy, xs - dx:xe - dx]
    return out


def _grow(m: np.ndarray, k: int) -> np.ndarray:
    out = m.copy()
    for dy in range(-k, k + 1):
        for dx in range(-k, k + 1):
            out |= _fit(m, m.shape, dx, dy)
    return out


def _regions(mask: np.ndarray) -> list[tuple[int, int, int, int, int]]:
    """Connected change regions on a CELL grid → [(x0, y0, x1, y1 in px, cells)], biggest first."""
    h, w = mask.shape[0] // CELL, mask.shape[1] // CELL
    cells = mask[:h * CELL, :w * CELL].reshape(h, CELL, w, CELL).sum(axis=(1, 3)) >= CELL_MIN
    joined = _grow(cells, 1)  # bridge one-cell gaps
    seen = np.zeros_like(cells)
    out = []
    for y, x in zip(*np.nonzero(cells)):
        if seen[y, x]:
            continue
        q, comp = deque([(y, x)]), []
        seen[y, x] = True
        while q:
            cy, cx = q.popleft()
            comp.append((cy, cx))
            for ny in (cy - 1, cy, cy + 1):
                for nx in (cx - 1, cx, cx + 1):
                    if 0 <= ny < h and 0 <= nx < w and joined[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
        real = [c for c in comp if cells[c]]
        if len(real) >= REGION_MIN:
            ys, xs = zip(*real)
            out.append((min(xs) * CELL, min(ys) * CELL, (max(xs) + 1) * CELL, (max(ys) + 1) * CELL, len(real)))
    return sorted(out, key=lambda r: -(r[2] - r[0]) * (r[3] - r[1]))


def _collapse_tables(ev: list[Evidence], old: str, new: str, t) -> list[Evidence]:
    """Many small text changes packed together = a schedule that was reworked → one item."""
    boxes = [fitz.Rect(e.bbox) if e.file == new else _map(fitz.Rect(e.bbox), t) for e in ev]
    parent = list(range(len(ev)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for i in range(len(ev)):
        gi = boxes[i] + (-TABLE_GAP, -TABLE_GAP, TABLE_GAP, TABLE_GAP)
        for j in range(i + 1, len(ev)):
            if gi.intersects(boxes[j]):
                parent[root(j)] = root(i)
    comps: dict[int, list[int]] = defaultdict(list)
    for i in range(len(ev)):
        comps[root(i)].append(i)
    out = []
    for idx in comps.values():
        if len(idx) < TABLE_MIN:
            out += [ev[i] for i in idx]
            continue
        box = fitz.Rect(boxes[idx[0]])
        for i in idx[1:]:
            box |= boxes[i]
        words = [w for i in idx for w in ev[i].label.split(": ", 1)[1].split() if re.search("[A-Za-z]{3}", w)]
        top = ", ".join(w for w, _ in Counter(words).most_common(4))
        out.append(Evidence(new, _bbox(box), ev[idx[0]].page, f"table reworked: {len(idx)} cells changed ({top})", "box"))
    return out


def _bbox(r: fitz.Rect) -> list[float]:
    return [round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1)]


def diff(old: str, new: str, old_page: int = 0, new_page: int = 0) -> Answer:
    """Changes from sheet `old` to sheet `new`. value = number of change items; evidence = one per item."""
    t0 = time.time()
    with _open(old) as do, _open(new) as dn:
        po, pn = do[old_page], dn[new_page]
        lo, ln = _lines(po), _lines(pn)
        t = _align(lo, ln, po, pn)
        stamps = [_map(r, t) for r in _stamps(po)] + _stamps(pn)
        removed, added = _text_diff(lo, ln, t) if lo and ln else ([], [])
        ink_new = _ink(pn, RES)
        ink_old = _fit(_ink(po, RES * t[0]), ink_new.shape, round(t[1] * RES), round(t[2] * RES))
    trace = [f"old: {len(lo)} text lines · new: {len(ln)} text lines"
             + ("" if lo and ln else " · one sheet has no text layer: geometry only"),
             f"aligned: scale {t[0]:.3f}, shift ({t[1]:.1f}, {t[2]:.1f}) pt"]

    og = _group([(txt, _map(r, t)) for txt, r in removed])
    ng = _group(added)
    n_new = len(ng)
    ev: list[Evidence] = []
    moved, gone_txt = 0, []
    for ot, orr in og:  # a removed note with an added one on top of it is an edit
        hit = [g for g in ng if g[1].intersects(orr + (-NEAR, -NEAR, NEAR, NEAR))]
        if not hit:
            gone_txt.append((ot, orr))
            continue
        for g in hit:
            ng.remove(g)
        nt = " ".join(g[0] for g in hit)
        nr = fitz.Rect(orr)
        for g in hit:
            nr |= g[1]
        if _norm(nt) == _norm(ot):
            moved += 1
        else:
            ev.append(Evidence(new, _bbox(nr), new_page, f"changed: {ot} → {nt}", "text"))
    for ot, orr in gone_txt:  # same note further away: moved, not removed
        twin = next((g for g in ng if _norm(g[0]) == _norm(ot) and _dist(g[1], orr) < MOVE_TOL), None)
        if twin:
            ng.remove(twin)
            moved += 1
        else:
            r = _unmap(orr, t)
            ev.append(Evidence(old, _bbox(r), old_page, f"removed: {ot}", "text"))
    ev += [Evidence(new, _bbox(r), new_page, f"added: {txt}", "text") for txt, r in ng]
    ev = _collapse_tables(ev, old, new, t)
    trace.append(f"text: {len(removed)} lines removed, {len(added)} added → {len(og)} old / "
                 f"{n_new} new notes, {moved} only moved → {len(ev)} items")

    gone = ink_old & ~_grow(ink_new, SLACK)
    came = ink_new & ~_grow(ink_old, SLACK)
    change = gone | came
    # Text changes are already reported and plot stamps are noise: drop their pixels.
    for r in [fitz.Rect(e.bbox) if e.file == new else _map(fitz.Rect(e.bbox), t) for e in ev] + stamps:
        change[max(0, int(r.y0 * RES) - 2):int(r.y1 * RES) + 3, max(0, int(r.x0 * RES) - 2):int(r.x1 * RES) + 3] = False
    regs = _regions(change)
    for x0, y0, x1, y1, n in regs:
        g, c = int(gone[y0:y1, x0:x1].sum()), int(came[y0:y1, x0:x1].sum())
        what = "lines removed" if g > 3 * c else "lines added" if c > 3 * g else "lines changed"
        ev.append(Evidence(new, _bbox(fitz.Rect(x0, y0, x1, y1) / RES), new_page, f"drawing: {what}", "box"))
    ev.sort(key=lambda e: next(i for i, k in enumerate(ORDER) if e.label.startswith(k)))
    trace.append(f"geometry: {int(gone.sum())} ink px gone, {int(came.sum())} new → {len(regs)} regions")
    if len(ev) > MAX_ITEMS:
        trace.append(f"showing first {MAX_ITEMS} of {len(ev)} items")
    trace.append(f"diff, {time.time() - t0:.2f}s")
    return Answer(value=len(ev), unit="count", method="diff", confidence=0.8,
                  evidence=ev[:MAX_ITEMS], trace=trace)


def pairs() -> list[dict]:
    return json.loads(PAIRS.read_text(encoding="utf8")) if PAIRS.is_file() else []


def answer(path: str, question: str) -> Answer | None:
    """'What changed on this sheet?' for a sheet whose earlier issue is listed in diff_pairs.json."""
    if not path.lower().endswith(".pdf") or not CUE.search(question):
        return None
    p = next((p for p in pairs() if p["new"] == path), None)
    if p is None:
        return None
    a = diff(p["old"], p["new"])
    a.trace.insert(0, f"compared with earlier issue: {p['old']}")
    return a


if __name__ == "__main__":
    import argparse
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="What changed between two issues of a sheet")
    ap.add_argument("old")
    ap.add_argument("new")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    res = diff(a.old, a.new)
    if a.json:
        print(json.dumps(res.to_dict(), indent=2, ensure_ascii=False))
    else:
        print(f"{res.value} changes")
        for e in res.evidence:
            print(f"  {'old' if e.file == a.old else 'new'} {e.label}  @ {e.bbox}")
        print("\n".join("  · " + s for s in res.trace))
