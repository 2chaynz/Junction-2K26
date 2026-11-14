"""Locate question-specific regions on vector PDFs."""
import re

from .. import data_root


def region(path, question):
    import pymupdf

    quoted = re.findall(r"""["“]([^"”]+)["”]|(?<!\w)'([^']+)'(?!\w)""", question)
    anchors = [left or right for left, right in quoted]
    if not anchors:
        anchors = re.findall(
            r"\b(?:title block|legend|(?:\w+ )?schedule|room\s+[A-Z]?\d+[A-Z]?)\b",
            question, re.IGNORECASE,
        )
    if len(anchors) != 1:
        return None

    with pymupdf.open(data_root() / path) as doc:
        page = doc[0]
        matches = page.search_for(anchors[0])
        if len(matches) != 1:
            return None
        bounds = page.rect
        hit = matches[0] * page.rotation_matrix
        margin_x = bounds.width * 0.19
        margin_y = bounds.height * 0.19
        return bounds & pymupdf.Rect(hit.x0 - margin_x, hit.y0 - margin_y,
                                     hit.x1 + margin_x, hit.y1 + margin_y)
