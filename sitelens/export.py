"""Export an answer as a redlined PDF: evidence → real PDF annotations (T41).

Each evidence box becomes a numbered red rectangle annotation with a comment; a sticky note at the top
left holds the question, answer, method, cost and trace. Opens in Bluebeam / Acrobat / any PDF viewer
as editable comments, which is how markups travel on a construction project.

Vector PDFs: annotations on the original page (evidence is in display coordinates, so it is mapped back
through the page's derotation matrix). Raster plans: the image is placed on a page 1 pt = 1 px.
IFC models have no 2D sheet: not exportable.
"""
from __future__ import annotations

import pymupdf

from . import data_root

RED = (0.85, 0.18, 0.13)
AUTHOR = "Sindri"


def _page(path: str) -> tuple[pymupdf.Document, pymupdf.Page]:
    full = data_root() / path
    low = path.lower()
    if low.endswith(".pdf"):
        doc = pymupdf.open(full)
        if len(doc) > 1:
            doc.select([0])  # answers and evidence are on the first page
        return doc, doc[0]
    if low.endswith((".png", ".jpg", ".jpeg")):
        from PIL import Image
        w, h = Image.open(full).size
        doc = pymupdf.open()
        page = doc.new_page(width=w, height=h)
        page.insert_image(page.rect, filename=str(full))
        return doc, page
    raise ValueError("only PDF sheets and raster plans can be exported (IFC has no 2D sheet)")


def _fmt(v) -> str:
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v)


def redline(path: str, question: str, answer: dict) -> bytes:
    """PDF bytes with the answer's evidence as annotations."""
    doc, page = _page(path)
    to_page = page.derotation_matrix if path.lower().endswith(".pdf") else pymupdf.Identity
    marks = [e for e in answer.get("evidence") or [] if e.get("bbox") and len(e["bbox"]) == 4]
    rot = page.rotation if path.lower().endswith(".pdf") else 0
    k = max(1.0, max(page.rect.width, page.rect.height) / 1400)   # big raster pages: thicker lines, bigger tags
    for i, e in enumerate(marks, 1):
        d = pymupdf.Rect(e["bbox"]) + (-2 * k, -2 * k, 2 * k, 2 * k)  # display coords, a little air around tight boxes
        r = (d * to_page).normalize()
        a = page.add_rect_annot(r)
        a.set_colors(stroke=RED)
        a.set_border(width=1.5 * k)
        a.set_info(title=AUTHOR, subject=f"Evidence {i}", content=f"{i}. {e.get('label') or ''}".strip())
        a.update(opacity=0.9)
        # number tag: upright, just left of the box as the reader sees the sheet (dense tables have no room above)
        w, cy = (8 + 6 * len(str(i))) * k, (d.y0 + d.y1) / 2
        tag = (pymupdf.Rect(d.x0 - w - 2 * k, cy - 5 * k, d.x0 - 2 * k, cy + 5 * k) * to_page).normalize()
        t = page.add_freetext_annot(tag, str(i), fontsize=8 * k, text_color=RED, fill_color=(1, 1, 1), rotate=rot)
        t.set_info(title=AUTHOR, subject=f"Evidence {i}")
        t.update()
    unit = answer.get("unit") or ""
    lines = [f"Q: {question}",
             f"A: {_fmt(answer.get('value'))} {unit if unit != 'count' else ''}".rstrip(),
             f"method: {answer.get('method')} · confidence {answer.get('confidence')} · € {answer.get('cost_eur')}",
             f"{len(marks)} evidence mark(s) on this sheet"]
    lines += [f"· {t}" for t in answer.get("trace") or []]
    note = page.add_text_annot(pymupdf.Point(12, 12) * (page.derotation_matrix if path.lower().endswith(".pdf")
                                                         else pymupdf.Identity), "\n".join(lines), icon="Comment")
    note.set_info(title=AUTHOR, subject="Sindri answer")
    note.set_colors(stroke=RED)
    note.update()
    out = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return out
