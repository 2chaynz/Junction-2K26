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
- `table` (optional): `{"title", "columns", "rows"}` for listing answers ("doors in room X and their sizes", `method: "takeoff"`). Row i is cited by `evidence[i]`; the UI shows it under the answer with a CSV download.
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
GET  /api/original?path=data/?                        ? original file for a drawing listed in the dataset
GET  /api/file?path=data/…&page=0                     → PNG render of the drawing page (same coords as bbox, 72 dpi for PDFs)
GET  /api/file?path=…&clip=x0,y0,x1,y1&pad=0.5&scale=2 → PNG crop around one evidence bbox (same coords as bbox; pad × box size of margin). For the proof strip (T43)
GET  /api/drawings                                    → [{"path", "source", "view", "questions": [...]}]
GET  /api/ifc?path=data/…ifc                          → raw IFC bytes (3D viewer)
GET  /api/demo/revisions                               -> Vitoria IFC revision changes, described below
GET  /api/random                                      → {"path", "question"} from questions.jsonl
GET  /api/measure?path=…&page=0                       → {scale, candidates, ask, options, known, project, calibrations, measurements, auto}
POST /api/measure {"path","kind":length|area|count,"points":[[x,y]…],"label"} → stored takeoff (uses the scale nearest the shape)
DELETE /api/measure?path=…&id=…                       → {"deleted"}
POST /api/measure/calibrate {"path","points","length":"12'-6\"" | "3.5 m" | "15.9 m2","known_id"?} → stored scale
POST /api/measure/scale {"path","scale_id"}           → pick a candidate (answer to `ask`); no scale_id = reset
GET  /api/takeoff?path=data/…[&format=csv]           → {"path", "source": ifc|schedule|drawing|none, "rows": [{category, type, size, count, levels, by_level, length_m, area_m2, volume_m3, evidence, dimension_evidence, reason?, specifications?}], "notes"}; csv = download
POST /api/translate {"texts": [...]}                  → {"texts": [...]}: English, same order (strings the browser reads from IFC itself)
GET  /api/vlm                                         → {"backend", "current", "latest", "available", "models", "backends": [{name, ready, needs, model}]}: latest = newer model of the same family, else null; models = every switchable model of the backend
POST /api/vlm   {"backend"?: "…" | "", "model"?: "…"} → same shape; switches backend ("" = off) and/or model for this server process (no .env write); 400 if unknown or not configured
POST /api/projects {"name"}                           → {id, name, created, key: "upload/<id>"}: empty imported project (T93)
PUT  /api/projects/{id}/files?name=<file>  (raw body) → {added: [paths], skipped: [{name, reason}]}; a .zip is unpacked
DELETE /api/projects/{id}                             → {"deleted"}
GET  /api/sessions                                    → {project: {"sessions", "updated"}} for the project list
GET  /api/sessions?project=…                          → [{id, title, created, updated, questions, paths, last: {question, value, unit}}], newest first
GET  /api/session?project=…&id=…                      → {id, project, title?, created, updated, msgs: [Msg]}
PUT  /api/session {"project", "id", "msgs", "title"?} → summary; saves the Ask conversation (pending msgs dropped)
DELETE /api/session?project=…&id=…                    → {"deleted"}
```
- `/api/ifc` sends a content ETag. Matching `If-None-Match` returns 304.
- `/api/demo/revisions` requires the full Vitoria dataset and returns `[{guid, kind, name, level, change, dimensions}]`.
  - `change` is `added` or `removed` based on IFC GlobalId presence.
  - `dimensions` is the local geometry bounding box size `[x, y, z]` in metres, or `null` when unavailable.
  - Edits to shared IDs are outside the comparison.
- `/api/ask` and `/api/ask/stream` take an optional `region: {"page", "bbox", "points": [[x, y]...], "r"}` (T49): a highlighter stroke on the shown sheet (`view`), same units as `bbox`, `r` = brush radius. The answer is about that spot only (`sitelens/region.py`): `method` `region`, `<path>+region` (counts kept inside the mark), `ocr` (scans: room/area label read in the marked crop at every rotation, €0) or `vlm` (crop). First evidence is the mark itself, label `your mark`. No clarify, no `check`.
- `/api/ask` adds `time_s`, `view` (file the UI shows; IFC → its rendered plan) and, when the question is Stoa's, `check: {expected, unit, match}`.
- No path answers → `/api/ask` adds `tried: [path names]`. With `GEMINI_API_KEY` set, a question that isn't about the drawing gets `method: "general"`, text `value`, no evidence, no `check`.
- T75 tiers (`sitelens/pipeline.py`): optional body `history: [{question, answer}]` (earlier turns, oldest first) and `related: [paths]` (project sheets, nearest first). Follow-ups are rewritten to a standalone question (rules, then Gemini). Then: this drawing (exact readers, VLM held back) → related sheets (exact readers; `view` = that sheet, `source_path`) → VLM on this drawing → Gemini + Google Search (`method: "web"`, or `"general"` without web sources). Stoa's own questions: tier 1 only, VLM included (= scorer).
- T75 answer fields: `tier` (drawing | project | vlm | web | none), `followup: {question, standalone}`, `sources: [{n, tier, label, ev?, file?, page?, bbox?, ifc_guid?, url?, title?}]` (drawing sources first, `[n]` = `evidence[n-1]`), `reasoning: [{tier, text, src: [n]}]`. Step kinds add `tier` and `followup`.
- Vague question (not one of Stoa's) → `method: "clarify"`, `value: null`, `clarify: {"ask": "Which floor?", "options": [full reformulated questions]}`, no evidence. UI shows the options; picking one asks it. Rules first, then Gemini (`sitelens/clarify.py`).
- Step: `{"kind": understand|try|skip|fail|found|trace|general|check|clarify, "path": "ifc"|"", "text": "plain words", "t": seconds}`. `trace` steps are the winning path's trace lines. Python: `router.answer(path, q, on_step)`.
- `/api/drawings` includes `model`, the related IFC path or null, and `title` (IFC plan sheets: storey in English, e.g. `04 · Floor 4`) or null.
- English only (T83, `sitelens/translate.py`): display strings in ask, stream steps, takeoff, measure and revisions are translated after the Stoa `check`. Ids, paths, GUIDs, `method`, `unit` stay as they are. Quoted names keep the original: `'Zimmer' (room)`; text `value` becomes `orig · English`. Dictionary first; Gemini (cached in `.sitelens/translate.json`) only for takeoff type/storey names and `/api/translate`. `SITELENS_TRANSLATE=dict` turns the model off.
- Projects (T61): the UI groups drawings into projects (`web/src/workspace.ts`: `bim/<building>`, `set/<sheet set>`, `portfolio/swiss`, `archive/cubicasa`) with typed subfolders. Sessions are stored per project key in `.sitelens/sessions/` (next to `SITELENS_STORE`); `Msg` is `web/src/types.ts`.
- `/api/file` takes optional `scale` (default 1 = bbox coords).
- Imports (T93, `sitelens/uploads.py`): files land in `<STOA_DATA>/data/uploads/<id>/`, flattened, so paths are `data/uploads/<id>/<file>` and every path module reads them unchanged. Kept: PDF, PNG, JPG, IFC, DXF (DXF is stored, not listed). `/api/drawings` lists them with `source: "uploads"`, `questions: []` and `project: {key, name, created}`. `SITELENS_UPLOADS=0` turns imports off; `SITELENS_UPLOAD_MB` caps one file (default 500).
- Takeoff: evidence marks counted objects or schedule entries. dimension_evidence cites plan tags, dimensions and scale references. Drawing rows explain their basis and unknowns in reason; specifications contains cited schedule fields. CSV includes Specifications and Basis columns.
- Measure (`sitelens/measure.py`): points in bbox units. Scale = `m_per_unit` + `source` (dxf | sibling | note | bar | sheet_size | manual) + `refs: [{file, page, bbox, text, kind}]` (file may be another sheet of the project). `scale: null` → `ask` + `options`. Stored per drawing in `SITELENS_STORE`.
- Run: `STOA_DATA=… python -m sitelens.server` (serves `web/dist` after `cd web && npm ci && npm run build`). Dev: `npm run dev` in `web/` proxies `/api` to :8000.

## Hardware
| Device | Pins / ports | Power | Notes |
|---|---|---|---|
| Verda GPU instance | SSH | prepaid credit (€200, no card, no auto top-up) | training only; stop it when idle |

## Config / env vars
| Name | Used by | Notes |
|---|---|---|
| `STOA_DATA` | everything | unzipped dataset folder (contains `questions.jsonl`). Keep it outside the repo |
| `SITELENS_VLM` | vlm path | backend: `gemini` \| `gemma` \| `gemma-api` \| `nemotron` \| `nemotron-verda` \| `vllm`. Unset = path off. Per call: `vlm.use_backend(name)`. Newer model check / switch: `python -m sitelens.vlm_backends [--upgrade \| --use MODEL]` (gemini, gemma-api) |
| `GEMINI_API_KEY` | vlm path (gemini) | share directly, never commit. Model: `SITELENS_GEMINI_MODEL` (default `gemini-3.8-flash`) |
| `SITELENS_GEMMA` | vlm path (gemma) | local Gemma weights dir, CUDA GPU. `gemma-api`: Gemma 4 on the Gemini API (`SITELENS_GEMMA_API_MODEL`, default `gemma-4-31b-it`) |
| `VERDA_INFERENCE_KEY` | vlm path (nemotron-verda) | Verda's Junction Nemotron 3.5 Super VL endpoint |
| `NVIDIA_API_KEY` | vlm path (nemotron) | build.nvidia.com key. Default model `nvidia/nemotron-3.5-super-vl-120b-a12b`; `SITELENS_VLM_THINKING=1` turns reasoning on |
| `SITELENS_VLM_URL` / `_MODEL` / `_KEY` | vlm path (nemotron, vllm) | OpenAI-compatible server, e.g. `http://localhost:8001/v1`. Required for `vllm`; model defaults to the served one |
| `SITELENS_VLM_EUR_MTOK` | vlm path (nemotron, vllm) | `"in,out"` EUR per Mtok. Unset on `vllm` → cost = wall time × `SITELENS_GPU_EUR_H` |
| `SITELENS_STORE` | measure | calibrations + manual takeoffs, one JSON per drawing (default `.sitelens/measure/`, self-gitignored) |
| `SITELENS_MODELS` | detector path | folder with detector weights (default `models/`, gitignored) |
