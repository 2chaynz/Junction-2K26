"""Gemini API backend (also serves hosted Gemma)."""
from __future__ import annotations

import base64
import io
import json
import os
import urllib.request


def make(model_env: str, default: str, eur_per_mtok: tuple[float, float]):
    def model() -> str:
        return os.environ.get(model_env, default)

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
        r = json.load(urllib.request.urlopen(req, timeout=300))
        u = r.get("usageMetadata", {})
        cost = (u.get("promptTokenCount", 0) * eur_per_mtok[0]
                + (u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0)) * eur_per_mtok[1]) / 1e6
        # Gemma returns its reasoning as a leading part with "thought": true
        parts = r["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts if not p.get("thought")), cost

    return ask, model


# gemini-3.8-flash $0.75 / $3.75 incl. thinking, until 2026-12-31; 2.5-flash is closed to new keys
ask, model = make("SITELENS_GEMINI_MODEL", "gemini-3.8-flash", (0.70, 3.50))
# Gemma on the Gemini API is free tier only (no paid price exists)
gemma_ask, gemma_model = make("SITELENS_GEMMA_API_MODEL", "gemma-4-31b-it", (0.0, 0.0))
