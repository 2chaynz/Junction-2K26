"""Detector path: raster floor plans → counts, one evidence box per detected object.

Weights: $SITELENS_MODELS/detector.pt (default models/detector.pt), trained by train/ on public
CubiCasa5K with every Stoa drawing excluded. Class names come from the weights file and match
train/cubicasa_to_yolo.py NAMES. Runs on CPU; cost per answer is effectively 0.
"""
from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path

from .. import data_root
from ..answer import Answer, Evidence

RASTER = (".png", ".jpg", ".jpeg")

# question pattern (en / fi) → detector classes summed for the count. Order matters: first match wins.
TARGETS: list[tuple[str, tuple[str, ...]]] = [
    (r"(?i)bathrooms or washrooms|kylpy- tai pesuhuone", ("room_bath",)),  # mentions WC rooms: match first
    (r"(?i)separate WC rooms|erillist\w* WC-til", ("room_wc",)),
    (r"(?i)toilet bowls|WC seats|WC-istuin|\btoilets?\b", ("toilet",)),
    (r"(?i)showers and bathtubs|suihkua ja kylpyamme", ("shower", "bathtub")),
    (r"(?i)\bshowers?\b|suihku", ("shower",)),
    (r"(?i)bathtubs?|kylpyamme", ("bathtub",)),
    (r"(?i)sinks|wash ?basins|pesu- ja tiskiallas|allas", ("sink",)),
    (r"(?i)windows?|ikkun", ("window",)),
    (r"(?i)doors?\b|ovea|ovi", ("door",)),
    (r"(?i)saunas?\b|saunaa", ("sauna_bench",)),  # benches clustered per sauna: 89% vs 47% for the room class
    (r"(?i)kitchens?|keitti", ("room_kitchen",)),
    (r"(?i)bedrooms?|makuuhuone", ("room_bedroom",)),
    (r"(?i)balcon|parveke", ("room_outdoor",)),
]
FLOORS = re.compile(r"(?i)floors \(storeys\)|how many floors|kerrosta")
COUNT_CUE = re.compile(r"(?i)how many|number of|kuinka monta|montako")

# confidence threshold per target (classes joined by "+"), tuned on the `rest` split only
CONF = {"default": 0.35}


CLUSTER = {"sauna_bench": 0.05}  # count groups of touching boxes, gap as fraction of image size


def _clusters(boxes: list, gap: float) -> list[list]:
    groups: list[list] = []
    for b in boxes:
        near = [g for g in groups if any(not (b[2] + gap < o[0] or o[2] + gap < b[0] or b[3] + gap < o[1]
                                              or o[3] + gap < b[1]) for o in g)]
        groups = [g for g in groups if g not in near] + [[b] + [o for g in near for o in g]]
    return groups


def _weights() -> Path:
    return Path(os.environ.get("SITELENS_MODELS", "models")) / "detector.pt"


@lru_cache(maxsize=1)
def _model():
    from ultralytics import YOLO
    w = _weights()
    if not w.exists():
        return None
    return YOLO(str(w))


@lru_cache(maxsize=64)
def detect(path: str) -> tuple:
    """All detections on one image: ((cls_name, conf, (x0, y0, x1, y1)), ...) in image pixels."""
    m = _model()
    if m is None:
        return ()
    img = str(data_root() / path)
    r = m.predict(img, imgsz=1280, conf=0.1, iou=0.5, verbose=False, max_det=600)[0]
    names = r.names
    out = []
    for c, p, b in zip(r.boxes.cls.tolist(), r.boxes.conf.tolist(), r.boxes.xyxy.tolist()):
        out.append((names[int(c)], float(p), tuple(round(v, 1) for v in b)))
    return tuple(out)


def answer(path: str, question: str) -> Answer | None:
    if not path.lower().endswith(RASTER) or not COUNT_CUE.search(question):
        return None
    classes = ("floor",) if FLOORS.search(question) else next((c for rx, c in TARGETS if re.search(rx, question)), None)
    if classes is None or _model() is None:
        return None
    t = CONF.get("+".join(classes), CONF["default"])
    hits = [d for d in detect(path) if d[0] in classes and d[1] >= t]
    if classes == ("floor",) and not hits:
        return Answer(value=1, unit="count", method="detector", confidence=0.5, trace=["no storey box found, default 1"])
    if len(classes) == 1 and classes[0] in CLUSTER:
        from PIL import Image
        gap = CLUSTER[classes[0]] * max(Image.open(data_root() / path).size)
        groups = _clusters([list(b) for _, _, b in hits], gap)
        ev = [Evidence(file=path, label=f"{classes[0]} group ({len(g)})",
                       bbox=[min(x[0] for x in g), min(x[1] for x in g), max(x[2] for x in g), max(x[3] for x in g)])
              for g in groups]
        return Answer(value=len(groups), unit="count", method="detector", confidence=0.7, cost_eur=0.00001,
                      evidence=ev, trace=[f"{len(hits)} {classes[0]} boxes ≥ {t}", f"{len(groups)} groups"])
    return Answer(
        value=len(hits), unit="count", method="detector", confidence=0.7, cost_eur=0.00001,
        evidence=[Evidence(file=path, bbox=list(b), label=f"{c} {p:.2f}") for c, p, b in hits],
        trace=[f"detector classes {', '.join(classes)}", f"{len(hits)} boxes ≥ {t}"],
    )
