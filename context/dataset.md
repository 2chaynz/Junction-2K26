# Stoa dataset (preview, profiled)

- Download: see `challenges/stoa.md`. Not in the repo (0.7 GB). Unzip outside the repo.
- Full set: ~14,000 drawings, ~30 languages, ~120,000 questions. Preview: 924 files, 7,990 questions.
- `questions.jsonl`: `{"path","question","answer","unit","type"}`. Answers are known → we can score ourselves.
- Scoring (dataset README): counts exact; area/length/volume within 2%; text free-form.
- Same file name, other extension = same drawing in another format. `ifc_models/<model>_<level>.pdf` is rendered from `<model>.ifc`.
- About half the questions are non-English twins of English ones (fi, et, de, da, fr, it).

## Questions by source (preview)
| Source | Qs | Files | Format | Types | What it takes |
|---|---|---|---|---|---|
| cubicasa5k | 4270 | 241 | PNG (raster, Finnish) | count | Symbol counts (windows, doors, WC, sinks, showers) + room labels (MH, KH, SAUNA). Needs CV + OCR |
| swiss_dwellings | 2358 | 65 | PDF (vector) + DXF + PNG | count, area | PDF text has room name, number, m². DXF layers: DOOR, WINDOW, FIXTURE, ROOM_TEXT, ROOM_OUTLINE, WALL, UNIT_OUTLINE → exact counts, no model |
| ifc_models | 1049 | 6 | IFC + PDF/SVG plans | area, count, volume, length | Room areas, wall lengths, slab volumes straight from IFC (ifcopenshell) |
| ifc_bench | 249 | 5 | IFC | text | Free-form summaries (building type, spaces per level). IFC facts + LLM to phrase |
| opening_design | 64 | 3 | PDF sheets (US, imperial) | count, text, area | Door/finish schedule tables (e.g. A-801 Sports Complex). Table extraction |

## Types
count 6076 · area 1599 · text 265 · volume 34 · length 16. Units: count, m2, m3, m, ft2.

## Example questions
- "How many windows are shown on this floor plan?" (cubicasa, PNG)
- "What is the net floor area of apartment A in m², summing all its rooms except balconies…" (swiss, PDF)
- "Wie lang sind alle Wände im Geschoss „Dachgeschoss" zusammen, in Metern?" (ifc_models)
- "On sheet A-801 of the Xcel Sports Complex drawings, what is the width of door 121.A?" → `5'-10 3/8"`

## Licences
Per source in `data/<source>/LICENSE.md`. cubicasa5k is CC BY-NC-SA. Keep credits when showing drawings.
