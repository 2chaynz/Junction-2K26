# Decision

Updated Sat 14 Nov 2026. Main challenge: **Stoa, Make Blueprints Talk** (`context/challenges/stoa.md`).

- **Challenge:** Stoa, Make Blueprints Talk. Tech tracks: Gemini, Gemma, Verda, Nemotron, ElevenLabs. Intel is out (no stations left).
- **Side project:** Bahn Express Spread (owner: 2chaynz, agents, OR-Tools). Separate submission.
- **Idea:** SiteLens. Details: `ideas/ccolver.md`.
- **One-line pitch:** Snap a photo of a structure, get the matching drawings, ask questions with cited answers and Eurocode/ASTM references, and estimate quantities in 2D design changes.
- **Demo flow:**
  1. Judge photographs our 3D-printed scale model.
  2. Photogrammetry model → matched drawings, highlighted, with confidence and reasoning.
  3. Judge asks a question → answer with the drawing region highlighted, Eurocode/ASTM reference, cost per answer; optional spoken answer.
  4. Swap in revision B of the model/drawing → estimated quantity change with source dimensions.
- **In scope:**
  - Drawing Q&A with region highlights and citations (core, build first).
  - Photo → drawing matching with confidence + reasoning.
  - Model picker: Gemma (default, deployed), Gemini (validation), Nemotron.
  - 3D-printed demo model + printed drawings.
- **Stretch:** quantities of 2D design changes; ElevenLabs voice; scope-of-work / T&M flags.
- **Out of scope:** full Eurocode/ASTM texts (paywalled: clause numbers + public summaries only); production photogrammetry of real sites.
- **Why this one:**
  - Fits our skills (data/backend) and lets us use hardware (printer, camera) as a data source.
  - Stoa told us 2D-only design changes are a real gap: they can't estimate quantities in them yet.
  - Hits all four judging criteria; Gemma default keeps inference cost low.

## Constraints
- Goal: win a partner challenge. Skills: embedded, data/backend. Hardware preferred as a data source, but check availability first.
- Submit a challenge on the platform by Fri 23:59. It can be changed later.
- Hardware is shared and limited. Confirm a device is ours before committing.
