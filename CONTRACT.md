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
GET  /api/file?path=data/…&page=0                     → PNG render of the drawing page (same coords as bbox, 72 dpi for PDFs)
GET  /api/drawings                                    → [{"path", "source", "questions": [...]}]
```

## Hardware
| Device | Pins / ports | Power | Notes |
|---|---|---|---|
| Verda GPU instance | SSH | prepaid credit (€200, no card, no auto top-up) | training only; stop it when idle |

## Config / env vars
| Name | Used by | Notes |
|---|---|---|
| `STOA_DATA` | everything | unzipped dataset folder (contains `questions.jsonl`). Keep it outside the repo |
| `GEMINI_API_KEY` | vlm path | share directly, never commit |
| `SITELENS_MODELS` | detector path | folder with detector weights (default `models/`, gitignored) |
