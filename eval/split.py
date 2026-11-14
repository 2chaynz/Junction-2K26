"""Deterministic dev split by drawing (all formats of a drawing land in the same split).

dev  = ~20% of drawings: report numbers on these. Never train or tune prompts on them.
rest = everything else: free to look at, tune on, use for few-shot examples.

Any model trained on outside data (e.g. public CubiCasa5K) must also exclude every drawing
in the Stoa dataset: see train/exclude.py.
"""
import hashlib
import re


def drawing_id(path: str) -> str:
    """data/ifc_models/m_plan-02-x.pdf and data/ifc_models/m.ifc → same id."""
    stem = path.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    stem = re.sub(r"_plan-.*$", "", stem)
    return path.split("/")[1] + "/" + stem


def split_of(path: str) -> str:
    h = int(hashlib.sha1(drawing_id(path).encode()).hexdigest(), 16)
    return "dev" if h % 5 == 0 else "rest"
