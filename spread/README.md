# Spread (Bahn Express) side project

Bot that runs a simulated car-transport week. Score = gross margin, at least 90% on time.
Brief and docs: https://spread.bahnexpress.com/llms.txt

## Setup
```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env   # put the team key from spread.bahnexpress.com/join (event code spread-kmu9z6)
set -a; . ./.env; set +a
```

## Run
- One week: `.venv/bin/python dispatch.py --level 8 --seed s1`
- A/B on seeds (batching on/off): `.venv/bin/python evaluate.py --level 8 --seeds 4`
- Ranking run: add `--board`. Final Sun 08:00: not wired yet (use the kit's `spread-starter --final` as fallback).

## What it does (on top of the kit starter)
- Quotes: list price x per-dealer markup. Starts at the level's competitor band, +2% after a win, -3% after a loss. Declines when the expected driver fee is over 85% of the price.
- Fees: opening fee scaled up at levels 7-8 (driver shortage).
- OR-Tools: won single-car orders wait up to 30 min. CP-SAT pairs them so one driver delivers car A then picks up car B nearby (12h rule, windows, deadlines). Pair fee = 85% of the two fees.

## Next
- Measure batching vs no batching on 4+ seeds, tune `Params`.
- Final mode (stream) using `SmartDesk`.
- Learn lane prices from reveals; read notes better.

## Results (level 8, seeds s1/s2)
| Markup | Decline if fee > | s1 | s2 |
|---|---|---|---|
| kit starter | - | -€72,613 | - |
| 1.32 | 85% | €285 | €613 |
| 1.45 (default) | 85% | €1,008 | €518 |
| 1.60 | 85% | €587 | €545 |
| 1.60 | 100% | -€1,588 | €476 |
All ranked (>=90% on time) except some 100% runs. Pairing rarely fires (0-8 pairs a week): windows are tight.
