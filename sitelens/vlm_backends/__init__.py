"""VLM backends by name. Each one: ask(img, prompt) -> (text, cost_eur); model() -> model id for traces.

  gemini          Gemini API (GEMINI_API_KEY, SITELENS_GEMINI_MODEL)
  gemma           local Gemma via transformers on a GPU (SITELENS_GEMMA)
  gemma-api       Gemma 4 on the Gemini API, free tier (GEMINI_API_KEY, SITELENS_GEMMA_API_MODEL)
  nemotron        hosted NVIDIA NIM, OpenAI-compatible (NVIDIA_API_KEY)
  nemotron-verda  Verda's Junction endpoint, same model (VERDA_INFERENCE_KEY)
  vllm            any OpenAI-compatible server, e.g. vLLM on Verda (SITELENS_VLM_URL)
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


NEMOTRON_EUR_PER_MTOK = (0.19, 0.46)  # NIM serverless $0.20 / $0.50


def _nemotron_extra() -> dict:
    return {"chat_template_kwargs": {"enable_thinking": os.environ.get("SITELENS_VLM_THINKING") == "1"}}


BACKENDS: dict[str, Backend] = {
    "gemini": Backend("gemini", gemini.ask, gemini.model),
    "gemma": Backend("gemma", gemma.ask, gemma.model),
    "gemma-api": Backend("gemma-api", gemini.gemma_ask, gemini.gemma_model),
    "nemotron": Backend("nemotron", *openai_compat.make(
        url="https://integrate.api.nvidia.com/v1", model="nvidia/nemotron-3.5-super-vl-120b-a12b",
        key_env="NVIDIA_API_KEY", eur_per_mtok=NEMOTRON_EUR_PER_MTOK, extra=_nemotron_extra)),
    # same model (NVFP4, vLLM on a B300) hosted by Verda for Junction; priced at NIM list for comparison
    "nemotron-verda": Backend("nemotron-verda", *openai_compat.make(
        url="https://containers.datacrunch.io/nemotron-3-5-super-vl-b300/v1", model="nemotron-3.5-super-vl",
        key_env="VERDA_INFERENCE_KEY", eur_per_mtok=NEMOTRON_EUR_PER_MTOK, extra=_nemotron_extra)),
    "vllm": Backend("vllm", *openai_compat.make(url=None, model=None, key_env="SITELENS_VLM_KEY", eur_per_mtok=None)),
}


def get(name: str) -> Backend:
    try:
        return BACKENDS[name]
    except KeyError:
        raise ValueError(f"unknown VLM backend {name!r}; choose one of: {', '.join(BACKENDS)}") from None
