"""Gemini API backend."""
from __future__ import annotations

import base64
import io
import json
import os
import urllib.request

EUR_PER_MTOK = (0.70, 3.50)  # gemini-3.8-flash $0.75 / $3.75 incl. thinking, until 2026-12-31


def model() -> str:
    return os.environ.get("SITELENS_GEMINI_MODEL", "gemini-3.8-flash")  # 2.5-flash is closed to new keys


def ask(img, prompt: str) -> tuple[str, float]:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    body = {"contents": [{"parts": [{"inline_data": {"mime_type": "image/png",
                                                     "data": base64.b64encode(buf.getvalue()).decode()}},
                                    {"text": prompt}]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}}
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model()}:generateContent",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json",
                                                 "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
    r = json.load(urllib.request.urlopen(req, timeout=120))
    u = r.get("usageMetadata", {})
    cost = (u.get("promptTokenCount", 0) * EUR_PER_MTOK[0]
            + (u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0)) * EUR_PER_MTOK[1]) / 1e6
    return r["candidates"][0]["content"]["parts"][0]["text"], cost
