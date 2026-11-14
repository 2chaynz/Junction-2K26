"""Tiered chat answer + numbered sources with fake paths. No dataset, no network.  python tests/test_pipeline.py"""
import os
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.pop("GEMINI_API_KEY", None)
os.environ.pop("SITELENS_VLM", None)

from sitelens import Answer, Evidence, pipeline, router  # noqa: E402

# follow-ups: free rules
f = pipeline.followup
h = [{"question": "How many doors are on '1.korrus'?", "answer": "12"}]
assert f("and windows?", h)[0] == "How many windows are on '1.korrus'?", f("and windows?", h)
assert f("what about '2.korrus'?", h)[0] == "How many doors are on '2.korrus'?"
assert f("How many walls are there?", h)[0] == "How many walls are there?"   # standalone stays
assert f("and windows?", [])[0] == "and windows?"


def fake(name, fn):
    m = types.ModuleType(name)
    m.answer = fn
    sys.modules[name] = m
    return name


def doors(p, q):
    if p != "data/a.pdf" or "door" not in q:
        return None
    ev = [Evidence(p, [0, 0, 1, 1], label="door D1"), Evidence(p, [2, 2, 3, 3], label="door D2")]
    return Answer(2, unit="count", method="vector", evidence=ev, trace=["2 door symbols", "door D2 next to stair"])


def windows_elsewhere(p, q):
    if p == "data/b.pdf" and "window" in q:
        return Answer(5, unit="count", method="schedule", evidence=[Evidence(p, [5, 5, 6, 6], label="row W1")],
                      trace=["window schedule, 5 rows"])
    return None


router.PATHS = [fake("t.doors", doors), fake("t.win", windows_elsewhere), fake("t.vlm", lambda p, q: Answer("12"))]

# tier 1: sources mirror evidence, trace lines cite what they mention
steps = []
a = pipeline.run("data/a.pdf", "how many doors?", steps.append)
assert a["value"] == 2 and a["tier"] == "drawing"
assert [s["n"] for s in a["sources"]] == [1, 2] and a["sources"][1]["ev"] == 1
assert a["reasoning"][0]["src"] == [1, 2]
assert a["reasoning"][2] == {"tier": "drawing", "text": "door D2 next to stair", "src": [2]}, a["reasoning"]
assert steps[0]["kind"] == "tier"

# vlm held back in tier 1: a related sheet answers first and becomes the view
a = pipeline.run("data/a.pdf", "how many windows?", None, related=["data/b.pdf"])
assert a["value"] == 5 and a["tier"] == "project" and a["view"] == "data/b.pdf", a
assert a["sources"][0]["file"] == "data/b.pdf" and a["confidence"] <= 0.8

# follow-up from history goes through the same tiers
a = pipeline.run("data/a.pdf", "and windows?", None, history=[{"question": "how many doors?", "answer": "2"}],
                 related=["data/b.pdf"])
assert a["value"] == 5 and a["followup"]["standalone"] == "how many windows?", a

# Stoa's questions: router as the scorer runs it (vlm included), no related sheets, no web
a = pipeline.run("data/a.pdf", "how many windows?", None, related=["data/b.pdf"], stoa=True)
assert a["value"] == "12" and a["tier"] == "drawing", a

# nothing anywhere, no key: unknown with the readers tried
router.PATHS = [fake("t.doors", doors)]
a = pipeline.run("data/a.pdf", "how many sinks?", None, related=["data/b.pdf"])
assert a["value"] is None and a["tier"] == "none" and a["tried"] == ["doors"], a
print("pipeline ok")
