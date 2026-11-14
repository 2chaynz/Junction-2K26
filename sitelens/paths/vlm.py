"""VLM path: last-resort fallback and the "frontier model" baseline.

Off unless SITELENS_VLM=<backend> is set, so the router never spends money by accident.
Backends (gemini, gemma, nemotron, vllm, ...): sitelens/vlm_backends. Per-call override: use_backend(name).
The model sees the whole sheet and must return a number plus boxes for the regions it used.
"""
from __future__ import annotations

import json
import os
import re
from contextlib import contextmanager
from contextvars import ContextVar

from .. import data_root
from ..answer import Answer, Evidence
from ..vlm_backends import get

_override: ContextVar[str | None] = ContextVar("vlm_backend", default=None)
MAX_SIDE = 1600

PROMPT = """You are reading a construction drawing. Answer the question using only what is drawn.
Question: {q}
Reply with JSON only: {{"answer": <number or short text>, "boxes": [[x0, y0, x1, y1], ...]}}
"boxes" are the regions you counted or read, in 0-1000 coordinates relative to the image width/height."""


def _image(path: str, clip=None):
    """Return the rendered image and its bounds in evidence coordinates."""
    from PIL import Image
    full = data_root() / path
    if path.lower().endswith(".pdf"):
        import pymupdf
        with pymupdf.open(full) as doc:
            page = doc[0]
            bounds = clip if clip is not None else page.rect
            z = MAX_SIDE / max(bounds.width, bounds.height)
            pix = page.get_pixmap(matrix=pymupdf.Matrix(z, z), clip=clip)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        return img, (pix.x / z, pix.y / z, pix.width / z, pix.height / z)
    img = Image.open(full).convert("RGB")
    width, height = img.size
    s = min(1.0, MAX_SIDE / max(img.size))
    if s < 1:
        img = img.resize((int(img.width * s), int(img.height * s)))
    return img, (0, 0, width, height)


@contextmanager
def use_backend(name: str):
    """Pick the backend for calls inside this block, whatever SITELENS_VLM says."""
    get(name)  # fail on entry for an unknown name
    tok = _override.set(name)
    try:
        yield
    finally:
        _override.reset(tok)


def _parse(text: str):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None, []
    try:
        d = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None, []
    v = d.get("answer")
    if isinstance(v, str):
        n = re.search(r"-?\d+(?:[.,]\d+)?", v)
        v = float(n.group(0).replace(",", ".")) if n and len(v) < 20 else v
    boxes = [b for b in d.get("boxes") or [] if isinstance(b, list) and len(b) == 4
             and all(isinstance(x, (int, float)) for x in b)]
    return v, boxes


def answer(path: str, question: str) -> Answer | None:
    name = _override.get() or os.environ.get("SITELENS_VLM")
    if not name or not path.lower().endswith((".pdf", ".png", ".jpg", ".jpeg")):
        return None
    backend = get(name)
    who = f"{name} · {backend.model()}"
    from .crop import region

    clip = None
    if path.lower().endswith(".pdf") and os.environ.get("SITELENS_VLM_CROP", "1") != "0":
        clip = region(path, question)
    prompt = PROMPT.format(q=question)
    img, bounds = _image(path, clip)
    text, cost = backend.ask(img, prompt)
    value, boxes = _parse(text)
    if clip is not None and (value is None or not boxes):
        clip = None
        img, bounds = _image(path)
        text, fallback_cost = backend.ask(img, prompt)
        cost += fallback_cost
        value, boxes = _parse(text)
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    W, H = img.size
    x, y, width, height = bounds
    ev = [Evidence(file=path, label=who,
                   bbox=[x + b[0] / 1000 * width, y + b[1] / 1000 * height,
                         x + b[2] / 1000 * width, y + b[3] / 1000 * height])
          for b in boxes]
    return Answer(value=value, unit=None, method="vlm", confidence=0.4, cost_eur=round(cost, 6), evidence=ev,
                  trace=[f"{who} read {'a crop' if clip is not None else 'the whole sheet'} ({W}x{H} px)",
                         f"raw: {text.strip()[:200]}"])
