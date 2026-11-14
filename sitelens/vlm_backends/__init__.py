"""VLM backends by name. Each one: ask(img, prompt) -> (text, cost_eur); model() -> model id for traces.

  gemini    Gemini API (GEMINI_API_KEY, SITELENS_GEMINI_MODEL)
  gemma     local Gemma via transformers on a GPU (SITELENS_GEMMA)
  nemotron  hosted NVIDIA NIM, OpenAI-compatible (NVIDIA_API_KEY)
  vllm      any OpenAI-compatible server, e.g. vLLM on Verda (SITELENS_VLM_URL)
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Callable

from . import gemini, gemma, openai_compat


@dataclass(frozen=True)
class Backend:
    name: str
    ask: Callable[..., tuple[str, float]]
    model: Callable[[], str]


BACKENDS: dict[str, Backend] = {
    "gemini": Backend("gemini", gemini.ask, gemini.model),
    "gemma": Backend("gemma", gemma.ask, gemma.model),
    "nemotron": Backend("nemotron", *openai_compat.make(
        url="https://integrate.api.nvidia.com/v1", model="nvidia/nemotron-3.5-super-vl-120b-a12b",
        key_env="NVIDIA_API_KEY", eur_per_mtok=(0.19, 0.46),  # NIM serverless $0.20 / $0.50
        extra=lambda: {"chat_template_kwargs": {"enable_thinking": os.environ.get("SITELENS_VLM_THINKING") == "1"}})),
    "vllm": Backend("vllm", *openai_compat.make(url=None, model=None, key_env="SITELENS_VLM_KEY", eur_per_mtok=None)),
}


def get(name: str) -> Backend:
    try:
        return BACKENDS[name]
    except KeyError:
        raise ValueError(f"unknown VLM backend {name!r}; choose one of: {', '.join(BACKENDS)}") from None
