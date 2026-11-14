"""Routes a question to the cheapest path that can answer it. Entry point for the scorer and the API."""
from __future__ import annotations

import importlib
import time
from typing import Callable

from .answer import Answer

# What each path does, in words a site engineer reads in the chat's reasoning steps.
LABEL = {
    "diff": "Is there an earlier issue of this sheet? If so, I can compare the two.",
    "crosscheck": "Is this about conflicts? Let me cross-check the plan against its schedule.",
    "takeoff": "Is this asking for a list with sizes? Then I'll build it element by element from the model or schedule.",
    "ifc": "This could be in the BIM model. IFC elements carry their own properties, so I'll read them directly.",
    "vector": "Let me read the vector drawing: its text labels and geometry are exact.",
    "schedule": "Maybe a schedule table on the sheet has it. Let me read the tables.",
    "detector": "Let me scan the plan with our trained symbol detector.",
    "facts": "Let me check the facts I already extracted from this drawing.",
    "vlm": "The exact readers couldn't do it. As a last resort I'll ask a vision model to look at the drawing.",
}
Step = Callable[[dict], None]

# Tried in order. Cheap and exact first, models last. Missing modules are skipped,
# so tickets can land their path independently.
PATHS = [
    "sitelens.paths.diff",      # "what changed" on a sheet with a known earlier issue (diff_pairs.json)
    "sitelens.paths.crosscheck",  # "any conflicts?": door schedule vs drawn tags across the sheet's set
    "sitelens.takeoff",         # lists with sizes: "doors in room X and their dimensions" (+ CSV table)
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
        step("try", short, LABEL.get(short, f"Let me try the {short} reader."))
        t = time.time()
        try:
            a = mod.answer(path, question)
        except Exception as e:  # one broken path must not block the fallbacks
            errors.append(f"{short} path failed: {e!r}")
            step("fail", short, f"That reader failed ({type(e).__name__}). I'll try the next one.")
            continue
        if a is not None and a.value is not None:
            step("found", short, f"Found it in {time.time() - t:.2f}s. Here is how:")
            for line in a.trace:
                step("trace", short, line)
            a.trace = errors + a.trace
            a.trace.append(f"{short} path, {time.time() - t:.2f}s")
            return a
        step("skip", short, "No.")
    a = Answer.unknown("no path could answer")
    a.trace = errors + a.trace
    step("fail", "", "None of my readers could answer this from the drawing.")
    return a


if __name__ == "__main__":
    import argparse, json
    p = argparse.ArgumentParser(description="Answer one question about one drawing")
    p.add_argument("path", help="dataset-relative path, e.g. data/ifc_models/x.ifc")
    p.add_argument("question")
    a = p.parse_args()
    print(json.dumps(answer(a.path, a.question).to_dict(), indent=2, ensure_ascii=False))
