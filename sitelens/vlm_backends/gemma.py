"""Local Gemma backend (transformers, needs a CUDA GPU)."""
from __future__ import annotations

import os
import time
from functools import lru_cache

GPU_EUR_PER_H = float(os.environ.get("SITELENS_GPU_EUR_H", "2.14"))   # Verda A100 on-demand


def model() -> str:
    return os.environ.get("SITELENS_GEMMA", "/root/models/gemma-4-12B-it")


@lru_cache(maxsize=1)
def _load():
    import torch
    from transformers import AutoModelForImageTextToText, AutoProcessor
    proc = AutoProcessor.from_pretrained(model())
    m = AutoModelForImageTextToText.from_pretrained(model(), torch_dtype=torch.bfloat16, device_map="cuda")
    return proc, m


def ask(img, prompt: str) -> tuple[str, float]:
    import torch
    proc, m = _load()
    msgs = [{"role": "user", "content": [{"type": "image", "image": img}, {"type": "text", "text": prompt}]}]
    inp = proc.apply_chat_template(msgs, add_generation_prompt=True, tokenize=True, return_dict=True,
                                   return_tensors="pt").to(m.device)
    t = time.time()
    with torch.inference_mode():
        out = m.generate(**inp, max_new_tokens=400, do_sample=False)
    text = proc.decode(out[0][inp["input_ids"].shape[-1]:], skip_special_tokens=True)
    return text, (time.time() - t) / 3600 * GPU_EUR_PER_H
