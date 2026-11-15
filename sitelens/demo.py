"""Final demo set (T96): the projects the demo opens on, and sheet sets listed whole.

SITELENS_DEMO=1 limits the drawing list to PROJECTS. SHEET_SETS are listed in full either way, so a
project shows the real set (and cross-sheet answers have their sheets), not only the sheets Stoa asked about.
"""
from __future__ import annotations

import os
from functools import lru_cache

from . import data_root

# Whole US sheet sets: every PDF in the folder is a drawing of the project.
SHEET_SETS = [
    "data/opening_design/CTR/Most Current Set/Full size sheets",
    "data/opening_design/Sports_Complex/Sheets - Current Set",
]

# Path prefixes kept in demo mode, in demo order. Each shows something a PDF viewer or BIM viewer can't.
PROJECTS = [
    "data/ifc_models/bimspeed-vitoria_ald26-",          # IFC revision diff in 3D, takeoff (?demo)
    "data/opening_design/CTR/Most Current Set/",        # 66 sheets: plan vs schedule cross-check, schedule counts
    "data/opening_design/Sports_Complex/",              # sheet revision diff (?demo=sheets), schedules, Bluebeam export
    "data/ifc_models/bsc-esplanades_",                  # Estonian BIM: any-language Q&A, floors, 3D evidence
    "data/ifc_models/bsc-clinic_",                      # five discipline models, every counted door marked
    "data/swiss_dwellings/site418_bldg1080_floor4724",  # vector PDF: exact areas, apartments, measure
    "data/swiss_dwellings/site412_",
    "data/swiss_dwellings/site417_",
    "data/swiss_dwellings/site419_",
    "data/cubicasa5k/colorful-11485.png",               # scan: detector counts, review mode, highlighter
    "data/cubicasa5k/colorful-10266.png",
    "data/cubicasa5k/colorful-11573.png",
    "data/cubicasa5k/colorful-10711.png",
]


def on() -> bool:
    return os.environ.get("SITELENS_DEMO", "") not in ("", "0")


def keep(path: str) -> bool:
    """In demo mode, only drawings of the demo projects."""
    return not on() or path.startswith(tuple(PROJECTS))


@lru_cache(maxsize=1)
def set_sheets() -> tuple[str, ...]:
    """Every PDF of the SHEET_SETS that exists in this dataset (the preview has only a few)."""
    root = data_root()
    out = []
    for folder in SHEET_SETS:
        d = root / folder
        if d.is_dir():
            out += sorted(f"{folder}/{p.name}" for p in d.iterdir() if p.suffix.lower() == ".pdf")
    return tuple(out)
