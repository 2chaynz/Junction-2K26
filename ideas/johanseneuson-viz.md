# Visualization ideas — johanseneuson (Sat 14 Nov, for the 25% "visualize reasoning so a human can verify")

Judging line: *"How well the solution visualizes its reasoning so a human can verify the answer"*. Today we show marks
on the plan + a trace. The gap: the human still has to *do* the checking. Ideas that make checking a 5-second action.
Already in flight (not repeated here): UI v3, IFC 3D (T34), live reasoning (T36/T37), revision diff (T31), takeoff (T32).

## Top 4 (recommended, in order)

1. **Review mode for uncertain answers (human-in-the-loop).** T12 already flags ~18% of raster counts as "please
   check" (those are ~50% right). Click *Review* → the plan zooms to each mark in turn; the user hits ✓ / ✗ (or clicks
   to add a missed one); the count updates live and the answer card turns "verified by you". Also show *near misses*
   (boxes just under the cut) as dashed grey so the user can promote them in one click. This *is* verification, not a
   picture of it. Data needed: per-box confidence (have it), near-miss boxes (cheap: same `detect()` cache).

2. **Proof strip + arithmetic receipt.** Under every answer: a row of small crops of each evidence region (no
   panning needed to verify), numbered like the marks. For sums: `15.61 + 12.05 + 16.78 = 44.44 m²` where hovering a
   term lights its room on the plan and its crop. Counts: crops in reading order, numbered 1..N. Backend has the
   bboxes; crops = `/api/file` with a clip box.

3. **Us vs a frontier model, same drawing, side by side.** Benchmark tab today is a table. Make it a split view on one
   held-out drawing: left Gemini (whole sheet) with the boxes *it* claims, right Sindri. Typical result: Gemini says
   "4 toilets", boxes point at sinks; we say 2 with exact marks. Shows verifiability *and* accuracy *and* cost
   (€0.004 vs €0.00001) in one picture. Precompute for ~10 demo drawings (T20 gives the VLM backend).

4. **Export the redline as a real PDF markup.** "Download markup" writes the evidence as PDF annotations (rectangles +
   numbered comments + the answer/trace as a note) with PyMuPDF. Opens in Bluebeam / Acrobat as editable comments —
   what site engineers actually pass around. Construction-native, ~1h backend, one button in the UI.

## More (if time)
- **Layer toggles on vector sheets:** overlay the DXF geometry we used (rooms, doors, windows, fixtures) on the PDF,
  one toggle per layer; shows the answer comes from the CAD, not from pixels.
- **Confidence styling everywhere:** solid red = certain, dashed amber = check me. One legend line.
- **Language chip:** "asked in Finnish · answered from the drawing" — the dataset is multilingual, show we don't care.
- **Cost meter per answer** vs whole-sheet VLM; running total for the session ("38 answers, €0.004 total").
- **Schedule ↔ plan link:** click a door row in the schedule, the door lights up on the plan (T33 cross-check data).
- **"Why not" for declines:** when a path skips, say why in one line (T37 stream already has the steps).

## Pitch / video
- 2-min story: site engineer asks 3 questions in 3 languages on 3 drawing types → each answer verified in seconds
  (review mode on one uncertain count) → side-by-side with a frontier model → "exported to Bluebeam". End on the
  held-out benchmark table with cost.
