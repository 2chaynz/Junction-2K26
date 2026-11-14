"""Convert public CubiCasa5K SVG labels to a YOLO detection dataset.

  python -m train.cubicasa_to_yolo --src ../junction-data/cubicasa/cubicasa5k --out ../junction-data/yolo \
      --exclude train/exclude_cubicasa.txt

Boxes are in F1_scaled.png pixel coordinates (the frame the official CubiCasa loader uses).
Every plan whose id is in the exclude list (= drawings in the Stoa dataset) is dropped.
Splits follow CubiCasa's own train/val/test lists.
"""
from __future__ import annotations

import argparse
import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np

# CubiCasa class → our class. Order = YOLO class id. Keep in sync with sitelens/paths/detector.py.
OBJECTS = {
    "Window": "window", "Door": "door",
    "FixedFurniture Toilet": "toilet", "FixedFurniture Sink": "sink", "FixedFurniture Bathtub": "bathtub",
    "FixedFurniture Shower": "shower", "FixedFurniture SaunaBench": "sauna_bench",
    "FixedFurniture SaunaBenchMid": "sauna_bench", "FixedFurniture SaunaBenchHigh": "sauna_bench",
    "FixedFurniture Fireplace": "fireplace", "FixedFurniture Closet": "closet",
}
SPACES = {
    "Bedroom": "room_bedroom", "Bath": "room_bath", "Kitchen": "room_kitchen", "Sauna": "room_sauna",
    "Outdoor": "room_outdoor", "Toilet": "room_wc", "LivingRoom": "room_living", "Entry": "room_entry",
    "Storage": "room_storage", "Utility": "room_utility", "DraughtLobby": "room_entry", "Garage": "room_garage",
}
NAMES = list(dict.fromkeys(list(OBJECTS.values()) + list(SPACES.values()) + ["floor"]))
MIN_PX = 8
NUM = re.compile(r"-?\d*\.?\d+(?:e-?\d+)?")


def _matrix(t: str | None) -> np.ndarray:
    m = np.eye(3)
    if not t:
        return m
    for kind, args in re.findall(r"(\w+)\(([^)]*)\)", t):
        v = [float(x) for x in NUM.findall(args)]
        if kind == "matrix" and len(v) == 6:
            a = np.array([[v[0], v[2], v[4]], [v[1], v[3], v[5]], [0, 0, 1]])
        elif kind == "translate":
            a = np.array([[1, 0, v[0]], [0, 1, v[1] if len(v) > 1 else 0], [0, 0, 1]])
        elif kind == "scale":
            a = np.diag([v[0], v[1] if len(v) > 1 else v[0], 1])
        elif kind == "rotate":
            r = np.radians(v[0]); c, s = np.cos(r), np.sin(r)
            a = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
        else:
            continue
        m = m @ a
    return m


def _points(el) -> np.ndarray | None:
    tag = el.tag.split("}")[-1]
    if tag in ("polygon", "polyline"):
        v = [float(x) for x in NUM.findall(el.get("points", ""))]
        return np.array(v).reshape(-1, 2) if len(v) >= 4 else None
    if tag == "rect":
        x, y, w, h = (float(el.get(k, 0)) for k in ("x", "y", "width", "height"))
        return np.array([[x, y], [x + w, y + h]])
    return None


def _class_of(el) -> str | None:
    c = el.get("class", "")
    if c in OBJECTS:
        return OBJECTS[c]
    if c.startswith("Window"):
        return "window"
    if c.startswith("Door") and not c.startswith("Doors"):
        return "door"
    if c.startswith("FixedFurniture "):
        kind = c.split()[1]
        if kind.endswith("Sink"):  # Sink, DoubleSink, RoundSink, SideSink, CornerSink, DoubleSinkRight
            return "sink"
        return OBJECTS.get(" ".join(c.split()[:2]))
    if c.startswith("Space "):
        return SPACES.get(c.split()[1])
    return None


SKIP = {"Dimension", "SpaceDimensionsLabel", "TextLabel", "SelectionControls", "Visual", "Name"}


def _collect(el, m, acc, first_only=False) -> bool:
    """Append transformed points of el's subtree (m = transform of el's parent)."""
    m = m @ _matrix(el.get("transform"))
    p = _points(el)
    if p is not None:
        acc.append((np.c_[p, np.ones(len(p))] @ m.T)[:, :2])
        if first_only:
            return True
    for ch in el:
        if ch.get("class", "").split(" ")[0] in SKIP:
            continue
        if _collect(ch, m, acc, first_only) and first_only:
            return True
    return False


