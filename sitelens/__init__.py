"""SiteLens: answer questions about construction drawings, with evidence."""
import os
from pathlib import Path

from .answer import Answer, Evidence  # noqa: F401


def data_root() -> Path:
    """Dataset root (the folder that holds questions.jsonl and data/). Set STOA_DATA."""
    root = os.environ.get("STOA_DATA")
    if not root:
        raise RuntimeError("Set STOA_DATA to the unzipped dataset folder (contains questions.jsonl)")
    return Path(root)
