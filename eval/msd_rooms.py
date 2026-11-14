"""Compare raster room counts on unmodified Stoa drawings with MSD reference rooms."""
from __future__ import annotations

import argparse
import csv
import io
import json
import random
import re
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path

from eval.aecv import ROOMS

PLAN_ID = re.compile(r"site(\d+)_bldg(\d+)_floor(\d+)")
INDOOR = {"Bedroom", "Livingroom", "Kitchen", "Dining", "Corridor", "Stairs", "Storeroom", "Bathroom"}
KINDS = ("Space", "Bedroom", "Kitchen", "Bathroom")


def drawings(root: Path) -> dict:
    return {PLAN_ID.fullmatch(p.stem).groups(): p
            for p in sorted(root.glob("*.pdf")) if PLAN_ID.fullmatch(p.stem)}


def read_rooms(source: Path, plans: dict) -> dict:
    def read(stream):
        rows = defaultdict(list)
        for row in csv.DictReader(stream):
            key = tuple(row[col] for col in ("site_id", "building_id", "floor_id"))
            if key in plans and row["entity_type"] == "area" and row["roomtype"] in INDOOR:
                rows[key].append((row["roomtype"], row["geom"]))
        return rows

    if source.suffix.lower() == ".zip":
        with zipfile.ZipFile(source) as archive:
            files = [n for n in archive.namelist() if n.lower().endswith(".csv")]
            if len(files) != 1:
                raise ValueError("Expected one MSD metadata CSV in the ZIP")
            with archive.open(files[0]) as stream:
                return read(io.TextIOWrapper(stream, encoding="utf-8-sig"))
    with source.open(encoding="utf-8-sig", newline="") as stream:
        return read(stream)


def sample(plans: dict, limit: int, seed: int) -> list:
    keys = sorted(plans)
    random.Random(seed).shuffle(keys)
    buildings = set()
    result = []
    for key in keys:
        if key[:2] not in buildings:
            buildings.add(key[:2])
            result.append(key)
    return result[:limit]


def reference_boxes(pdf: Path, annotations: list, scale: float) -> list:
    """Transfer unique area-matched MSD rooms to the drawing's pixel coordinates."""
    import ezdxf
    from shapely import wkt
    from shapely.affinity import affine_transform
    from shapely.geometry import Polygon

    from sitelens import data_root
    from sitelens.paths.vector import load

    stem = pdf.with_suffix("").relative_to(data_root()).as_posix()
    plan = load(stem)
    if plan is None or plan.to_pdf is None:
        return [None] * len(annotations)
    dxf = ezdxf.readfile(pdf.with_suffix(".dxf")).modelspace()
    outlines = [Polygon([xy[:2] for xy in e.get_points()])
                for e in dxf.query('LWPOLYLINE[layer=="ROOM_OUTLINE"]') if len(e) >= 3]
    matrix = scale * plan.to_pdf
    transform = [*matrix[0, :2], *matrix[1, :2], matrix[0, 2], matrix[1, 2]]
    areas = [wkt.loads(wkt_text).area for _, wkt_text in annotations]
    result = []
    for area in areas:
        tolerance = max(1e-5, area * 1e-5)
        matches = [poly for poly in outlines if abs(poly.area - area) <= tolerance]
        unique = sum(abs(other - area) <= tolerance for other in areas) == 1
        result.append(affine_transform(matches[0], transform) if unique and len(matches) == 1 else None)
    return result


def baseline(path: Path) -> dict:
    from sitelens.paths import detector

    hits = detector.detect(str(path))
    out = {"Space": [b for c, p, b in hits if c in ROOMS and c != "room_outdoor" and p >= detector.CONF["default"]]}
    for kind, question in {
        "Bedroom": "How many bedrooms are shown?",
        "Kitchen": "How many kitchens are shown?",
    }.items():
        out[kind] = [e.bbox for e in detector.answer(str(path), question).evidence if e.bbox is not None]
    # MSD collapses sanitary room types into Bathroom.
    out["Bathroom"] = [b for c, p, b in hits if c in {"room_bath", "room_wc"}
                       and p >= detector.CONF.get(c, detector.CONF["default"])]
    return out


