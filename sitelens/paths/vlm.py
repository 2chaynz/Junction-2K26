"""VLM path: last-resort fallback and the "frontier model" baseline.

Off unless SITELENS_VLM is set, so the router never spends money by accident:
  SITELENS_VLM=gemma   local Gemma 4 (transformers) from SITELENS_GEMMA (default /root/models/gemma-4-12B-it)
  SITELENS_VLM=gemini  Gemini API, needs GEMINI_API_KEY (model: SITELENS_GEMINI_MODEL)
The model sees the whole sheet and must return a number plus boxes for the regions it used.
"""
from __future__ import annotations

import json
import os
import re
import time
from functools import lru_cache

from .. import data_root
from ..answer import Answer, Evidence

GPU_EUR_PER_H = float(os.environ.get("SITELENS_GPU_EUR_H", "2.14"))   # Verda A100 on-demand
GEMINI_EUR_PER_MTOK = (0.30, 2.50)  # input, output; set to the model you use
MAX_SIDE = 1600

PROMPT = """You are reading a construction drawing. Answer the question using only what is drawn.
Question: {q}
Reply with JSON only: {{"answer": <number or short text>, "boxes": [[x0, y0, x1, y1], ...]}}
"boxes" are the regions you counted or read, in 0-1000 coordinates relative to the image width/height."""


def _image(path: str):
    """(PIL image, scale from image pixels back to evidence units)."""
    from PIL import Image
    full = data_root() / path
    if path.lower().endswith(".pdf"):
        import pymupdf
        page = pymupdf.open(full)[0]
        z = MAX_SIDE / max(page.rect.width, page.rect.height)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(z, z))
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        return img, 1 / z  # evidence in PDF points
    img = Image.open(full).convert("RGB")
    s = min(1.0, MAX_SIDE / max(img.size))
    if s < 1:
        img = img.resize((int(img.width * s), int(img.height * s)))
    return img, 1 / s


@lru_cache(maxsize=1)
def _gemma():
    import torch
    from transformers import AutoModelForImageTextToText, AutoProcessor
    path = os.environ.get("SITELENS_GEMMA", "/root/models/gemma-4-12B-it")
    proc = AutoProcessor.from_pretrained(path)
    model = AutoModelForImageTextToText.from_pretrained(path, torch_dtype=torch.bfloat16, device_map="cuda")
    return proc, model


def _ask_gemma(img, q: str) -> tuple[str, float]:
    import torch
    proc, model = _gemma()
    msgs = [{"role": "user", "content": [{"type": "image", "image": img}, {"type": "text", "text": PROMPT.format(q=q)}]}]
    inp = proc.apply_chat_template(msgs, add_generation_prompt=True, tokenize=True, return_dict=True,
                                   return_tensors="pt").to(model.device)
    t = time.time()
    with torch.inference_mode():
        out = model.generate(**inp, max_new_tokens=400, do_sample=False)
    text = proc.decode(out[0][inp["input_ids"].shape[-1]:], skip_special_tokens=True)
    return text, (time.time() - t) / 3600 * GPU_EUR_PER_H


def _ask_gemini(img, q: str) -> tuple[str, float]:
    import base64
    import io
    import urllib.request
    model = os.environ.get("SITELENS_GEMINI_MODEL", "gemini-2.5-flash")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    body = {"contents": [{"parts": [{"inline_data": {"mime_type": "image/png",
                                                     "data": base64.b64encode(buf.getvalue()).decode()}},
                                    {"text": PROMPT.format(q=q)}]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}}
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json",
                                                 "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
    r = json.load(urllib.request.urlopen(req, timeout=120))
    u = r.get("usageMetadata", {})
    cost = (u.get("promptTokenCount", 0) * GEMINI_EUR_PER_MTOK[0]
            + (u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0)) * GEMINI_EUR_PER_MTOK[1]) / 1e6
    return r["candidates"][0]["content"]["parts"][0]["text"], cost


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
    backend = os.environ.get("SITELENS_VLM")
    if backend not in ("gemma", "gemini") or not path.lower().endswith((".pdf", ".png", ".jpg", ".jpeg")):
        return None
    img, back = _image(path)
    text, cost = (_ask_gemma if backend == "gemma" else _ask_gemini)(img, question)
    value, boxes = _parse(text)
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    W, H = img.size
    ev = [Evidence(file=path, label=backend,
                   bbox=[b[0] / 1000 * W * back, b[1] / 1000 * H * back, b[2] / 1000 * W * back, b[3] / 1000 * H * back])
          for b in boxes]
    return Answer(value=value, unit=None, method="vlm", confidence=0.4, cost_eur=round(cost, 6), evidence=ev,
                  trace=[f"{backend} read the whole sheet ({W}x{H} px)", f"raw: {text.strip()[:200]}"])
