"""Room-label OCR for raster plans: read the text, map room labels to room types in any of our languages.

CPU only (rapidocr-onnxruntime). Some CubiCasa plans have mirrored labels ("HM" for MH), so the image is read
as-is and flipped; readings that match the lexicon are merged by position.
"""
from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from pathlib import Path

# room type → label tokens (upper-case, accents stripped). A label counts when its first word is listed.
LEXICON: dict[str, set[str]] = {
    "bedroom": {"MH", "MAKUUHUONE", "MAKUUH", "CHAMBRE", "CH", "BEDROOM", "BED", "BR", "SCHLAFZIMMER", "SCHLAFEN",
                "KINDERZIMMER", "CAMERA", "VAERELSE", "SOVEVAERELSE", "MAGAMISTUBA", "MAGAMIS"},
    "bath": {"KH", "KPH", "PH", "PESUH", "PESUHUONE", "SH", "KYLPYHUONE", "BAINS", "SDB", "SDE", "BATH", "BATHROOM",
             "BAD", "BADEZIMMER", "DUSCHE", "BAGNO", "VANNITUBA", "VANNI", "BADEVAERELSE"},
    "wc": {"WC", "TOILET", "TOILETTE", "TOILETTES", "TUALETT"},
    "sauna": {"SAUNA", "LOYLYHUONE", "LOYLYH"},
    "kitchen": {"K", "KEITTIO", "KT", "TK", "AK", "KK", "KEITTOKOMERO", "TUPAKEITTIO", "AVOKEITTIO", "CUISINE",
                "KITCHEN", "KUCHE", "CUCINA", "KOKKEN", "KOOK", "KOOGINURK"},
    "balcony": {"PARVEKE", "PARV", "LASITETTU", "BALCON", "BALCONY", "BALKON", "BALCONE", "ALTAN", "RODU"},
}
AREA = re.compile(r"\d+[.,]\d+\s*M\W?2?\b|\d+[.,]\d+\s*M[²2?]")
MIN_CONF = 0.5


def _norm(s: str) -> str:
    s = s.replace("Æ", "AE").replace("æ", "ae").replace("Ø", "O").replace("ø", "o")
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().upper()


def room_type(text: str) -> str | None:
    words = re.findall(r"[A-Z]+", _norm(text))
    if not words:
        return None
    return next((t for t, toks in LEXICON.items() if words[0] in toks), None)


@lru_cache(maxsize=1)
def _engine():
    from rapidocr_onnxruntime import RapidOCR
    return RapidOCR()


@lru_cache(maxsize=256)
def words(path: str) -> tuple:
    """((text, conf, (x0, y0, x1, y1)), ...) in image pixels, from the image and its mirror image."""
    import numpy as np
    from PIL import Image
    img = np.array(Image.open(Path(path)).convert("RGB"))
    w = img.shape[1]
    out = []
    for flip in (False, True):
        res, _ = _engine()(img[:, ::-1].copy() if flip else img)
        for quad, text, conf in res or []:
            xs, ys = [p[0] for p in quad], [p[1] for p in quad]
            x0, x1 = (w - max(xs), w - min(xs)) if flip else (min(xs), max(xs))
            out.append((text, float(conf), (round(x0, 1), round(min(ys), 1), round(x1, 1), round(max(ys), 1))))
    return tuple(out)


def _near(a, b, d) -> bool:
    return abs((a[0] + a[2]) / 2 - (b[0] + b[2]) / 2) < d and abs((a[1] + a[3]) / 2 - (b[1] + b[3]) / 2) < d


def labels(path: str, kind: str) -> list[tuple[str, float, tuple]]:
    """One (text, conf, bbox) per room label of `kind`; the same label read twice (as-is + mirrored) counts once."""
    hits = [x for x in words(path) if x[1] >= MIN_CONF and room_type(x[0]) == kind]
    d = 0.02 * max(max(b[2], b[3]) for _, _, b in words(path)) if hits else 0
    keep: list = []
    for h in sorted(hits, key=lambda x: -x[1]):
        if not any(_near(h[2], k[2], d) for k in keep):
            keep.append(h)
    return keep


def areas(path: str) -> list[tuple[str, float, tuple]]:
    """Area labels like '13,28 m²': most plans print one per room."""
    hits = [x for x in words(path) if x[1] >= MIN_CONF and AREA.search(_norm(x[0])) and ":" not in x[0]]
    d = 0.02 * max(max(b[2], b[3]) for _, _, b in words(path)) if hits else 0
    keep: list = []
    for h in sorted(hits, key=lambda x: -x[1]):
        if not any(_near(h[2], k[2], d) for k in keep):
            keep.append(h)
    return keep
