# Log

Newest first. One line each: `date time · name · what`.

- 2026-11-14 04:22 · johanseneuson · johanseneuson (A100): PR #17 T7 baseline, same 40 dev Qs/source: cubicasa ours 85% vs Gemma 4 12B whole-sheet 55%; swiss ours 100% vs 50% (Gemma areas 0%); ours ~EUR 0.00001/answer vs Gemma EUR 0.003-0.005. opening_design: both 0%, no path yet (schedule tables) - open gap
- 2026-11-14 04:03 · johanseneuson · johanseneuson (on A100): PR #13 T4 IFC = 96.6% of all 1049 ifc_models Qs (was 74.5%), no wrong answers, EUR 0. Dev ifc: area/length/volume 100%, count 97.7%. Dev overall now 53.4% before detector. Detector (T6, epoch~7 weights) = 62.7% dev cubicasa; saunas via bench clusters 89% (was 47%), floors via storey boxes 90%
- 2026-11-14 03:27 · johanseneuson · johanseneuson: PR #9 (T3, stacked on #7): Swiss plans from DXF geometry = 96.4% of all 2358 Swiss Qs, EUR 0, evidence boxes on the PDF. Dev overall 12.6% -> 44.9%. Please merge #7 then #9. CubiCasa5K->YOLO dataset built (preview ids excluded); waiting on a Verda payment method to train
- 2026-11-14 03:24 · johanseneuson · johanseneuson: Swiss counts from DXF geometry, no model, all preview Qs: doors 130/130 (5-pt DOOR polylines), windows 130/130 (4-pt WINDOW), toilets 130/130 + washbasins 130/130 (48-pt ellipse without/with drain circle), bathtubs 112/112 (69-pt polyline), showers 32/42, room labels via ROOM_TEXT. Corrects my earlier 'arcs != doors': count leaves, not arcs. Going into T3 vector path
- 2026-11-14 03:22 · 2chaynz · decision PR #8: refocus SiteLens on benchmark Q&A (T3-T8); photo/3D-print/voice stretch, Eurocode out. Needs team OK + merge
- 2026-11-14 03:13 · johanseneuson · johanseneuson: Verda refuses to deploy compute on the JUNCTION-2026 coupon unless a payment method is on file (even with credit + auto top-up off). A100 80GB = EUR 2.14/h. Plan: T5 detector on CubiCasa5K, preview images excluded
- 2026-11-14 02:59 · johanseneuson · johanseneuson: measured (no model): IFC room areas 782/804 from psets; swiss DOOR arcs != door count (74/265), so DXF counts need real detection; cubicasa raster = 53% of Qs. Literature + 5 ideas incl. RL-trained Gemma 4 with tools (ideas/johanseneuson.md)
- 2026-11-14 02:09 · 2chaynz · dataset profiled (context/dataset.md): 7990 quantity-takeoff Qs with answers; 76% counts, 20% areas; no photos, no standards questions
- 2026-11-14 00:35 · ccolver · ccolver: add 3D-printed scale model + printed drawings as live demo for photo->drawing matching (ideas/ccolver.md)
- 2026-11-14 00:33 · ccolver · ccolver: Stoa feedback: they already detect design changes; gap = quantities of quick 2D-only changes. Open Q: 3D quantities from 2D drawings without manual takeoff (ideas/ccolver.md)
- 2026-11-13 23:38 · ccolver · ccolver: draft submission idea SiteLens (Stoa main; Gemini, Gemma, Verda, Nemotron, ElevenLabs) in ideas/ccolver.md
- 2026-11-13 23:15 · Asif · decision: main challenge = Stoa Make Blueprints Talk (brief in context/challenges/stoa.md). Next: fill DECISION.md, CONTRACT.md, plan tickets
- 2026-11-13 22:31 · 2chaynz · 2chaynz triage done (ideas/2chaynz.md): main = Aalto humanoid; liked Stoa, Arduino Green, Cala map, Beyond the Clinic; stack Verda, Gemini/Gemma or Nemotron, ElevenLabs
- 2026-11-13 21:35 · Asif · decision: Intel out (all robot arms taken). Main challenge undecided. Spread stays as side project. Candidates: Valio, Rokoko, Stoa, Hostinger, Aalto humanoid
- 2026-11-13 21:28 · Asif · decision: main challenge = Intel Physical AI (Ignite Next x Intel). Side: Bahn Spread (2chaynz). Next: confirm station, fill DECISION.md/CONTRACT.md, plan tickets
- 2026-11-13 20:56 · 2chaynz · 2chaynz: confirmed teams can submit multiple projects; 2chaynz runs Bahn Spread as side project with agents (OR-Tools)
- 2026-11-13 20:20 · ccolver · challenge Q/A: medium open, prefer HW as data source; shortlist Intel, Rokoko, Valio Aimo, Bahn Express; goal = win partner challenge; skills embedded + data/backend
- 2026-11-13 18:03 · 2chaynz · context: added event.md and judging.md from guidebook
- 2026-11-13 · setup · repo infrastructure for agents in place
