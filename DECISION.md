# Decision

Updated Sat 14 Nov 2026. Main challenge: **Stoa, Make Blueprints Talk** (`context/challenges/stoa.md`). Dataset: `context/dataset.md`.

- **Challenge:** Stoa, Make Blueprints Talk.
- **Tech tracks:** Gemini + Gemma (VLM path, T7), Verda (detector training, T5). ElevenLabs only if the voice stretch ships.
- **Side project:** Bahn Express Spread (owner: 2chaynz). Separate submission.
- **Idea:** Sindri: answers questions about construction drawings and BIM, shows where the answer comes from, and shows the cost per answer.
- **One-line pitch:** The one tool every project role opens the drawings in: ask, measure, take off, compare revisions, with the exact spot highlighted, for a fraction of a cent.
- **Pitch angle:** one integration tool for the whole project team, not another point solution. Today they juggle a PDF viewer, Bluebeam, a BIM viewer, takeoff software, Excel and emails to the designer. Sindri reads every format (vector PDF, scans, DXF, IFC, schedules) and does the jobs in one place.

| Role | Job they do today | Sindri feature |
|---|---|---|
| Project engineer | look up facts, chase RFIs | ask in plain language, answer + highlighted evidence |
| Site manager / superintendent | check what's built vs. drawn, latest revision | what changed between issues, plan vs schedule cross-check, 3D floors |
| Project manager | quantify change orders, sign off | revision quantities, confidence + "please check" flags |
| Estimator / QS | takeoffs, measuring | takeoff list with CSV download, measure tool (area/length, scale), Bluebeam PDF markup export |

- Pitch order: pain (5 tools, hours a week) → one tool → demo one question per role → accuracy + €/answer vs. Gemini.
- **Why the change:** Stoa grades on 7,990 questions with known answers (counts, areas, lengths, volumes, text). None involve photos or building standards.
- **Demo flow:**
  1. Load a real Stoa drawing or IFC model.
  2. Ask a question (any language) → answer + highlighted boxes on the plan + steps + €/answer.
  3. Results table: our accuracy and cost vs. Gemini on the full sheet, on Stoa's questions.
- **In scope (core, most of the team):**
  - Question answering scored against `questions.jsonl` (exact counts, ±2% areas, lengths and volumes).
  - Cheapest reader first: vector PDF, DXF, IFC, schedules (T3, T4); fine-tuned detector + OCR for scans (T5, T6); VLM on crops only as a last resort and as the frontier baseline (T7).
  - Evidence on every answer: sheet + highlighted region + steps.
  - Cost per answer shown (T8).
- **Stretch (one person max, only after the core works):** quantities of 2D-only design changes (gap Stoa named); photo/3D-print demo; ElevenLabs voice.
- **Out of scope:** Eurocode/ASTM references; scope-of-work analysis; production photogrammetry.

## Plan (Sat 14 Nov, read this first)

**Architecture: keep it.** Other teams converged on the same design (cheapest method first, geometry for vector, detector for scans). Our scores are at or near the top. We improve parts; we don't redesign. Diagram: `docs/architecture.svg`.

| Part | Status | Next |
|---|---|---|
| Router | done | nothing |
| IFC (T4) | 96.6% | small fixes → 99% |
| Vector / Swiss (T3) | 96.4% | small fixes (showers) → 99% |
| Detector / scans (T5, T6) | ~85% on 40 dev Qs, training | finish training |
| Schedule tables / opening_design (T11) | missing, 0% | new path, open ground for every team |
| Two methods agree (T12) | missing | optional add-on |
| **UI (T8)** | **not started** | **most urgent: carries verification + creativity (50% of Stoa's score)** |

Competitors and scores: `context/competitors.md`. UI design: `ideas/2chaynz-ui.md`.

**Rule: build in steps; always have something we can show.** If time runs out, we ship what works.

| Step | When | Result |
|---|---|---|
| 1. Works end to end | now → 15:00 | pick drawing, ask, see answer + boxes on the plan (ugly is fine). Already submittable |
| 2. Looks good | 15:00 → 19:00 | blueprint + red-pen style, answer card, Stoa ✓ stamp. In parallel: real scores (T10) |
| 3. Impresses | 19:00 → 22:00 | 3D build-up, How it works, Benchmark tabs. Not done by 22:00 → dropped |
| 4. Sells | 22:00 → Sun 09:00 | 2-min video, pitch deck PDF, README (T2) |

**Who:** johanseneuson: detector (T5, T6). 2chaynz: UI (T8) + art direction + demo examples for the video. Open to claim: T11 schedules, T10 scores, T12 agreement, Swiss/IFC fixes, T2 pitch.

## Constraints
- Goal: win a partner challenge.
- Hardware is shared and limited. Confirm a device is ours before committing.

## Archive: previous plan (superseded Sat 14 Nov, reference only)
- Pitch: snap a photo of a structure, get matching drawings, ask questions with cited answers and Eurocode/ASTM references, estimate quantities in 2D design changes.
- Demo: judge photographs a 3D-printed scale model → photogrammetry → matched drawings with confidence → Q&A with Eurocode/ASTM reference → revision B quantity change.
- In scope then: drawing Q&A, photo → drawing matching, model picker (Gemma/Gemini/Nemotron), 3D-printed model.
- Stretch then: 2D design-change quantities, ElevenLabs, scope-of-work/T&M flags.
- Tech tracks then: Gemini, Gemma, Verda, Nemotron, ElevenLabs.