def _find_bp(el, m):
    """(BoundaryPolygon element, transform of its parent) inside el's subtree, or None. m includes el."""
    for ch in el:
        if ch.get("class") == "BoundaryPolygon":
            return ch, m
        r = _find_bp(ch, m @ _matrix(ch.get("transform")))
        if r:
            return r
    return None


def boxes(svg: Path) -> list[tuple[str, np.ndarray]]:
    """[(class, [x0, y0, x1, y1])] in SVG user units."""
    out = []

    def walk(el, parent_m):
        m = parent_m @ _matrix(el.get("transform"))
        if el.get("class", "").startswith("Floorplan"):  # one storey: box around its walls
            pts = []
            for w in [e for e in el.iter() if e.get("class", "").startswith("Wall")]:
                _collect(w, m, pts)
            if pts:
                q = np.vstack(pts)
                out.append(("floor", np.array([q[:, 0].min(), q[:, 1].min(), q[:, 0].max(), q[:, 1].max()])))
        cls = _class_of(el)
        if cls:
            pts = []
            bp = _find_bp(el, m)
            if bp:
                _collect(bp[0], bp[1], pts)
            else:  # rooms: first polygon is the outline; windows/doors: whole group minus labels
                _collect(el, parent_m, pts, first_only=cls.startswith("room_"))
            if pts:
                q = np.vstack(pts)
                out.append((cls, np.array([q[:, 0].min(), q[:, 1].min(), q[:, 0].max(), q[:, 1].max()])))
            if not cls.startswith("room_"):
                return  # objects don't nest; rooms can contain furniture
        for ch in el:
            walk(ch, m)

    walk(ET.parse(svg).getroot(), np.eye(3))
    # CubiCasa has no WC-room class: a bath space with a toilet but no shower/bathtub is a separate WC
    ctr = lambda b: ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)  # noqa: E731
    inside = lambda b, r: r[0] <= ctr(b)[0] <= r[2] and r[1] <= ctr(b)[1] <= r[3]  # noqa: E731
    toilets = [b for c, b in out if c == "toilet"]
    wet = [b for c, b in out if c in ("shower", "bathtub")]
    out = [("room_wc" if c == "room_bath" and any(inside(t, b) for t in toilets) and not any(inside(w, b) for w in wet)
            else c, b) for c, b in out]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="cubicasa5k folder (contains train.txt)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--exclude", help="file with plan ids to drop (python -m train.exclude)")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    src, out = Path(a.src), Path(a.out)
    excl = set(Path(a.exclude).read_text().split()) if a.exclude else set()
    from PIL import Image
    stats = {"plans": 0, "excluded": 0, "boxes": 0}
    for split in ("train", "val", "test"):
        ids = [l.strip().strip("/") for l in (src / f"{split}.txt").read_text().split() if l.strip()]
        if a.limit:
            ids = ids[: a.limit]
        (out / "images" / split).mkdir(parents=True, exist_ok=True)
        (out / "labels" / split).mkdir(parents=True, exist_ok=True)
        for pid in ids:
            d = src / pid
            if pid.rsplit("/", 1)[-1] in excl:
                stats["excluded"] += 1
                continue
            img = d / "F1_scaled.png"
            if not img.exists():
                continue
            W, H = Image.open(img).size
            lines = []
            for cls, (x0, y0, x1, y1) in boxes(d / "model.svg"):
                # doors/windows are thin strips in the labels: pad to a learnable minimum size
                pad_x, pad_y = max(0, (MIN_PX - (x1 - x0)) / 2), max(0, (MIN_PX - (y1 - y0)) / 2)
                x0, x1, y0, y1 = x0 - pad_x, x1 + pad_x, y0 - pad_y, y1 + pad_y
                x0, x1 = max(0, x0), min(W, x1)
                y0, y1 = max(0, y0), min(H, y1)
                if x1 - x0 < 2 or y1 - y0 < 2:
                    continue
                lines.append(f"{NAMES.index(cls)} {(x0 + x1) / 2 / W:.6f} {(y0 + y1) / 2 / H:.6f} "
                             f"{(x1 - x0) / W:.6f} {(y1 - y0) / H:.6f}")
            name = pid.replace("/", "_")
            shutil.copy(img, out / "images" / split / f"{name}.png")
            (out / "labels" / split / f"{name}.txt").write_text("\n".join(lines))
            stats["plans"] += 1
            stats["boxes"] += len(lines)
    (out / "data.yaml").write_text(
        f"path: {out.resolve().as_posix()}\ntrain: images/train\nval: images/val\ntest: images/test\n"
        f"names: {NAMES}\n")
    print(stats)


if __name__ == "__main__":
    main()
