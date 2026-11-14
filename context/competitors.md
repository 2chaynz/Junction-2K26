# Junction 2026 — Cala & Stoa challenges: what's on GitHub

Nov 14, 2026 · @2chaynz

I found far fewer public repos for Cala (3) than for Stoa (8+). On Stoa, several teams already answer the dataset's vector-drawing questions almost perfectly, so the room left is raster plans. Repos created during the hackathon (Nov 13–14); anything pushed later isn't covered.

## Cala — "Make Unicorns Real"

**What Cala's API offers.** Five endpoints: `knowledge_search` (sourced answers in markdown), `knowledge_query` (typed JSON rows), `entity_search` (look up by name), `entity_lookup` (resolve by an identifier such as LEI, CIK or SIREN) and `retrieve_entity` (full details for a known UUID). Both knowledge endpoints accept a plain-language question or Cala's dot-notation query language ([Cala docs](https://docs.cala.ai/)). From teams' repos: the REST base is `https://api.cala.ai/v1`, the MCP server is at `https://api.cala.ai/mcp/`, and both use an `X-API-KEY` header.

### Team repos

| Repo | What it does |
| --- | --- |
| [ToukoUrsin/soft-yes](https://github.com/ToukoUrsin/soft-yes) | The strongest one. Live at soft-yes.fly.dev. A founder enters investors who said "we're in if you find a lead". It walks Cala's graph to the rounds they joined and who led them, then opens each cited page to confirm the "led" claim; the `/audit` page lists confirmed claims and corrections. It ranks leads and drafts the intro. Backtest: with two investors as input, the real lead was in the list 27% of the time, against 11% for a random pick. Also an MCP server, and checks the Slush attendee directory. Same team as a Valio gateway entry. |
| [aapolipponen/pitch-list](https://github.com/aapolipponen/pitch-list) | "Who should I pitch at Slush?": a ranked investor shortlist where every investor, round and inference links to a dated source. Exports to CSV or Markdown. Same author as Valio and Stoa entries. |
| [hectoragofi/junction2026cala](https://github.com/hectoragofi/junction2026cala) | "Perimeter", a sourced portfolio watch for VCs. README is still a template; the real repo lives on a private server. |

### Useful references

- [DealExMachina/cala-mcp-proxy](https://github.com/DealExMachina/cala-mcp-proxy): a small proxy so the claude.ai website can connect to Cala's MCP server.
- [MarcAltabella/Cala-OpenAI](https://github.com/MarcAltabella/Cala-OpenAI): 3rd place at an earlier Cala hackathon (LangGraph agent, pgvector, Neo4j). Worth reading for what Cala judges have rewarded before.

## Stoa — "Make Blueprints Talk"

**About the dataset** (from teams' READMEs): about 14,000 drawings and about 127,000 questions in `questions.jsonl`. Counts must be exact; areas, lengths and volumes within 2%.

- **cubicasa5k:** \~85,500 questions, Finnish raster plans (PNG) — the bulk of the score.
- **swiss\_dwellings:** \~37,600 questions, with DXF vector files.
- **ifc\_models:** \~3,100 questions on 3D building models.
- **opening\_design:** \~60 questions on real drawing sets with schedules.

### Team repos, by measured accuracy

| Repo | Swiss DXF | IFC | CubiCasa raster | Approach |
| --- | --- | --- | --- | --- |
| [easyiowa/stoa-takeoff](https://github.com/easyiowa/stoa-takeoff) | 99.3% | 99.5% | **78.7%** (official test split) | YOLO11s symbol detector trained on the dataset's own annotations, plus an OCR cross-check. Claude only parses the question. Reviewer loop that learns rules. Good notes on data pitfalls. |
| [lorikjashari/stoa](https://github.com/lorikjashari/stoa) ("Plumbline") | 99.49% | 99.90% | 65.9% hybrid; 86.9% when two methods agree | Cheapest engine first. Gemma 4 at about $0.00015 per question. Linked 2D and 3D views. |
| [chaowang0524/metsatalo-stoa](https://github.com/chaowang0524/metsatalo-stoa) | 100% | 100% | 47% | Sample of 30 questions per source. Logs tokens per question — useful for the cost criterion. |
| [NiceK1/stoa-spike](https://github.com/NiceK1/stoa-spike) | — | — | — | Geometry code for vector files, Claude CLI for raster. Scorer, SVG evidence overlays, downloads only needed files from the zip. |
| [aapolipponen/drawing-desk](https://github.com/aapolipponen/drawing-desk) | — | — | — | Questions over IFC, DXF, vector PDF and scans, with inspectable evidence. |
| [Akshaz7/junction](https://github.com/Akshaz7/junction) ("Hologram") | — | — | — | Reads each drawing once into a "plan map". Evidence in 2D boxes, 3D and iPhone AR. |
| [markmannion/leargas](https://github.com/markmannion/leargas) | — | — | — | Voice-first answers with citations. Trains models on a private Hugging Face copy of the dataset. |
| [tstst334/junction](https://github.com/tstst334/junction) | — | — | — | Empty. |

## What this means if you pick one

- **Stoa:** the vector files are effectively solved by plain geometry code. The open ground is raster counting — windows and doors score only 55–65% even in the best repo — and the PDF schedules (opening\_design), where every team is weak. Low inference cost is 25% of the score, which favours precomputed answers over model calls.
- **Cala:** less crowded, but soft-yes already set a high bar on "every fact checked against its source". A fresh angle beyond fundraising would score better on originality — e.g. finding first customers among companies that just raised, or mapping who might acquire a startup.

Both challenge pages showed "Closed" with a T-01:22 countdown — check on the dashboard whether you can still switch challenge.

## Sources

- [Cala docs](https://docs.cala.ai/)
- The GitHub repos linked above
