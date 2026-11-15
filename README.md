# Sindri

The one tool every project role opens the drawings in: ask, measure, take off, compare revisions, with the exact spot highlighted, for a fraction of a cent.

Junction 2026 · Stoa challenge "Make Blueprints Talk".

## The problem
- A site team juggles a PDF viewer, Bluebeam, a BIM viewer, takeoff software, Excel and emails to the designer. Hours a week go into looking things up and measuring.
- General AI chat reads a drawing as a picture. It guesses counts and areas and cannot show where the answer came from.

## What it does
Ask in any language. You get the answer, the evidence highlighted on the sheet, the steps taken, and the cost of that answer in €.

| Role | Sindri feature |
|---|---|
| Project engineer | ask in plain language, answer + highlighted evidence |
| Site manager | what changed between issues, plan vs schedule cross-check, 3D floors |
| Project manager | revision quantities, confidence + "please check" flags |
| Estimator / QS | takeoff list with CSV download, measure tool (area, length, scale), Bluebeam PDF markup export |

Formats: vector PDF, DXF, IFC, scanned plans (PNG/JPEG), door and finish schedules.

## How it works
![Sindri architecture](docs/architecture.svg)

- **Cheapest reader first.** A router tries exact readers before anything else: IFC models (ifcopenshell), vector PDF and DXF text + geometry, schedule tables.
- **Scans:** a symbol detector trained on floor plans + room-label OCR. Runs on a laptop CPU. One box per counted object.
- **VLM only as fallback** (Gemini), on crops, when no exact reader can answer.
- **Evidence on every answer:** sheet, region and steps, so a person can check it in seconds.
- **Why newer frontier models won't make this obsolete:** the answer is often in the file. Reading geometry and text exactly beats guessing from pixels, and small local models keep the cost near zero.

## Results
Held-out numbers (`eval/report.md`), Stoa's own questions and answer key, preview dataset, dev split.

| Set | Accuracy | €/answer |
|---|---|---|
| All sources | **91.9%** | 0.00001 (rules) |
| Scanned plans (CubiCasa5K) | 83.6% | 0.00001 |
| Swiss vector plans | 97.4% | 0 |
| BIM / IFC | 100% | 0 |
| Schedules (opening_design) | 94.1% | ~0.004 (Gemini) |

Same 40 dev questions per source vs Gemini 3.8 Flash on the full sheet (`web/src/benchData.ts`):

| Source | Sindri | Gemini 3.8 Flash |
|---|---|---|
| Swiss vector plans | 100% · €0 | 60% · €0.021 |
| Scanned plans | 95% · €0.00001 | 85% · €0.0045 |

## Run it
Python 3.11+, Node 18+.
```
node scripts/dev.mjs                     # sets up venv + web build, serves http://localhost:8000
```
- Dataset: unzip Stoa's dataset into `../junction-data/` (outside the repo). `node scripts/dev.mjs --check` lists what is missing.
- `GEMINI_API_KEY` in `.env`: schedules and the VLM fallback need it.
- Score on the answer key: `python -m eval.score --split dev`

## Team
- **johanseneuson:** detector + scan path, vector, IFC and VLM paths, schedules, two-methods check, review mode, proof strip, Bluebeam export, demo video, deploy.
- **2chaynz:** UI and art direction: live reasoning, clarify, IFC 3D view, draw-to-ask, How it works, Benchmark page, intro, architecture diagram.
- **ccolver:** scores, room OCR, VLM crops, revision diff + quantities, takeoff, measure, plan vs schedule check, cited follow-ups, AECV-Bench.
- **Asif:** projects workspace and app shell (picker, start screen, Overview, sessions), VLM backends + picker, IFC and schedule fixes, honest headline numbers, one-command start, agent tooling.

## Credits
Drawings and models come from Stoa's Junction dataset. Each source keeps its own licence and credit in `data/<source>/LICENSE.md` inside the dataset:
- CubiCasa5K, © 2019 CubiCasa, CC BY-NC-SA 4.0 (Kalervo et al., SCIA 2019).
- Swiss Dwellings v3.0.0 (Archilyse AG), CC BY 4.0.
- Open IFC models and IFC-Bench v2 (Sylvain Hellin, TU Munich), per-model licences.
- OpeningDesign drawings, per-file licences.
- `web/public/turntables/` are renders of those IFC models and keep their licences. Partner logos belong to their owners.

## License
Code: MIT, see [LICENSE](LICENSE). Dataset files and third-party assets keep their own licences (above).

How we built it (agent workflow, setup, board, deploy): [docs/workflow.md](docs/workflow.md).
