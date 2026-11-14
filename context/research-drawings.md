# Research: Stoa vs VLM Run, and why AI misreads drawings

Read Sat 14 Nov 2026. Sources at the bottom.

## Stoa (stoabuild.com)
- App for site and project engineers. Answers from the project's own drawings, specs, contracts, schedule (P6), QA/safety records, minutes.
- Read-only sync from M-Files, ACC, SharePoint, Dalux, Congrid. Keeps existing permissions.
- Features:
  - Chat; every sentence cites document + page.
  - Click a wall type or door tag on a drawing → governing detail or clause opens beside it.
  - Revision diff between sheet versions ("partition on grid E removed, rooms 205 and 206 merged").
  - Findings → RFIs, reports, tasks, reusable skills.
- Claims: 2–8 h/week saved per engineer, 40% faster problem → decision, €4B+ project value, 20+ Nordic sites. Live in 2 days, EU-hosted, never trains on data.
- Its UI labels drawing changes "Read off the document by a model. It can be wrong." Hence the challenge's focus on verifiable answers.

## VLM Run (vlm.run/solutions/construction)
- Developer API: drawings, schedules, specs → typed JSON.
- Parses sheet regions separately (grid bubbles, room tags, dimensions, keynotes, title block); links detail callouts to target sheets.
- Schedules → one record per mark, even across sheets.
- Spec clauses cited with page + bbox. Set index by sheet number and revision.
- Bring your own schema. SOC 2 Type II, VPC deploy, zero data retention.

## How they differ
| | Stoa | VLM Run |
|---|---|---|
| Layer | Finished app | Developer API |
| Output | Cited answers, tasks, RFIs | JSON |
| Scope | Whole project incl. contracts, schedule, change feed | Drawings, schedules, specs |
| Integration | Done for you (Nordic/EU systems) | Build it yourself |
| Change tracking | Core feature | Revision marks only |

- VLM Run sells the parser; Stoa sells the workflow on top.
- Both mostly read drawings with a VLM. Neither publishes accuracy numbers.

## AECV-Bench (arXiv 2601.04819)
- 120 floor plans: count doors, windows, bedrooms, toilets. 192 questions on 21 drawings: OCR, spatial, comparison, counting.
- Counting mean exact-match: Gemini 3 Pro 0.51, GPT-5.2 0.49, Claude Opus 4.5 0.42.
- Doors/windows: 0.09–0.39 exact-match, 15–70% MAPE. Bedrooms/toilets: 0.76–0.91 (labelled rooms).
- QA: OCR up to 0.95, spatial 0.6–0.78, counting weakest.
- Conclusion: good document assistants, no real drawing literacy. Symbols are the bottleneck, not text.

## Why models fail on drawings
1. **Symbols, not text, carry meaning.** Doors and windows are line art with varying conventions. Models fall back on text: labelled rooms ~0.9, symbols ~0.3 (AECV-Bench).
2. **Too few pixels per symbol.** Whole sheet squeezed into a fixed token budget; doubling the budget enlarges symbols only ~41%. High-res whole-sheet can still fail (0.89 → 0.33 F1). Overlapping zoomed tiles reach 0.95–0.97 F1; careless tiling double-counts at edges (arXiv 2610.09313).
3. **Relations rebuilt wrong.** Failures: relations 47%, combining evidence 23%, wrong object 17%, misreading local text/symbols 12%. Best model 52.6% (LED-BENCH).
4. **Multi-step / cross-sheet reasoning breaks.** Lose place tracing grids, misread callouts, stop at first plausible link. 81% simple reading → 56% expert reasoning (DrawingVQA).
5. **Missing drafting knowledge, prior bias.** Weld symbols, acronyms, projection rules misread; answer from what a typical detail looks like (DrawingVQA, MechVQA).
6. **Dense annotation hides key values.** Fine-tuned 4B model (SFT + RL) beat Gemini 3 Pro by 7.6 pts (MechVQA).
7. **Wrong input.** Pixels discard vector geometry and IFC data that hold exact answers.

## For SiteLens
- Research recommends our design: vector/IFC first, symbol detector, VLM on crops only, show uncertainty, human in the loop.
- Our numbers match: Gemma whole-sheet 0% Swiss areas, 55% CubiCasa vs ours 100% and 85%.
- Exact geometry from vector/IFC is our answer to "won't be obsoleted by next year's models". Cite these papers in the pitch.

## Sources
- https://stoabuild.com/
- https://vlm.run/solutions/construction
- AECV-Bench: https://arxiv.org/pdf/2601.04819v1
- Why VLMs Miss Small Objects: https://arxiv.org/html/2610.09313v1
- LED-BENCH: https://arxiv.org/html/2610.19571v1
- DrawingVQA: https://arxiv.org/html/2607.15418v1
- MechVQA: https://arxiv.org/html/2605.30794v2
