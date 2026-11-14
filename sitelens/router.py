"""Routes a question to the cheapest path that can answer it. Entry point for the scorer and the API."""
from __future__ import annotations

import importlib
import time

from .answer import Answer

# Tried in order. Cheap and exact first, models last. Missing modules are skipped,
# so tickets can land their path independently.
PATHS = [
    "sitelens.paths.ifc",       # IFC model → ifcopenshell
    "sitelens.paths.vector",    # vector PDF / DXF text + geometry
    "sitelens.paths.detector",  # raster → trained symbol detector
    "sitelens.paths.vlm",       # fallback: vision-language model
]


def _load(name):
    try:
        return importlib.import_module(name)
    except ModuleNotFoundError as e:
        if e.name == name:
            return None  # path not written yet
        raise


def answer(path: str, question: str) -> Answer:
    errors: list[str] = []
    for name in PATHS:
        mod = _load(name)
        if mod is None:
            continue
        t = time.time()
        try:
            a = mod.answer(path, question)
        except Exception as e:  # one broken path must not block the fallbacks
            errors.append(f"{name.rsplit('.', 1)[1]} path failed: {e!r}")
            continue
        if a is not None and a.value is not None:
            a.trace = errors + a.trace
            a.trace.append(f"{name.rsplit('.', 1)[1]} path, {time.time() - t:.2f}s")
            return a
    a = Answer.unknown("no path could answer")
    a.trace = errors + a.trace
    return a


if __name__ == "__main__":
    import argparse, json
    p = argparse.ArgumentParser(description="Answer one question about one drawing")
    p.add_argument("path", help="dataset-relative path, e.g. data/ifc_models/x.ifc")
    p.add_argument("question")
    a = p.parse_args()
    print(json.dumps(answer(a.path, a.question).to_dict(), indent=2, ensure_ascii=False))
