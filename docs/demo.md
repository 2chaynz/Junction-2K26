# Final demo runbook

7 projects from the full Junction dataset, each showing something a PDF viewer, Bluebeam or a BIM viewer can't. Every answer is €0, offline (no API key needed), with marks on the sheet or model.

## Setup (once, ~5 min)
- Full dataset, not the preview: Vitoria revisions and the whole CTR / Sports Complex sheet sets need it.
- Detector weights in `models/detector.pt` (or `SITELENS_MODELS`).
- Start:
```
STOA_DATA=<path>/junction-dataset node scripts/dev.mjs --demo
```
  - Manual: `SITELENS_DEMO=1 STOA_DATA=… python -m sitelens.server`.
  - `--demo` = only the demo projects on Home, in demo order. Without it the full dataset lists ~6,000 drawings.
- Pre-flight, right before presenting (also warms caches: the CTR cross-check indexes 66 sheets, ~20 s cold):
```
python scripts/demo_check.py
```
  Must end `ALL PASS` (22 questions + Vitoria revisions).
- Browser: 1440×900 or larger, zoom 100 %. Skip the intro once (top right).

## Flow (~3 min)
Every featured sheet has role-tagged chips under the chat. Click them; don't type.

| # | Project (Home card) | Role | Do | Point at |
|---|---|---|---|---|
| 1 | **Vitoria** (`?demo`) | Site manager | open `http://localhost:8000/?demo`, let it play | 565 elements added/removed between baseline and renovation IFC, in 3D, per floor |
| 2 | **Vitoria** → P2 | Estimator | chip "How many doors…P2" | 16 doors lit in 3D, Stoa ✓, €0 |
| 3 | **Cannery Trail Residences** → A700 | Site manager | chip "Do the doors on the plans match the door schedule?" | 4 conflicts across 66 sheets. Click [2]: jumps to the floor plan, door 103.E circled |
| 4 | same | Estimator | chip "unit entry doors (type U01)" | 71, read from the schedule row |
| 5 | **Sports Complex** (`?demo=sheets`) | Project manager | open `http://localhost:8000/?demo=sheets` | permit → current set: 6 doors removed, +19 ft², marks on the sheet |
| 6 | **Sports Complex** → A-801 | Estimator | chip "List the doors…with their sizes", then Download CSV | takeoff table of 38 doors, each row cited on the schedule |
| 7 | **Esplanades** → 2.korrus | Project engineer | chip in Estonian | answer in English, room lit on the plan; switch to 3D / Building |
| 8 | **Medical-Dental Clinic** | Estimator | chip "How many doors…" | 254 doors, every one marked in the model; 5 discipline models in one project |
| 9 | **Swiss Dwellings** → site418 | Estimator | chip "Zimmer" area, then Measure | 81.16 m² from 6 rooms; scale read from the DXF |
| 10 | **CubiCasa** → colorful-11485 | Estimator | chip doors, then Highlight a room | scan: detector boxes; near-misses dashed for review |
| 11 | Benchmark tab | PM | open | accuracy + €/answer vs Gemini |

## If something goes wrong
- A chip answers wrong or slow → `demo_check.py` shows which; skip that chip.
- Cross-sheet jump shows a blank sheet for a few seconds: big sheet rendering, wait.
- `?demo` card greyed out: revisions still computing (~10 s first time).
- Lost state → `http://localhost:8000/` (All projects).
