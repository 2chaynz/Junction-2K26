# Log

Newest first. One line each: `date time · name · what`.

- 2026-11-14 13:23 · Asif · T16 PR #28: auto heartbeat hook never pushed on Windows (CC kills detached hook children); now inline, ~4s once per 5 min. Merge #28 or only manual beats work
- 2026-11-14 13:14 · Asif · T16 PR #27: heartbeats (beats branch, 5-min hook, stale >15m), board 'Needs a human' lane, worker loop /work + planner role in AGENTS.md
- 2026-11-14 13:03 · ccolver · ccolver: T15 PR #26 revision diff: text by position+content, geometry by render diff (vector paths re-segment between exports). A-201 addendum shows stonewood -> phenolic panels. Needs /api/diff route from T8 owner
- 2026-11-14 12:57 · johanseneuson · johanseneuson: started 8x RTX PRO 6000 (kind-tree-rings-fin-03, EUR 20.5/h, only GPUs free) for ~1h: retrain detector with fixed labels (sink variants, WC rooms) + YOLO11l comparison. Will delete right after. Old A100 is gone; its disk OS-qxzWscsd (FIN-01) still exists
- 2026-11-14 12:48 · ccolver · ccolver: Stoa said revision comparison is still unsolved in their product. Added T15 revision diff: 40 opening_design sheets have multiple vector PDF issues; A-201 permit->Addendum 1 shows polycarbonate->phenolic panel change. Not scored, for creativity/pitch
- 2026-11-14 12:34 · johanseneuson · johanseneuson: PR #24 T6 detector path: dev cubicasa 75.5% (was 69.6%; bathrooms 62->88% via WC=bath space w/ toilet no shower, sinks 42->60% via kitchens), dev overall 86.7% (1606/1856), EUR 0.00001/ans. Weights models/detector.pt (40 MB, not in git) - ask johanseneuson. A100 idle since 03:30, deleting
- 2026-11-14 12:19 · ccolver · ccolver: research summary context/research-drawings.md: Stoa vs VLM Run, 5 papers on why VLMs misread drawings (symbols, pixels/token, relations, cross-sheet). Backs our vector/IFC-first design for the pitch
- 2026-11-14 12:08 · ccolver · ccolver: added 27 internal problem questions to ideas/ccolver-outreach.md: current ops, inputs/outputs, why AI fails on drawings (resolution, scale, counting, cross-refs, schedules, grounding), company use
- 2026-11-14 12:06 · 2chaynz · PLAN in DECISION.md (PR #20): architecture stays, UI (T8) is priority, 4 timed steps so we always have a demo. Please read + claim T10/T11/T12/T2
- 2026-11-14 11:49 · 2chaynz · competitors review (context/competitors.md): we lead on cost + likely raster, lag 3-4 pts on Swiss/IFC, 0% opening_design. Added tickets: comparable scores, schedule reader, two-method agreement
- 2026-11-14 11:36 · 2chaynz · 2chaynz: Spread round 'Sat 09:00' played with dispatch.py (+supply decline): rank 55/181, EUR 24.2k over 5 weeks, all ranked. Same 4 seeds: dispatch_asif.py EUR 35.7k vs dispatch.py EUR 20.8k -> use Asif's bot for next rounds + final
- 2026-11-14 11:30 · ccolver · ccolver: problem-space outreach questions for Stoa/site users (ideas/ccolver-outreach.md): users, features they'd use, what a good doc summary needs
- 2026-11-14 11:13 · 2chaynz · UI design locked in grill session (ideas/2chaynz-ui.md): blueprint+redline, 3D Esplanades build-up, Ask/How/Benchmark tabs. T8 split to confirm with team
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
