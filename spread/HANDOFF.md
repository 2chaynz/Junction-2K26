# Spread bot: handoff

Goal: win Bahn Express "Spread" (hackjunction challenge 349). Final = Sun 15 Nov 08:00 Helsinki, one secret level-8 world, ~34 min real time. Need >=90% on-time (else unranked) and top-10 margin; jury picks winners from top 10.

## Run
- `cd spread; set -a; . ./.env; set +a` (`.env` has SPREAD_URL/SPREAD_KEY; gitignored; never commit/print the key)
- venv: `.venv/Scripts/python`. Kit docs: https://spread.bahnexpress.com/llms.txt
- `python sweep.py '<params json>' seed1 seed2 ...` parallel practice worlds (max 8 slots per team; ~4 at once recommended)
- `python dist.py best_params.json f1 ... f16` margin + on-time distribution
- `python board.py "$(cat best_params.json)"` plays 5 ranking runs of the current round (counts on the board; each world once)
- `python diag.py <seed>` plays a world and dumps events/reveal/roster to data/ (then ana*.py)

## Files
- `dispatch.py`: the bot (starter + our changes). Params via env SPREAD_PARAMS (JSON), defaults in dict `P`. Best params: `best_params.json`.
- `model.json` (P(win) logistic from `fit.py` on data/q_c*), `cost_model.pkl` (GBM cost/late from `fit2.py` on data/o_d*), `featlib.py` shared features.
- `collect.py` (random-quote data), `collect2.py` (per-order cost data), data/ is gitignored.

## What worked (8-seed-ish totals, level 8)
- starter -72k/world. Skip same_day, quote ~1.6x list (win curve is steep: logit slope -7 per ln price) -> +6k/world.
- trust scaling (+1%/on-time order per dealer), plateau fee ramp 0.7/0.9/1.1x typical fee hourly, direct offers to drivers near delivery, supply rule.
- note parser (from subagent): fewer failed visits.
- model-based quote: argmax (m*list*(1-lam*p_late) - cost)*P(win), cost from GBM, online bias per world (eta 0.08). ~11k/world.
- urgency fee ramp anchored to lastPickupAt: more on-time.
## Did not help
- higher flat fees, whole-schedule ramp to lastPickupAt, quoting all options incl same_day, learned per-dealer multiplier (+8%, on-time worse).
## Risks / TODO
- on-time min ~90.7% on some seeds: unranked = fatal. Add safety controller / higher ccm.
- final mode (`play_final`) untested with new Desk logic: simulate with a practice world + real-time clock.
- Test finals Sat 14:00 and 20:00 Helsinki. Final registration closes 07:30 Sun.
