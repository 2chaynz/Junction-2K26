# Ideas — ccolver

Main challenge: Stoa, Make Blueprints Talk (`context/challenges/stoa.md`). This file is the draft submission for the platform (due Fri 23:55).

## Brief (from ccolver)
- Challenge page: https://hackjunction.app/participate/45/challenges/335
- Draft submission form: https://hackjunction.app/participate/45/project
- Tool for reading the blueprints of an infrastructure construction project. Three parts:
  1. **Photogrammetry → drawings.** User photographs the site; a model is built and the relevant drawings are outlined. For suppliers, clients and design engineers who aren't close to day-to-day construction. Must show a confidence score and explain why it chose each drawing.
  2. **Ask the drawings.** Ask questions about the matched drawings and get detailed answers. Cite the relevant Eurocode and ASTM standards for that drawing and summarize their key points.
  3. **Scope of work.** Analyze the project's scope-of-work document. Flag inconsistencies; split work covered by the bid from likely T&M work so contractors maximize revenue. Give specific reasoning for each out-of-scope flag.
- Partner tech:
  - Gemma (open model): final deployment.
  - Gemini: model validation and testing.
  - Verda: GPU photogrammetry testing.
  - Nemotron: model usage.
  - ElevenLabs: text to speech.
  - Possible: dropdown so the user picks which model answers.

## Draft submission (paste into Junction Platform → Project)

**Project Name** (max 30): `Sindri`

**Punchline** (max 200):
> Snap a photo of a construction site, get the matching drawings, ask questions with cited answers and Eurocode/ASTM references, and catch scope-of-work gaps before they cost you.

**Challenge:** Make Blueprints Talk (Stoa)

**Tech challenges:** Best Use of Gemini API, Best Use of Gemma, Verda Compute Track, Best Use of Nemotron, Best Use of ElevenLabs, Best Use of Aiven, Best use of Modal, Best Use of Codex

**Description** (max 5000, markdown):

```md
## Problem
Construction drawings are hard to search, and general AI models often misread them. Suppliers, clients and design engineers who aren't on site every day can't easily tell which drawing matches what they see, what standard applies, or whether a piece of work is in the bid.

## What Sindri does
1. **Photo → drawings.** Take photos of the site. We build a photogrammetry model and match it to the most relevant drawings in the project set. Each match comes with a confidence score and the reasoning behind it (which features, dimensions and labels matched).
2. **Ask the drawings.** Ask questions in plain language. Answers cite where in the drawing they came from, so a human can check them in seconds, and reference the relevant Eurocode and ASTM standards with a short summary of the key points.
3. **Scope-of-work check.** Sindri reads the project's scope-of-work document, flags inconsistencies, and separates work covered by the bid from likely time-and-materials (T&M) work, with the reasoning for each flag. Contractors stop giving away billable work.

## How it works
- Hybrid pipeline: computer vision and geometry for drawing regions and photo matching, LLMs for reasoning and answers.
- Every answer is grounded: region highlight on the drawing, confidence score, source standard.
- Model picker: the user chooses which model answers (Gemma, Gemini or Nemotron) and sees the cost and accuracy trade-off.
- Low inference cost: Gemma (open model) is the default in deployment; Gemini is used to validate and test outputs.

## Tech
- Gemma: default deployed model, low cost.
- Gemini API: validation and evaluation of answers.
- Nemotron 3.5 Super VL: alternative model for reading drawings and documents.
- Verda GPUs: photogrammetry reconstruction and testing.
- Modal: serves Gemma on a GPU behind a public URL.
- Aiven PostgreSQL (pgvector) and OpenSearch: index of drawing regions, sheets and scope-of-work clauses for retrieval.
- ElevenLabs: spoken answers for hands-free use on site.
- Codex: used by the team to build and cross-review the code.
- Data: Stoa's dataset of real construction drawings and models.

## Status
Draft. Building over the weekend.
```

## Idea 1: Sindri
- **Challenge:** Stoa, Make Blueprints Talk. Stacks: Gemini, Gemma, Verda, Nemotron, ElevenLabs, Aiven, Modal, Codex.
- **Problem:** People not on site can't tie what they see to the right drawing, standard or bid scope.
- **User:** Suppliers, clients, design engineers; contractors for scope/T&M.
- **Demo:** Photo of a structure → matched drawing with confidence + reasoning → question answered with highlighted region and Eurocode/ASTM reference → scope-of-work flags.
- **Medium:** software.
- **Partner tech:** Stoa dataset, Gemma, Gemini, Nemotron, Verda, Modal, Aiven, ElevenLabs, Codex.
- **Hardware needed:** phone camera; 3D printer for the demo model (check venue availability).
- **Riskiest part:** photo → drawing matching; Stoa data may have no site photos to test with.
- **Buildable in 36h?** maybe. Q&A with citations is the core; photogrammetry and scope check are add-ons.

## Notes against Stoa criteria
- Judged 25% each: accuracy, visualized reasoning, creativity, low inference cost.
- Accuracy + visualized reasoning = the drawing Q&A with region highlights. Build this first.
- Low inference cost favors Gemma as default; show cost per answer in the UI.
- Photogrammetry and scope-of-work are the creativity angle, but outside the brief's core ask. Keep them thin if time runs short.
- Eurocode and ASTM full texts are paywalled; cite clause numbers and public summaries only.

## Demo model (3D printed)
- Print a scale model of a structure from the project set, plus its matching drawings (printed sheets).
- Live demo: judges photograph the model → photogrammetry → Sindri finds and highlights the matching drawings with confidence and reasoning → ask questions about them.
- Fixes the riskiest part: we control the "site", so we know the ground-truth drawing for every photo.
- Can also show a design change: print revision A and B (or a swappable part) and estimate the quantity difference.
- To decide:
  - Which structure: small and recognisable (e.g. a footing, column + beam, or bridge pier) from the Stoa dataset or our own.
  - Source geometry: Stoa 3D model if available, else model it from the 2D drawings ourselves.
  - Printer, print time and scale. Start the print early Saturday; prints take hours.

## Partner feedback (Stoa, on the scope-of-work part)
- Stoa's product already detects design changes, so the scope-of-work feature overlaps with what they have.
- Their gap: design changes are often quick and only show up in 2D drawings. They can't yet estimate the quantities in a change accurately.
- They said solving this would be useful. Possible pivot for part 3: from flagging scope to **quantities of 2D design changes**.

### Open question (answer it, or ask Stoa)
- How do you get 3D quantities (volume, area, length, counts) from 2D drawings accurately, without sending someone to do a manual material takeoff?
- Ideas to test:
  - Combine plan, section and elevation views: plan gives footprint, section/elevation gives depth/height → volume.
  - Read dimensions, scale bar and annotations (thickness, rebar schedules, callouts) with a VLM; use geometry for the measuring.
  - Diff revision A vs B of the same sheet → measure only the changed region → delta quantity.
  - Use the 3D model of the previous revision (if one exists) as the base and apply the 2D change to it.
  - Show confidence per quantity and which view/dimension it came from, so an estimator can check it fast.
- Ask Stoa:
  - Can we get example revision pairs (before/after 2D change) with the true quantities?
  - Which quantities matter most (concrete m³, rebar kg, formwork m², linear items)?
  - What error is acceptable for an estimate?
  - Do their projects usually have a 3D/BIM model of the earlier revision?

## Critique (written by another agent)
-

## Scores (1–5)
| Idea | Fit | Wow | Feasible | Partner tech | Theme | Total |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
