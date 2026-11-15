# Tasks

Change only with `node scripts/status.mjs` (it pushes straight to main). Details in `tickets/Tn.md`.
Status: todo · doing · blocked · review · done. Area: short tag (hw, fw, app, ai, pitch…).

| Ticket | Area | Needs | Owner | Status | Branch | Device | Question |
|---|---|---|---|---|---|---|---|
| T1 Project scaffold + CONTRACT.md + Run section | setup |  | johanseneuson | done | johanseneuson/T1-scaffold |  |  |
| T2 Demo video, README, pitch | pitch | T1 | johanseneuson | doing | johanseneuson/T2-readme |  |  |
| T3 Vector path: Swiss + opening_design | ai | T1 | johanseneuson | done | johanseneuson/T3-vector-fixes |  |  |
| T4 IFC path: counts, lengths, volumes, text | ai | T1 | johanseneuson | done | johanseneuson/T4-ifc |  |  |
| T5 Train symbol detector on CubiCasa5K | train | T1 | johanseneuson | done | johanseneuson/T5-detector |  |  |
| T6 Detector path: raster counts with boxes | ai | T1 | johanseneuson | done | johanseneuson/T6-detector |  |  |
| T7 VLM path: frontier baseline + fallback | ai | T1 | johanseneuson | done | johanseneuson/T7-vlm-pr |  |  |
| T8 Demo server + UI | app | T1 | 2chaynz | done | 2chaynz/T8-polish |  |  |
| T9 Architecture diagram for README and pitch | pitch |  | 2chaynz | done | 2chaynz/T9-diagram-clarify |  |  |
| T10 Comparable scores: full preview + official split | eval |  | ccolver | done | ccolver/T10-scores |  |  |
| T11 opening_design: read schedule tables | ai |  | johanseneuson | done | johanseneuson/T11-schedules |  |  |
| T12 Two methods agree: confidence + please check | ai | T6 | johanseneuson | done | johanseneuson/T12-agree |  |  |
| T13 Crop renderer for the VLM path | ai | T7 | ccolver | done | ccolver/T13-vlm-crops |  |  |
| T14 Cache per-drawing extraction (Index) | ai |  | ccolver | done | ccolver/T14-drawing-cache |  |  |
| T15 Revision diff: what changed between two sheet issues | ai |  | ccolver | done | ccolver/T15-revision-diff |  |  |
| T16 Agent heartbeat, stale flag, needs-human lane, worker loop | setup |  | Asif | done | asif/T16-autobeat-fix |  |  |
| T17 Detector on AECV-Bench: outside benchmark vs VLMs | eval | T6 | ccolver | done | ccolver/T17-aecv-bench |  |  |
| T18 Auto-close tickets when their PR merges | setup |  | Asif | done | asif/T18-close-merged |  |  |
| T19 Room-label OCR: bedrooms, baths, WCs, room counts | ai | T6 | ccolver | done | ccolver/T19-room-ocr |  |  |
| T20 Hot-swappable VLM backends: Gemini, Gemma, Nemotron | ai | T7 | Asif | done | asif/T20-vlm-backends |  |  |
| T21 UI v2: drawing + chat redesign | app | T8 | 2chaynz | done | 2chaynz/T21-ui-v2 |  |  |
| T22 Reliable heartbeats: retry on failure, beat the claimed ticket | setup | T16 | Asif | done | asif/T22-reliable-beats |  |  |
| T23 Revision quantities: how much changed between issues | ai | T15 | ccolver | done | ccolver/T23-revision-quantities |  |  |
| T24 Facts path: free-form questions over extracted facts | ai |  | johanseneuson | done | johanseneuson/T24-facts |  |  |
| T25 DrawingVQA: whole-sheet VLM vs our crop pipeline | eval | T13,T20 |  | todo |  |  |  |
| T26 Hooks run status.mjs from origin/main | setup | T22 | Asif | done | asif/T26-hooks-from-main |  |  |
| T27 Spread bot: top 10 at level 8 (Bahn side challenge) | spread |  | Asif | done | asif/spread-bot |  |  |
| T28 UI v3: explorer sidebar, sheet info, How it works + Benchmark | app | T21 | 2chaynz | done | 2chaynz/T28-ui-explorer |  |  |
| T29 New VLM available: update button | app | T20 | 2chaynz | done | 2chaynz/T29-vlm-update |  |  |
| T30 Scorer: live progress + resume for long paid runs | eval |  |  | todo |  |  |  |
| T31 What changed view: revision diff in the UI | app | T28 | ccolver | done | ccolver/T31-changes-view |  |  |
| T32 Takeoff list: doors, windows, columns, beams, walls + dims | ai | T31 | ccolver | done | ccolver/T32-takeoff |  |  |
| T33 Cross-check: plan vs schedule conflicts | ai |  | ccolver | done | ccolver/T33-crosscheck |  |  |
| T34 IFC 3D view: answer elements highlighted in the model | app | T28 | 2chaynz | done | 2chaynz/T34-ifc-3d |  |  |
| T35 Cross-review script that finds Codex (ChatGPT app install) | setup |  | Asif | done | asif/T35-xreview |  |  |
| T36 Live reasoning in chat: verifiable steps while answering | app | T34 | 2chaynz | done | 2chaynz/T36-live-reasoning |  |  |
| T37 Reasoning stream backend: router steps + /api/ask/stream | ai |  | 2chaynz | done | 2chaynz/T37-reasoning-stream |  |  |
| T38 One-command local start (scripts/dev.mjs) | setup |  | Asif | done | asif/T38-dev-script |  |  |
| T39 Ask back when unclear: clarify + reformulate | ai |  | 2chaynz | done | 2chaynz/T39-clarify |  |  |
| T40 IFC floors: storey picker, 2D plan per floor, toggles, element info | app |  | 2chaynz | done | 2chaynz/T40-ifc-floors |  |  |
| T41 Export redline as PDF markup (Bluebeam) | app |  | johanseneuson | done | johanseneuson/T41-export |  |  |
| T42 Review mode: tick/cross uncertain marks, live count | app |  | johanseneuson | done | johanseneuson/T42-review |  |  |
| T43 Proof strip + arithmetic receipt under answers | app |  | johanseneuson | done | johanseneuson/T43-proof |  |  |
| T44 Us vs frontier model side by side (Benchmark) | app |  | johanseneuson | done | johanseneuson/T44-versus |  |  |
| T45 Gitignore dataset and zips | setup |  | Asif | done | asif/T45-gitignore-dataset |  |  |
| T46 Measure: area/length takeoffs, scale + references | app |  | ccolver | done | ccolver/T46-measure |  |  |
| T47 dev.mjs: no auto-download, print drop folder | setup |  | Asif | done | asif/T47-dev-no-download |  |  |
| T48 Agents auto-merge PRs after review + CI | setup |  | Asif | done | asif/T48-auto-merge |  |  |
| T49 Draw on the sheet to ask (highlighter + region Q&A) | app |  | 2chaynz | done | 2chaynz/T49-sketch-ask |  |  |
| T50 Projects in explorer + Building view for 2D floors | app | T28 | ccolver | done | ccolver/T50-building-view |  |  |
| T51 Ignore spread autotune outputs | setup |  | Asif | done | asif/T51-spread-ignore |  |  |
| T52 Resizable panels: drag the explorer and chat edges | app |  | 2chaynz | done | 2chaynz/T52-resize |  |  |
| T53 Multi-sheet questions: ask a whole building | ai |  | johanseneuson | blocked | johanseneuson/T53-multi |  | dropped: no Swiss building has 2+ floors in the dataset (1040 PDFs = 1040 buildings), no gold |
| T54 Multi-sheet benchmark with free gold answers | eval |  |  | blocked |  |  | dropped with T53: no multi-sheet gold exists in the Stoa data |
| T55 xreview: fall back both ways, login hint | setup |  | Asif | done | asif/T55-xreview-fallback |  |  |
| T56 dev.mjs: reinstall web deps on lockfile change | setup |  | Asif | done | asif/T56-dev-web-deps |  |  |
| T57 dev.mjs: friendly error when port 8000 is busy | setup |  | Asif | done | asif/T57-dev-port-check |  |  |
| T58 Deploy the demo to a public URL | setup |  | johanseneuson | done | johanseneuson/T58-deploy |  |  |
| T59 Zoom the Building view with the mouse wheel | app |  | ccolver | done | ccolver/T59-stack-zoom |  |  |
| T60 Link drawings and BIM and group tools | app |  | ccolver | done | ccolver/T60-sheet-tools |  |  |
| T61 Projects workspace: picker, scoped sheets, saved sessions | app | T50 | Asif | done | asif/T61-projects |  |  |
| T62 Drawing takeoff with verifiable dimensions | app |  | ccolver | done | ccolver/T62-drawing-takeoff |  |  |
| T63 Keep built-in questions in English | app |  | ccolver | done | ccolver/T63-english-questions |  |  |
| T64 Localize BIM floors and accept unquoted questions | app |  | ccolver | done | ccolver/T64-bim-language |  |  |
| T65 Benchmark geometry-based raster room counts | eval | T19 | ccolver | done | ccolver/T65-msd-rooms |  |  |
| T66 Link plan locations to schedules and details | ai | T11 | ccolver | blocked | ccolver/T66-plan-reference |  | @ccolver PR #85 second cross-review: require verified plan-tag placement and reject multi-tag lookups. |
| T67 Highlight on scans: OCR the marked spot before the VLM | ai | T49 | 2chaynz | done | 2chaynz/T67-region-ocr |  |  |
| T68 Rotation-aware whole-sheet OCR for room counts | ai |  |  | todo |  |  |  |
| T69 How it works: interactive diagram in site language | app |  | 2chaynz | done | 2chaynz/T69-how-flow |  |  |
| T70 App shell: start screen, breadcrumb, project Overview | app | T61 | Asif | done | asif/T70-app-shell |  |  |
| T71 Final BIM revision demo and cached model | app |  | ccolver | done | ccolver/T71-final-demo |  |  |
| T72 Intro: loading screen with blueprint-to-building 3D animation | app |  | 2chaynz | done | 2chaynz/T72-intro |  |  |
| T73 Benchmark page: interactive, model logos, honest numbers | app |  | 2chaynz | done | 2chaynz/T73-benchmark |  |  |
| T74 Keep repeated marks in takeoff ambiguity checks | app |  | ccolver | done | ccolver/T74-takeoff-marks |  |  |
| T75 Chat follow-ups + cited reasoning: drawing, project, web | app |  | ccolver | done | ccolver/T75-cited-reasoning |  |  |
| T76 Fix opening_design schedule counts (regression) | ai |  | Asif | done | asif/T76-schedule-fix |  |  |
| T77 IFC count fixes: curtain walls, bsc-duplex, gymzaal | ai |  | Asif | done | asif/T77-ifc-fixes |  |  |
| T78 Honest CubiCasa numbers: 83.6% held-out headline | pitch |  | Asif | done | asif/T78-honest-numbers |  |  |
| T79 Home: BIM project cards spin in 3D (PyVista turntables) | app |  | 2chaynz | done | 2chaynz/T79-turntables |  |  |
| T80 Takeoff: filter dropdowns + motion | app |  | ccolver | done | ccolver/T80-takeoff-filters |  |  |
| T81 Fix Vitoria takeoff dimensions | app |  | ccolver | done | ccolver/T81-vitoria-dimensions |  |  |
| T82 Judge-facing README | pitch |  | Asif | done | asif/T82-readme |  |  |
| T83 English-only UI: translate loaded data | app |  | ccolver | done | ccolver/T83-english-ui |  |  |
| T84 Motion: press feedback, sliding tabs, growing bars, 3D loader, count-ups | app |  | 2chaynz | done | 2chaynz/T84-motion |  |  |
| T85 Sheet revision demo: scripted PDF diff walkthrough | app | T15 | ccolver | done | ccolver/T85-sheet-demo |  |  |
| T86 VLM picker in the Ask composer | app |  | Asif | done | asif/T86-vlm-picker |  |  |
| T87 Health: scale bar beside a metres bar, tests run standalone | app |  | 2chaynz | done | 2chaynz/T87-health |  |  |
| T88 README team credits | pitch |  | Asif | done | asif/T88-team-credits |  |  |
| T89 Loaders everywhere, no demo stickers, motion on Home | app |  | 2chaynz | done | 2chaynz/T89-loaders |  |  |
| T90 Rebrand to Sindri, Tac One wordmark | app |  | ccolver | done | ccolver/T90-sindri |  |  |
| T91 Bigger Sindri wordmark in the header | app |  | 2chaynz | done | 2chaynz/T91-wordmark |  |  |
| T92 Pages never served stale after a rebuild | app |  | 2chaynz | done | 2chaynz/T92-nocache |  |  |
| T93 Import a folder or zip of drawings as a new project | app |  | Asif | done | asif/T93-import |  |  |
| T94 Sindri logo: red dot on the last i | app | T90 | ccolver | done | ccolver/T94-logo |  |  |
| T95 Delete an imported project | app | T93 | Asif | done | asif/T95-delete-project |  |  |
| T96 Final demo set: curated projects, role chips, runbook | app | T85 | ccolver | done | ccolver/T96-demo-set |  |  |
| T97 Public URL: Oracle VM + Tailscale Funnel | setup | T58 | Asif | done | asif/T97-oracle-funnel |  |  |
| T98 3D previews on demo BIM cards | app | T96 | Asif | done | asif/T98-demo-turntables |  |  |
| T99 Sharp image thumbnails on project cards | app | T98 | Asif | done | asif/T99-sharp-thumbs |  |  |
| T100 Add MIT licence for submission | setup |  |  | todo |  |  |  |
