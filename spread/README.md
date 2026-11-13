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
- Quotes (default): online logistic model of P(win) by price/list, with offsets per dealer, pickup and delivery place. Quotes the ratio that maximises P(win) x (price - expected fee). Expected fee uses the booked/typical fee ratio learned from bookings, raised when many orders wait for a driver. `winprob=False` falls back to:
- Quotes (old): list price x per-dealer markup. Starts at the level's competitor band, +2% after a win, -3% after a loss. Declines when the expected driver fee is over 85% of the price.
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

## Win-probability pricing (level 8, `evaluate.py --flag winprob`)
| Seed | Markup (old) | Win-prob | On time (win-prob) |
|---|---|---|---|
| eval-0 | €1,499 | €4,834 | 96.3% |
| eval-1 | €1,001 | €3,709 | 88.0% (not ranked) |
| eval-2 | €380 | €4,349 | 93.1% |
| eval-3 | -€206 | €1,786 | 90.3% |
| Total | €2,674 | €14,678 | |

Next: eval-1 misses the 90% minimum. Likely cars going to or from towns with few drivers; decline or price those up by measured time-to-book per town.
