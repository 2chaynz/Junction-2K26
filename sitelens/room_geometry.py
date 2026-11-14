"""Experimental room candidates from raster ink and room-label OCR."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from . import ocr


@dataclass(frozen=True)
class RoomRegion:
    bbox: tuple[int, int, int, int]
    kind: str | None


def rooms(path: Path, *, labels: bool = True) -> list[RoomRegion]:
    """Count enclosed spaces and assign at most one OCR type to each space."""
    import cv2
    import numpy as np
    from PIL import Image

    with Image.open(path) as image:
        gray = np.asarray(image.convert("L"))
    height, width = gray.shape
    # Close small breaks in walls while keeping the raster at its original scale.
    _, ink = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    size = max(3, round(max(width, height) * 0.007) | 1)
    ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, np.ones((size, size), np.uint8))
    _, components, stats, _ = cv2.connectedComponentsWithStats(255 - ink, connectivity=4)
    boxes = {}
    for index, (x, y, w, h, area) in enumerate(stats[1:], start=1):
        if x == 0 or y == 0 or x + w == width or y + h == height:
            continue
        if area < max(64, width * height * 0.0002) or min(w, h) < 2 * size:
            continue
        boxes[index] = tuple(map(int, (x, y, x + w, y + h)))

    kinds = {}
    if labels and boxes:
        for text, confidence, (x0, y0, x1, y1) in sorted(ocr.words(str(path)), key=lambda hit: -hit[1]):
            kind = ocr.room_type(text)
            if kind is None or confidence < ocr.MIN_CONF:
                continue
            # Text itself can be foreground. Vote among nearby room-interior pixels.
            patch = components[max(0, int(y0) - size):min(height, int(y1) + size + 1),
                               max(0, int(x0) - size):min(width, int(x1) + size + 1)]
            ids, counts = np.unique(patch, return_counts=True)
            candidates = [(count, int(index)) for index, count in zip(ids, counts) if index in boxes]
            if candidates:
                _, index = max(candidates)
                kinds.setdefault(index, kind)
    return [RoomRegion(box, kinds.get(index)) for index, box in boxes.items()]
