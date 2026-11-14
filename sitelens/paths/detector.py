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


def _get(path: str, cls: str, t: float) -> list:
    return [(c, p, b) for c, p, b in detect(path) if c == cls and p >= t]


def _inside(b, big) -> bool:
    x, y = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    return big[0] <= x <= big[2] and big[1] <= y <= big[3]


def _bathrooms(path: str) -> Answer:
    """CubiCasa has no WC-room class: a separate WC is a bath space with a toilet but no shower/tub.
    Bathrooms (excluding WCs) = bath boxes minus those. Thresholds tuned on `rest`: dev 62.5% → 87.5%."""
    baths, toilets = _get(path, "room_bath", 0.2), _get(path, "toilet", 0.1)
    wet = _get(path, "shower", 0.1) + _get(path, "bathtub", 0.1)
    keep = [d for d in baths
            if not (any(_inside(t[2], d[2]) for t in toilets) and not any(_inside(w[2], d[2]) for w in wet))]
    return Answer(value=len(keep), unit="count", method="detector", confidence=0.7, cost_eur=0.00001,
                  evidence=[Evidence(file=path, bbox=list(b), label=f"bathroom {p:.2f}") for _, p, b in keep],
                  trace=[f"{len(baths)} bath spaces", f"{len(baths) - len(keep)} are separate WCs (toilet, no shower/tub)"])


def _sinks(path: str) -> Answer:
    """Kitchen sinks are often missed (label variants): add one per kitchen with no sink detected inside.
    Thresholds tuned on `rest`: dev 42% → 60%."""
    sinks, kitchens = _get(path, "sink", 0.1), _get(path, "room_kitchen", 0.3)
    extra = [k for k in kitchens if not any(_inside(s[2], k[2]) for s in sinks)]
    ev = [Evidence(file=path, bbox=list(b), label=f"sink {p:.2f}") for _, p, b in sinks]
    ev += [Evidence(file=path, bbox=list(b), label="kitchen: sink assumed") for _, p, b in extra]
    return Answer(value=len(sinks) + len(extra), unit="count", method="detector", confidence=0.6, cost_eur=0.00001,
                  evidence=ev, trace=[f"{len(sinks)} sinks detected", f"+{len(extra)} kitchens without a detected sink"])


def answer(path: str, question: str) -> Answer | None:
    if not path.lower().endswith(RASTER) or not COUNT_CUE.search(question):
        return None
    classes = ("floor",) if FLOORS.search(question) else next((c for rx, c in TARGETS if re.search(rx, question)), None)
    if classes is None or _model() is None:
        return None
    if classes == ("room_bath",):
        return _bathrooms(path)
    if classes == ("sink",):
        return _sinks(path)
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
