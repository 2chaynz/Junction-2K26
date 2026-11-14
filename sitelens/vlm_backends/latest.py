"""Is a newer model of the same family out? Lets a model upgrade be one click (UI) or one command (CLI).

Only backends whose provider lists its models can be checked: gemini (gemini-<v>-flash|pro) and
gemma-api (gemma-<v>-<n>b-it). The family is read from the current model, so a flash stays a flash.
"""
from __future__ import annotations

import os
import re
import time

from ._http import request_json

# backend -> (env var holding the model, default model); the defaults live in gemini.py
MODEL_ENV = {"gemini": "SITELENS_GEMINI_MODEL", "gemma-api": "SITELENS_GEMMA_API_MODEL"}
CACHE_S = 3600
_cache: dict = {"t": 0.0, "models": []}


def _version(s: str) -> tuple[int, ...]:
    return tuple(int(x) for x in s.split("."))


def _family(model: str) -> tuple[re.Pattern, callable] | None:
    """Regex for same-family models and a sort key (newest, then biggest, last)."""
    if m := re.fullmatch(r"gemini-([\d.]+)-(flash|pro|flash-lite)", model):
        return re.compile(rf"gemini-([\d.]+)-{m.group(2)}"), lambda g: (_version(g[0]),)
    if re.fullmatch(r"gemma-\d+-\d+b-it", model):
        # dense sizes only: "26b-a4b" style MoE ids don't match
        return re.compile(r"gemma-(\d+)-(\d+)b-it"), lambda g: (int(g[0]), int(g[1]))
    return None


def list_models(refresh: bool = False) -> list[str]:
    """Model ids the Gemini API key can call with generateContent. Cached 1 h; [] without a key."""
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return []
    if refresh or time.time() - _cache["t"] > CACHE_S:
        r = request_json("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
                         {"x-goog-api-key": key})
        _cache["models"] = [m["name"].removeprefix("models/") for m in r.get("models", [])
                            if "generateContent" in m.get("supportedGenerationMethods", [])]
        _cache["t"] = time.time()
    return _cache["models"]


def current(backend: str | None = None) -> tuple[str | None, str | None]:
    """(backend name, model id) the VLM path uses right now."""
    from . import get
    backend = backend or os.environ.get("SITELENS_VLM")
    if not backend:
        return None, None
    return backend, get(backend).model()


def status(backend: str | None = None, refresh: bool = False) -> dict:
    """{backend, current, latest, available, env}. latest is set only when it beats current."""
    backend, model = current(backend)
    out = {"backend": backend, "current": model, "latest": None, "available": [], "env": MODEL_ENV.get(backend)}
    fam = _family(model) if model and backend in MODEL_ENV else None
    if not fam:
        return out
    pattern, key = fam
    hits = sorted((key(m.groups()), name) for name in list_models(refresh)
                  if (m := pattern.fullmatch(name)))
    out["available"] = [name for _, name in reversed(hits)]
    if hits and hits[-1][0] > key(pattern.fullmatch(model).groups()):
        out["latest"] = hits[-1][1]
    return out


def use(model: str, backend: str | None = None) -> dict:
    """Switch the model for this process. Raises ValueError if the backend can't switch or the id is unknown."""
    backend, _ = current(backend)
    env = MODEL_ENV.get(backend)
    if not env:
        raise ValueError(f"backend {backend!r} has no switchable model")
    models = list_models()
    if models and model not in models:
        raise ValueError(f"{model!r} is not available on this key")
    os.environ[env] = model
    return status(backend)
