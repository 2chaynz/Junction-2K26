# Contract

Interfaces between parts. Lock early; tell the team before changing.

Core = drawing Q&A with evidence, measured by `eval/score.py` on Stoa's answer key. Everything plugs into
`sitelens.router.answer(path, question) -> Answer`.

## Parts
| Part | Owner | Runs on | Talks to via |
|---|---|---|---|
| `sitelens/router.py`: tries paths cheapest-first | T1 | laptop / server | Python call |
| `sitelens/paths/ifc.py`: IFC models (ifcopenshell) | ifc ticket | laptop | path module |
| `sitelens/paths/vector.py`: vector PDF/DXF text + geometry | vector ticket | laptop | path module |
| `sitelens/paths/detector.py`: raster symbol detector + room-label OCR | detector ticket | laptop CPU (inference) | path module + `models/` weights |
| `sitelens/paths/vlm.py`: VLM fallback (Gemini / Gemma) | vlm ticket | API / Verda | path module |
| `train/`: detector training | detector ticket | Verda GPU | writes weights |
| `eval/`: scorer + dev split | T1 | laptop | CLI, results jsonl |
| `web/`: demo UI | ui ticket | browser | HTTP API below |

## Interfaces

### Answer (every path returns this)
- **Between:** paths → router → scorer / API
- **Format:** `sitelens/answer.py`. `value=None` means "can't answer"; the router then tries the next path.
```json
{"value": 15.9, "unit": "m2", "method": "vector", "confidence": 0.95, "cost_eur": 0.0,
 "evidence": [{"file": "data/swiss_dwellings/x.pdf", "page": 0, "bbox": [412.1, 300.5, 440.0, 309.2],
               "label": "room 2.09 · 15.90 m²", "kind": "text", "polygon": null, "ifc_guid": null}],
 "trace": ["found room 2.09 'Zimmer'", "area label 15.90 m²", "vector path, 0.03s"]}
```
- `kind: "ifc"` evidence has `bbox: []` and an `ifc_guid` instead (no 2D drawing); the UI shows it as a model element.
- `bbox` units: PDF points for PDFs (PyMuPDF page coords), pixels for images. `kind`: box | polygon | text | ifc.
- Counts: one Evidence per counted object, so the UI can show every hit.
- `candidates` (optional list of Evidence, T42): objects seen but NOT counted (detections just under the confidence cut, label `near-miss <class> <conf>`). Draw dashed; a human can promote them in review mode. Never part of `value`.

### Path module
- **Between:** router → `sitelens/paths/<name>.py`
- **Format:** `answer(path: str, question: str) -> Answer | None`. `path` is dataset-relative (`data/<source>/<file>`), exactly as in `questions.jsonl`. Return `None` fast if the file/question isn't yours. Path modules don't import each other.

### Scorer
- **Between:** any solver → `eval/score.py`
- **Format:** `python -m eval.score [--solver module:fn] [--split dev|all] [--source s] [--type t] [--limit n] [--name x]`. Prints accuracy / evidence / €-per-answer per source × type; writes `eval/results/<name>.jsonl` (gitignored).
- **Rules:** report numbers on `--split dev`. Never train or tune prompts on dev drawings (`eval/split.py`). Anything trained on outside data (public CubiCasa5K) must exclude every drawing in the Stoa dataset (`train/exclude.py`).

### Demo API (for the UI)
- **Between:** `web/` → `sitelens/server.py` (ui ticket)
- **Transport:** HTTP JSON, `localhost:8000`
```
POST /api/ask   {"path": "data/…", "question": "…"}  → Answer
POST /api/ask/stream  (same body)                     → NDJSON: {"step": {...}} lines live, then {"answer": Answer} (or {"error"})
POST /api/export {"path", "question", "answer"?: Answer} → application/pdf: the sheet with the evidence as PDF annotations (Bluebeam/Acrobat comments); 400 for IFC
GET  /api/file?path=data/…&page=0                     → PNG render of the drawing page (same coords as bbox, 72 dpi for PDFs)
GET  /api/drawings                                    → [{"path", "source", "view", "questions": [...]}]
GET  /api/ifc?path=data/…ifc                          → raw IFC bytes (3D viewer)
GET  /api/random                                      → {"path", "question"} from questions.jsonl
GET  /api/takeoff?path=data/…[&format=csv]           → {"path", "source": ifc|schedule|detector|none, "rows": [{category, type, size, count, levels, by_level, length_m, area_m2, volume_m3, evidence}], "notes"}; csv = download
```
- `/api/ask` adds `time_s`, `view` (file the UI shows; IFC → its rendered plan) and, when the question is Stoa's, `check: {expected, unit, match}`.
- No path answers → `/api/ask` adds `tried: [path names]`. With `GEMINI_API_KEY` set, a question that isn't about the drawing gets `method: "general"`, text `value`, no evidence, no `check`.
- Step: `{"kind": try|skip|fail|found|trace|general|check, "path": "ifc"|"", "text": "plain words", "t": seconds}`. `trace` steps are the winning path's trace lines. Python: `router.answer(path, q, on_step)`.
- `/api/file` takes optional `scale` (default 1 = bbox coords).
- Run: `STOA_DATA=… python -m sitelens.server` (serves `web/dist` after `cd web && npm ci && npm run build`). Dev: `npm run dev` in `web/` proxies `/api` to :8000.

## Hardware
| Device | Pins / ports | Power | Notes |
|---|---|---|---|
| Verda GPU instance | SSH | prepaid credit (€200, no card, no auto top-up) | training only; stop it when idle |

## Config / env vars
| Name | Used by | Notes |
|---|---|---|
| `STOA_DATA` | everything | unzipped dataset folder (contains `questions.jsonl`). Keep it outside the repo |
| `SITELENS_VLM` | vlm path | backend: `gemini` \| `gemma` \| `gemma-api` \| `nemotron` \| `nemotron-verda` \| `vllm`. Unset = path off. Per call: `vlm.use_backend(name)` |
| `GEMINI_API_KEY` | vlm path (gemini) | share directly, never commit. Model: `SITELENS_GEMINI_MODEL` (default `gemini-3.8-flash`) |
| `SITELENS_GEMMA` | vlm path (gemma) | local Gemma weights dir, CUDA GPU. `gemma-api`: Gemma 4 on the Gemini API (`SITELENS_GEMMA_API_MODEL`, default `gemma-4-31b-it`) |
| `VERDA_INFERENCE_KEY` | vlm path (nemotron-verda) | Verda's Junction Nemotron 3.5 Super VL endpoint |
| `NVIDIA_API_KEY` | vlm path (nemotron) | build.nvidia.com key. Default model `nvidia/nemotron-3.5-super-vl-120b-a12b`; `SITELENS_VLM_THINKING=1` turns reasoning on |
| `SITELENS_VLM_URL` / `_MODEL` / `_KEY` | vlm path (nemotron, vllm) | OpenAI-compatible server, e.g. `http://localhost:8001/v1`. Required for `vllm`; model defaults to the served one |
| `SITELENS_VLM_EUR_MTOK` | vlm path (nemotron, vllm) | `"in,out"` EUR per Mtok. Unset on `vllm` → cost = wall time × `SITELENS_GPU_EUR_H` |
| `SITELENS_MODELS` | detector path | folder with detector weights (default `models/`, gitignored) |
