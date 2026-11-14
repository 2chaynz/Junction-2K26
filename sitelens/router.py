"""Routes a question to the cheapest path that can answer it. Entry point for the scorer and the API."""
from __future__ import annotations

import importlib
import time
from typing import Callable

from .answer import Answer

# What each path does, in words a site engineer reads in the chat's reasoning steps.
LABEL = {
    "diff": "comparing with the earlier issue of this sheet",
    "crosscheck": "cross-checking the plan against its schedule",
    "ifc": "reading the BIM model (IFC elements and properties)",
    "vector": "reading the vector drawing (text labels and geometry)",
    "schedule": "reading schedule tables on the sheet",
    "detector": "scanning the plan with the trained symbol detector",
    "facts": "checking the facts already extracted from the drawing",
    "vlm": "asking a vision model to look at the drawing",
}
Step = Callable[[dict], None]

# Tried in order. Cheap and exact first, models last. Missing modules are skipped,
# so tickets can land their path independently.
PATHS = [
    "sitelens.paths.diff",      # "what changed" on a sheet with a known earlier issue (diff_pairs.json)
    "sitelens.paths.crosscheck",  # "any conflicts?": door schedule vs drawn tags across the sheet's set
    "sitelens.paths.ifc",      # IFC model → ifcopenshell
    "sitelens.paths.vector",    # vector PDF / DXF text + geometry
    "sitelens.paths.schedule",  # schedule tables on vector sheets (+ Gemini over the extracted table)
    "sitelens.paths.detector",  # raster → trained symbol detector
    "sitelens.paths.facts",     # free-form questions: LLM over the facts the parsers extracted, cites them
    "sitelens.paths.vlm",       # fallback: vision-language model
]


def _load(name):
    try:
        return importlib.import_module(name)
    except ModuleNotFoundError as e:
        if e.name == name:
            return None  # path not written yet
        raise


def answer(path: str, question: str, on_step: Step | None = None) -> Answer:
    """on_step gets each step as it happens: {"kind": try|skip|fail|found|trace, "path", "text", "t"}."""
    t0 = time.time()

    def step(kind: str, short: str, text: str) -> None:
        text = text[:1].upper() + text[1:]
        if on_step:
            on_step({"kind": kind, "path": short, "text": text, "t": round(time.time() - t0, 3)})

    errors: list[str] = []
    for name in PATHS:
        mod = _load(name)
        if mod is None:
            continue
        short = name.rsplit(".", 1)[1]
        step("try", short, LABEL.get(short, f"Trying the {short} path"))
        t = time.time()
        try:
            a = mod.answer(path, question)
        except Exception as e:  # one broken path must not block the fallbacks
            errors.append(f"{short} path failed: {e!r}")
            step("fail", short, f"This reader broke ({type(e).__name__}), moving on")
            continue
        if a is not None and a.value is not None:
            step("found", short, f"Answer found in {time.time() - t:.2f}s. How:")
            for line in a.trace:
                step("trace", short, line)
            a.trace = errors + a.trace
            a.trace.append(f"{short} path, {time.time() - t:.2f}s")
            return a
        step("skip", short, "Not something this reader can answer, next")
    a = Answer.unknown("no path could answer")
    a.trace = errors + a.trace
    step("fail", "", "No reader could answer from the drawing")
    return a


if __name__ == "__main__":
    import argparse, json
    p = argparse.ArgumentParser(description="Answer one question about one drawing")
    p.add_argument("path", help="dataset-relative path, e.g. data/ifc_models/x.ifc")
    p.add_argument("question")
    a = p.parse_args()
    print(json.dumps(answer(a.path, a.question).to_dict(), indent=2, ensure_ascii=False))
