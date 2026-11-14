"""Client for any OpenAI-style /v1/chat/completions with image input (NVIDIA NIM, vLLM, ...).

SITELENS_VLM_URL / SITELENS_VLM_MODEL / SITELENS_VLM_KEY override the backend's defaults.
Cost: tokens x SITELENS_VLM_EUR_MTOK ("in,out") if set or the backend has a price,
else wall time x SITELENS_GPU_EUR_H (self-hosted GPU).
"""
from __future__ import annotations

import base64
import io
import os
import time
from functools import lru_cache

from ._http import request_json


def _post(url: str, key: str | None, body: dict | None = None) -> dict:
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if key:
        h["Authorization"] = f"Bearer {key}"
    return request_json(url, h, body)


@lru_cache(maxsize=8)
def _served_model(base: str, key: str | None) -> str:
    return _post(f"{base}/models", key)["data"][0]["id"]  # vLLM serves one model


def make(url: str | None, model: str | None, key_env: str, eur_per_mtok: tuple[float, float] | None,
         extra=lambda: {}):
    def base() -> str:
        b = os.environ.get("SITELENS_VLM_URL") or url
        if not b:
            raise ValueError("set SITELENS_VLM_URL, e.g. http://localhost:8001/v1")
        return b.rstrip("/")

    def key() -> str | None:
        return os.environ.get("SITELENS_VLM_KEY") or os.environ.get(key_env)

    def model_id() -> str:
        return os.environ.get("SITELENS_VLM_MODEL") or model or _served_model(base(), key())

    def ask(img, prompt: str) -> tuple[str, float]:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        data = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
        body = {"model": model_id(), "temperature": 0, "max_tokens": 2048,
                "messages": [{"role": "user", "content": [{"type": "image_url", "image_url": {"url": data}},
                                                          {"type": "text", "text": prompt}]}],
                **extra()}
        t = time.time()
        r = _post(f"{base()}/chat/completions", key(), body)
        price = os.environ.get("SITELENS_VLM_EUR_MTOK")
        p = tuple(float(x) for x in price.split(",")) if price else eur_per_mtok
        u = r.get("usage") or {}
        if p:
            cost = (u.get("prompt_tokens", 0) * p[0] + u.get("completion_tokens", 0) * p[1]) / 1e6
        else:
            cost = (time.time() - t) / 3600 * float(os.environ.get("SITELENS_GPU_EUR_H", "2.14"))
        return r["choices"][0]["message"].get("content") or "", cost

    return ask, model_id
