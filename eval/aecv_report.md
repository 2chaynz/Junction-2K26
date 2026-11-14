# AECV-Bench object counting: detector vs VLMs

- 2026-11-14, commit aea840c, 120 plans, detector 156s on CPU.
- Cell: exact match (MAPE). VLM rows recomputed from AECV-Bench's own CSVs; unparseable = wrong.
- Source: github.com/AECFoundry/AECV-Bench (arXiv 2601.04819). Reproduce: `AECV_DATA=... python -m eval.aecv`.

| Model | Door | Window | Space | Bedroom | Toilet | Cost, 120 plans |
|---|---|---|---|---|---|---|
| **SiteLens detector** | 37% (24%) | 41% (18%) | 12% (31%) | 53% (32%) | 66% (27%) | €0.0060 |
| Gemini 3.5 Flash | 43% (12%) | 39% (17%) | 14% (30%) | 93% (4%) | 82% (14%) | $3.77 |
| Gemini 3.1 Pro | 34% (15%) | 33% (21%) | 15% (28%) | 91% (5%) | 82% (12%) | n/a |
| Claude Fable 5 | 36% (17%) | 29% (21%) | 17% (29%) | 93% (4%) | 82% (12%) | $9.22 |
| GPT-5.5 | 30% (19%) | 28% (22%) | 14% (41%) | 92% (4%) | 77% (18%) | $26.88 |
| Gemma 4 31B | 22% (33%) | 13% (36%) | 13% (29%) | 80% (15%) | 78% (17%) | $0.02 |

Detector Toilet counted as WC + bath rooms instead of toilet bowls: 62% (30%).

## Findings
- Windows: detector best of all models (41% vs Gemini 3.5 Flash 39%).
- Doors: 2nd (37% vs 43%), ahead of Gemini 3.1 Pro, Fable 5, GPT-5.5.
- Cost: €0.006 for 120 plans vs $3.77 (Gemini 3.5 Flash) and $26.88 (GPT-5.5). ~600–4500x cheaper, on CPU, no API.
- Out of distribution: trained only on Finnish CubiCasa; these are mostly French plans with other symbol styles. No AECV image used in training or tuning.
- Bedrooms / toilets: VLMs win (93% / 82%). They read labels ("CHAMBRE", "WC"); our detector has no OCR. Fix: route label-countable rooms to OCR or a VLM crop.
- Space (all rooms): everyone fails (12–17%).
- Pitch line: symbols → detector matches or beats frontier at near-zero cost; labels → text reading. Supports cheapest-reader-first routing.
