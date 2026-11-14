"""The one data type every solver returns. See CONTRACT.md → Answer."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Evidence:
    """A region of a drawing that supports the answer (what the UI highlights)."""
    file: str                      # dataset-relative path, e.g. data/swiss_dwellings/x.pdf
    bbox: list[float]              # [x0, y0, x1, y1] in page units (PDF points) or image pixels
    page: int = 0                  # 0-based page for PDFs, 0 for images
    label: str = ""                # what this region is, e.g. "WC", "room 2.09 · 15.90 m²"
    kind: str = "box"              # box | polygon | text | ifc
    polygon: list[list[float]] | None = None   # optional exact outline, same units as bbox
    ifc_guid: str | None = None    # for kind == "ifc"


@dataclass
class Answer:
    value: Any                     # number for count/area/length/volume, string for text, None = unknown
    unit: str | None = None        # count | m2 | m3 | m | ft2 | None
    method: str = "none"           # ifc | vector | detector | vlm | none
    confidence: float = 0.0        # 0..1
    cost_eur: float = 0.0          # inference cost of this answer
    evidence: list[Evidence] = field(default_factory=list)
    trace: list[str] = field(default_factory=list)   # human-readable steps, shown in the UI
    # T42 review mode: objects the reader saw but did NOT count (e.g. detections just under the confidence
    # cut). Not part of the answer; the UI shows them dashed so a human can promote one with a click.
    candidates: list[Evidence] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def unknown(reason: str) -> "Answer":
        return Answer(value=None, trace=[reason])
