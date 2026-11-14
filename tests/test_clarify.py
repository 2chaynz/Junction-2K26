"""Clarify gating and wording. Needs no dataset.  python tests/test_clarify.py"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.pop("GEMINI_API_KEY", None)

from sitelens import clarify as C  # noqa: E402

assert C.understand("How many doors?").startswith("You want to count doors")
assert "'1.korrus'" in C.understand("How many doors are on '1.korrus'?")
assert C.understand("What is the net floor area of room 5.11 ('Stanza') in m²?").startswith("You want an area")
assert C.understand("hello").startswith("Let me work out")
# Named, numbered or whole-building questions are never asked back (no file access needed for these).
for q in ["How many doors are on '1.korrus'?", "Area of room 5.11?", "What is the total area?"]:
    assert C.check("data/ifc_models/none.ifc", q) is None, q
assert C._llm("data/x.pdf", "what is the area?") is None  # no key → no LLM check
print("clarify ok")
