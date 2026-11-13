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

**Project Name** (max 30): `SiteLens`

**Punchline** (max 200):
> Snap a photo of a construction site, get the matching drawings, ask questions with cited answers and Eurocode/ASTM references, and catch scope-of-work gaps before they cost you.

**Challenge:** Make Blueprints Talk (Stoa)

**Tech challenges:** Best Use of Gemini API, Best Use of Gemma, Verda Compute Track, Best Use of Nemotron, Best Use of ElevenLabs

**Description** (max 5000, markdown):

```md
## Problem
Construction drawings are hard to search, and general AI models often misread them. Suppliers, clients and design engineers who aren't on site every day can't easily tell which drawing matches what they see, what standard applies, or whether a piece of work is in the bid.

## What SiteLens does
1. **Photo → drawings.** Take photos of the site. We build a photogrammetry model and match it to the most relevant drawings in the project set. Each match comes with a confidence score and the reasoning behind it (which features, dimensions and labels matched).
2. **Ask the drawings.** Ask questions in plain language. Answers cite where in the drawing they came from, so a human can check them in seconds, and reference the relevant Eurocode and ASTM standards with a short summary of the key points.
3. **Scope-of-work check.** SiteLens reads the project's scope-of-work document, flags inconsistencies, and separates work covered by the bid from likely time-and-materials (T&M) work, with the reasoning for each flag. Contractors stop giving away billable work.

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
- ElevenLabs: spoken answers for hands-free use on site.
- Data: Stoa's dataset of real construction drawings and models.

## Status
Draft. Building over the weekend.
```

## Idea 1: SiteLens
- **Challenge:** Stoa, Make Blueprints Talk. Stacks: Gemini, Gemma, Verda, Nemotron, ElevenLabs.
- **Problem:** People not on site can't tie what they see to the right drawing, standard or bid scope.
- **User:** Suppliers, clients, design engineers; contractors for scope/T&M.
- **Demo:** Photo of a structure → matched drawing with confidence + reasoning → question answered with highlighted region and Eurocode/ASTM reference → scope-of-work flags.
- **Medium:** software.
- **Partner tech:** Stoa dataset, Gemma, Gemini, Nemotron, Verda, ElevenLabs.
- **Hardware needed:** phone camera only.
- **Riskiest part:** photo → drawing matching; Stoa data may have no site photos to test with.
- **Buildable in 36h?** maybe. Q&A with citations is the core; photogrammetry and scope check are add-ons.

## Notes against Stoa criteria
- Judged 25% each: accuracy, visualized reasoning, creativity, low inference cost.
- Accuracy + visualized reasoning = the drawing Q&A with region highlights. Build this first.
- Low inference cost favors Gemma as default; show cost per answer in the UI.
- Photogrammetry and scope-of-work are the creativity angle, but outside the brief's core ask. Keep them thin if time runs short.
- Eurocode and ASTM full texts are paywalled; cite clause numbers and public summaries only.

## Critique (written by another agent)
-

## Scores (1–5)
| Idea | Fit | Wow | Feasible | Partner tech | Theme | Total |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
