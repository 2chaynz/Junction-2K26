# SiteLens UI: decisions (2chaynz, grill session, Sat 14 Nov)

Proposal for T8. Team to confirm the ticket split.

## Goal
- Must-win moment: judge asks → drawing auto-zooms to numbered red-pen evidence → verified in seconds.
- UI carries 2 of Stoa's 4 criteria (verifiable reasoning, creativity).

## Style: Blueprint + redline
- Cyanotype blue, white line art, grid paper. Every panel framed as a drawing title block (sheet no., scale, rev).
- Evidence = hand-drawn red-pen circles, animated, numbered, margin notes ("2 WC").
- Structure inspired by VLM Run: document panels with header (file · `p.1 / 3` · status tag), numbered cards, dark code block with the real `Answer` JSON.
- Path colours as in `docs/architecture.svg`: BIM violet, vector orange, detector red, VLM grey.

## Stack
- Vite + React + TypeScript in `web/`; three.js + web-ifc for 3D.
- FastAPI `sitelens/server.py` serves the built app + API (`CONTRACT.md`). One command: `python -m sitelens.server` → :8000.
- All assets bundled locally (venue Wi-Fi may fail).

## Home: 3D build-up (wow)
- Model: `ifc_models/bsc-esplanades_1807-ep-ar-v18.ifc` (12 MB, 7 storeys, 846 walls, 285 spaces, has a 2D plan + et/en questions).
- ~4 s: storeys rise as white wireframe → solidify → slow orbit → question box "Ask your drawings anything."
- Real data, not generated video. Higgsfield only for the pitch video intro.

## Tabs
1. **Ask**
   - Thumbnail picker grouped by source.
   - 3–5 suggested question chips per drawing from `questions.jsonl` → answer card shows "Stoa's answer: 13 · ✓ match".
   - Free text (any language). "Surprise me" = random drawing + question.
   - Auto-zoom to evidence; red circles; hover list ↔ circle; trace as numbered engineer's notes.
   - Title-block footer: PATH · COST · CONF · TIME · CHECKED ✓ STOA stamp.
   - IFC answers: elements glow in 3D + same elements on the 2D plan.
2. **How it works**
   - Interactive architecture diagram: click a path → real example step by step (drawing → extraction → tool → answer) with cost/time.
   - 4 criterion cards (01 Accuracy, 02 Verifiable, 03 Creativity, 04 Cost), each with proof + link.
   - "Why not just ask a big model?": whole-sheet guessing vs reading the drawing like a database; next year's model only replaces the last-resort crop reader.
3. **Benchmark**
   - Accuracy vs €/answer (log) chart: ours top-left vs Gemma/Gemini whole-sheet.
   - Table by source × type: accuracy, €/answer, time, from `eval/results`.
   - Bars grow on scroll/hover (CSS only, no live run).
   - "Where we fail" list → opens the case in Ask. Label: "dev split, drawings never seen in training".

## Proposed split (to confirm with the team)
| Ticket | Content |
|---|---|
| UI-1 (T8) | Server + app shell (theme, tabs) + Ask tab |
| UI-2 | 3D build-up + IFC highlight |
| UI-3 | How it works |
| UI-4 | Benchmark tab |

Human (2chaynz): art direction every 1–2 h, headline copy, pick demo examples for the video, merge PRs.

## API additions needed (CONTRACT PR)
- `GET /api/ifc?path=` raw IFC bytes for web-ifc.
- `GET /api/benchmark` summary from `eval/results`.
