# SiteLens: 2-minute screenplay (runs 118 s, hard cap 120 s)

Inspired by the Higgsfield "Claude finishes da Vinci's flying machine" reel: one prompt on screen, the AI visibly
working, a **red verdict card when it fails**, then it fixes itself and wins. Ours: a frontier AI fails on a drawing,
SiteLens answers and **proves** it. Real UI footage only (T2 rule). Captions burned in; must work muted.

## Devices borrowed from the reel
1. **Challenge hook**: "We asked an AI to…" in the first sentence.
2. **Real screen, typed prompt**: the question is typed live in the UI, no mock-ups.
3. **Verdict stamps**: the reel's red NOT AIRWORTHY becomes a red `✗ truth: 12` on the frontier model, a green `✓ Stoa: 12` on ours.
4. **Honest failure beat**: SiteLens flags its own uncertain answers ("please check") instead of hiding them.
5. **Counters, not adjectives**: € and seconds tick on screen; numbers come from results files.

## Timeline (sums to 118 s)
| Time | Len | Scene | Visual (real footage) | On-screen text | Voice-over |
|---|---|---|---|---|---|
| 0:00–0:10 | 10 | **Hook: the frontier AI fails** | Swiss plan `site2292_bldg3379_floor15050.pdf` full screen. Question typed: "How many doors are drawn on this floor plan?" A chat bubble answers **9** (frontier model, whole sheet). Red stamp slams in: `✗ truth: 12`. | "We asked a frontier AI to count the doors." → "9" → "✗ truth: 12" | "We asked a frontier AI to count the doors on this floor plan. It said nine. It's twelve. And nothing told us it was wrong." |
| 0:10–0:20 | 10 | **Title** | Logo SiteLens + tagline over the plan fading to the app. (Optional AI b-roll ≤3 s: a building rising.) | "SiteLens · Make blueprints talk" / "Every answer proves itself" | "So we built SiteLens. Ask anything about a drawing. Every answer shows exactly where it came from, in seconds." |
| 0:20–0:40 | 20 | **Same question, with proof** | Same plan in SiteLens. Type the question; steps stream in the chat ("read from the CAD geometry"); answer **12**; twelve red marks pop onto the doors one by one; stamp `✓ Stoa: 12`; footer counter `vector · €0.000 · 0.1 s`; slow zoom on one mark. | "12" · "✓ Stoa: 12" · "€0.000 · 0.1 s" · "no AI used" | "Same plan, same question. Twelve. Every door is marked on the drawing, so you can check it at a glance. This one came straight from the CAD geometry. No AI, no guess, zero euros." |
| 0:40–0:58 | 18 | **Scans, any language, honest about doubt** | Scanned Finnish plan (CubiCasa). Type in Finnish: "Montako vessanpönttöä on?" → 1, toilet boxed. Then free text: "Does this flat have a balcony?" → yes, balcony boxed. Then a count the detector is unsure of: amber **please check** tag. | "Any language" · "please check" · "Confident = right 9 in 10" | "Scanned plans work too: a detector we trained reads them. Ask in Finnish, or in plain words. And when it isn't sure, it says so. Confident answers are right nine times in ten." |
| 0:58–1:05 | 7 | **Estimator** | Takeoff tab → list of doors/windows → click CSV download. | card: "ESTIMATOR" | "Estimators get a takeoff list and a spreadsheet in one click." |
| 1:05–1:13 | 8 | **Site manager** | "What changed" view on a sheet with two issues, changes highlighted; then plan-vs-schedule conflict on A-801. | card: "SITE MANAGER" | "Site managers see what changed between two issues, and where the schedule disagrees with the plan." |
| 1:13–1:20 | 7 | **Project manager** | Open the exported markup PDF in Bluebeam/Acrobat: red numbered marks as editable comments, comment panel open. | card: "PROJECT MANAGER" | "Project managers export the proof as a markup that opens in Bluebeam." |
| 1:20–1:28 | 8 | **Engineer** | Draw a circle on the sheet with the highlighter, ask "what is this?"; then IFC model in 3D with the answer's elements lit. | card: "ENGINEER" | "Engineers circle a spot and ask. Or walk the building in 3D." |
| 1:28–1:48 | 20 | **The numbers** | Benchmark tab / chart: bars per source on held-out drawings counting up; then split screen on the same 11 drawings: SiteLens `11/11 · €0.003` vs frontier model `9/11 · €0.074`. | "~90% on drawings never trained on" (confirm) · "11/11 · €0.003" vs "9/11 · €0.074" | "We tested on drawings the system never trained on. About nine in ten answers right, for a fraction of a cent. On eleven of the same drawings, SiteLens got all eleven for three-tenths of a cent. The frontier model got nine, for seven cents." |
| 1:48–1:58 | 10 | **Close** | Plan with all marks lit, slow pull-back, logo. | "Exact where the file allows. A detector for scans. A language model only as a last resort." | "Exact where the file allows it. A trained detector for scans. A language model only as a last resort. SiteLens: every answer proves itself." |
| 1:58 | 0 | **Hard stop** | Cut to black on the last word. Nothing after 1:58. | | |

Voice-over: 235 words over 118 s, about 2 words/second with the stamp and zoom pauses, so there is room to breathe.

## Sound
Low pulse under the hook. A hard stop on the red stamp. Light tick for each mark popping (twelve ticks in 0:20–0:40).
A rising tone while the counters count up in the numbers scene. Music drops out for the last line.

## Capture list (before Sat 22:00; 1080p, zoom the UI, no cursor jitter)
1. Hook: the plan + a typed question; **fake nothing**: take the frontier model's real answer from `web/public/versus.json` (row `site2292_bldg3379_floor15050`: ours 12, frontier 9) and replay it as a chat bubble.
2. Swiss doors answer in the live UI (marks + footer). Record twice, keep the cleaner take.
3. Finnish toilet question, the balcony question, and one "please check" answer (any window count that shows the tag).
4. Takeoff tab + CSV download; What-changed view; A-801 cross-check; Draw-to-ask; IFC 3D.
5. Bluebeam/Acrobat opening an exported markup. **There is no Download-markup button in the UI yet**: export with `POST /api/export` (see PR #54) and film the PDF opening, or ask the UI owner for the button.
6. Numbers scene: render from `eval/report.md` and `web/public/versus.json`, not typed by hand.

## Numbers: where each comes from (confirm before render)
| On screen | Source | Status |
|---|---|---|
| frontier 9 vs truth 12 on `site2292_bldg3379_floor15050` | `web/public/versus.json` | measured |
| 11/11 · €0.003 vs 9/11 · €0.074 | `web/public/versus.json` summary | measured, 11 held-out questions |
| "confident answers right 9 in 10" | PR #43: 598/670 = 89% (cubicasa dev) | measured |
| "~90% on drawings never trained on" | preview dev split, 1,856 questions | **re-run on final main + final detector, then update** |

## Do not say or show
- Whole-building or multi-floor questions: the dataset has no multi-floor buildings.
- A full-dataset accuracy for scanned plans as "never seen": the detector trained on most of those plans. Use the preview dev split.
- Anything that implies the Gemini key or the dataset is public.
- If a number changes after the final model, change the caption and the voice-over line together.

## If time runs short (cut order)
Drop the Engineer vignette (-8 s) and trim the numbers scene to the 11/11 vs 9/11 split screen (-6 s): 104 s.
