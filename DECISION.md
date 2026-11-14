# Decision

Updated Sat 14 Nov 2026. Main challenge: **Stoa, Make Blueprints Talk** (`context/challenges/stoa.md`). Dataset: `context/dataset.md`.

- **Challenge:** Stoa, Make Blueprints Talk.
- **Tech tracks:** Gemini + Gemma (VLM path, T7), Verda (detector training, T5). ElevenLabs only if the voice stretch ships.
- **Side project:** Bahn Express Spread (owner: 2chaynz). Separate submission.
- **Idea:** SiteLens: answers questions about construction drawings and BIM, shows where the answer comes from, and shows the cost per answer.
- **One-line pitch:** Ask your drawings a question; get the right answer with the exact spot highlighted, for a fraction of a cent.
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

## Constraints
- Goal: win a partner challenge.
- Hardware is shared and limited. Confirm a device is ours before committing.

## Archive: previous plan (superseded Sat 14 Nov, reference only)
- Pitch: snap a photo of a structure, get matching drawings, ask questions with cited answers and Eurocode/ASTM references, estimate quantities in 2D design changes.
- Demo: judge photographs a 3D-printed scale model → photogrammetry → matched drawings with confidence → Q&A with Eurocode/ASTM reference → revision B quantity change.
- In scope then: drawing Q&A, photo → drawing matching, model picker (Gemma/Gemini/Nemotron), 3D-printed model.
- Stretch then: 2D design-change quantities, ElevenLabs, scope-of-work/T&M flags.
- Tech tracks then: Gemini, Gemma, Verda, Nemotron, ElevenLabs.
