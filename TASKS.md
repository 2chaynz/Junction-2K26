# Tasks

Change only with `node scripts/status.mjs` (it pushes straight to main). Details in `tickets/Tn.md`.
Status: todo · doing · blocked · review · done. Area: short tag (hw, fw, app, ai, pitch…).

| Ticket | Area | Needs | Owner | Status | Branch | Device | Question |
|---|---|---|---|---|---|---|---|
| T1 Project scaffold + CONTRACT.md + Run section | setup |  | johanseneuson | done | johanseneuson/T1-scaffold |  |  |
| T2 Demo video, README, pitch | pitch | T1 |  | todo |  |  |  |
| T3 Vector path: Swiss + opening_design | ai | T1 | johanseneuson | done | johanseneuson/T3-vector-fixes |  |  |
| T4 IFC path: counts, lengths, volumes, text | ai | T1 | johanseneuson | done | johanseneuson/T4-ifc |  |  |
| T5 Train symbol detector on CubiCasa5K | train | T1 | johanseneuson | done | johanseneuson/T5-detector |  |  |
| T6 Detector path: raster counts with boxes | ai | T1 | johanseneuson | done | johanseneuson/T6-detector |  |  |
| T7 VLM path: frontier baseline + fallback | ai | T1 | johanseneuson | done | johanseneuson/T7-vlm-pr |  |  |
| T8 Demo server + UI | app | T1 | 2chaynz | done | 2chaynz/T8-polish |  |  |
| T9 Architecture diagram for README and pitch | pitch |  | 2chaynz | done | 2chaynz/T9-diagram-clarify |  |  |
| T10 Comparable scores: full preview + official split | eval |  | ccolver | done | ccolver/T10-scores |  |  |
| T11 opening_design: read schedule tables | ai |  | johanseneuson | done | johanseneuson/T11-schedules |  |  |
| T12 Two methods agree: confidence + please check | ai | T6 | johanseneuson | review | johanseneuson/T12-agree |  |  |
| T13 Crop renderer for the VLM path | ai | T7 | ccolver | doing | ccolver/T13-vlm-crops |  |  |
| T14 Cache per-drawing extraction (Index) | ai |  | ccolver | doing | ccolver/T14-drawing-cache |  |  |
| T15 Revision diff: what changed between two sheet issues | ai |  | ccolver | done | ccolver/T15-revision-diff |  |  |
| T16 Agent heartbeat, stale flag, needs-human lane, worker loop | setup |  | Asif | done | asif/T16-autobeat-fix |  |  |
| T17 Detector on AECV-Bench: outside benchmark vs VLMs | eval | T6 | ccolver | done | ccolver/T17-aecv-bench |  |  |
| T18 Auto-close tickets when their PR merges | setup |  | Asif | done | asif/T18-close-merged |  |  |
| T19 Room-label OCR: bedrooms, baths, WCs, room counts | ai | T6 | ccolver | done | ccolver/T19-room-ocr |  |  |
| T20 Hot-swappable VLM backends: Gemini, Gemma, Nemotron | ai | T7 | Asif | doing | asif/T20-vlm-backends |  |  |
| T21 UI v2: drawing + chat redesign | app | T8 | 2chaynz | done | 2chaynz/T21-ui-v2 |  |  |
| T22 Reliable heartbeats: retry on failure, beat the claimed ticket | setup | T16 | Asif | done | asif/T22-reliable-beats |  |  |
| T23 Revision quantities: how much changed between issues | ai | T15 | ccolver | done | ccolver/T23-revision-quantities |  |  |
| T24 Facts path: free-form questions over extracted facts | ai |  | johanseneuson | done | johanseneuson/T24-facts |  |  |
| T25 DrawingVQA: whole-sheet VLM vs our crop pipeline | eval | T13,T20 |  | todo |  |  |  |
| T26 Hooks run status.mjs from origin/main | setup | T22 | Asif | done | asif/T26-hooks-from-main |  |  |
| T27 Spread bot: top 10 at level 8 (Bahn side challenge) | spread |  | Asif | done | asif/spread-bot |  |  |
| T28 UI v3: explorer sidebar, sheet info, How it works + Benchmark | app | T21 | 2chaynz | review | 2chaynz/T28-ui-explorer |  |  |
| T29 New VLM available: update button | app | T20 |  | todo |  |  |  |
| T30 Scorer: live progress + resume for long paid runs | eval |  |  | todo |  |  |  |