def score(predicted: list, gold: list, polygons: list) -> dict:
    from shapely.geometry import box

    candidates = defaultdict(list)
    for i, bbox in enumerate(predicted):
        rect = box(*bbox)
        for j, poly in enumerate(polygons):
            if poly is not None:
                intersection = rect.intersection(poly).area
                union = rect.area + poly.area - intersection
                if union and intersection / union >= 0.5:
                    candidates[i].append((intersection / union, j))
    for options in candidates.values():
        options.sort(reverse=True)

    matched = {}

    def assign(i, seen):
        for _, j in candidates[i]:
            if j in seen:
                continue
            seen.add(j)
            if j not in matched or assign(matched[j], seen):
                matched[j] = i
                return True
        return False

    # Reassign earlier boxes when doing so makes room for an additional match.
    for i in candidates:
        assign(i, set())
    used = set(matched.values())
    complete = all(p is not None for p in polygons)
    return {"count": len(predicted), "gold": len(gold), "error": abs(len(predicted) - len(gold)),
            "localized": len(matched), "alignable": sum(p is not None for p in polygons),
            "missed_aligned_rooms": [{"kind": gold[j][0], "bbox": p.bounds}
                                     for j, p in enumerate(polygons) if p is not None and j not in matched],
            "unmatched_boxes": [bbox for i, bbox in enumerate(predicted) if i not in used] if complete else None}


def main() -> None:
    import pymupdf

    from sitelens import data_root
    from sitelens.paths import detector
    from sitelens.room_geometry import rooms

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("metadata", type=Path, help="MSD Kaggle metadata CSV or its single-file ZIP")
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--seed", type=int, default=65)
    parser.add_argument("--output", type=Path, help="Optional per-plan scores as JSONL")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be positive")
    plans = drawings(data_root() / "data/swiss_dwellings")
    annotations = read_rooms(args.metadata, plans)
    if not annotations:
        parser.error("No matching Stoa Swiss drawings and MSD annotations")
    if not detector._weights().is_file():
        parser.error("Detector weights missing. Set SITELENS_MODELS to the folder containing detector.pt.")
    print(f"MSD overlap: {len(annotations)}/{len(plans)} Stoa Swiss floors with indoor annotations", flush=True)
    results = []
    with tempfile.TemporaryDirectory() as temp:
        for key in sample(annotations, args.limit, args.seed):
            pdf = plans[key]
            path = Path(temp, pdf.stem + ".png")
            scale = 2
            with pymupdf.open(pdf) as document:
                document[0].get_pixmap(matrix=pymupdf.Matrix(scale, scale)).save(path)
            geometry = rooms(path)
            predictions = {
                "baseline": baseline(path),
                "geometry": {
                    "Space": [r.bbox for r in geometry if r.kind != "balcony"],
                    "Bedroom": [r.bbox for r in geometry if r.kind == "bedroom"],
                    "Kitchen": [r.bbox for r in geometry if r.kind == "kitchen"],
                    "Bathroom": [r.bbox for r in geometry if r.kind in {"bath", "wc"}],
                },
            }
            gold = annotations[key]
            polygons = reference_boxes(pdf, gold, scale)
            for kind in KINDS:
                indices = [i for i, item in enumerate(gold) if kind == "Space" or item[0] == kind]
                for method, boxes in predictions.items():
                    results.append({"plan": pdf.stem, "kind": kind, "method": method,
                                    **score(boxes[kind], [gold[i] for i in indices],
                                            [polygons[i] for i in indices])})
            print(f"Scored {pdf.stem}", flush=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text("".join(json.dumps(row) + "\n" for row in results), encoding="utf-8")
    print("kind method exact/total mean-absolute-error localized/alignable")
    for kind in KINDS:
        for method in ("baseline", "geometry"):
            rows = [r for r in results if r["kind"] == kind and r["method"] == method]
            exact = sum(r["error"] == 0 for r in rows)
            mae = sum(r["error"] for r in rows) / len(rows)
            print(f"{kind} {method} {exact}/{len(rows)} {mae:.2f} "
                  f"{sum(r['localized'] for r in rows)}/{sum(r['alignable'] for r in rows)}")


if __name__ == "__main__":
    main()
