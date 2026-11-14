# Plan: reach top 10 at level 8, then win the jury

Written Sat 14 Nov 10:10 Helsinki. Read `HANDOFF.md` first for how to run things.

## What "#1" means
- The final (Sun 08:00 Helsinki, one secret level-8 week, ~34 real minutes) only picks the top 10 by margin.
- A jury picks the winner from those 10. So: top 10 is the gate, the pitch decides.
- Below 90% on-time = unranked = out. Never trade on-time safety for margin.

## Where we stand (round 5 "Saturday 09:00", level 8, same five weeks for all)
| Run | Us margin / orders / per order | Leader margin / orders / per order |
|---|---|---|
| 1 | 7,324 / 239 / 31 | 10,735 / 331 / 32 |
| 2 | 11,010 / 280 / 39 | 15,187 / 376 / 40 |
| 3 | 7,371 / 194 / 38 | 15,462 / 400 / 39 |
| 4 | 15,352 / 389 / 39 | 20,883 / 483 / 43 |
| 5 | pending (see `board_r5.log`) | 15,305 / 397 / 39 |

- Top 10 cutoff: €68.7k per five runs (~€13.7k per week). We are at ~€10.3k per week. House best: €50.7k.
- **Our margin per order equals the leaders'. We win 20–50% fewer orders.** The gap is volume at the same unit margin, not price per order.
- Leaders move 330–480 cars a week on time with the same drivers. So they get more out of each driver. We post every order as its own gig and decline on static rules.

## Hypotheses, in order of expected value
1. **No multi-order gigs.** Rules allow a gig with several cars (≤12 h driving first pickup to last delivery). A return leg or a second car from the same yard costs the driver only the extra time. We never build these. One team is called "No Empty Miles".
2. **Static declines throw away good orders.** `minslack`, `lowmult`, `suplo/supmult`, `ccm 1.07`, `lam 1.5`, skipping all `same_day`. They were tuned for on-time with one-car gigs. Run 3 (194 vs 400 orders) suggests we decline or overprice heavily in some worlds (low driver supply near pickups).
3. **Quotes ignore the book.** A request that pairs with an order we hold (return lane, same yard, ends where the next starts, ends near where one of our drivers lives or finishes) is cheap for us. We price it like any other.
4. **Direct offers ignore driver positions.** We see where our drivers finish. A driver finishing in town X is the cheapest driver for a gig starting in X (notifications don't reach them there, an offer does).
5. **World adaptation is thin.** One global bias plus day/pickup biases. No detection of the price-war day, no per-dealer win-share control (the competitor undercuts dealers where we win most), no per-town driver-supply estimate from views/bookings.
6. **Fee ramp teaches drivers to wait.** Every booked raise raises their expected raise. Fewer steps plus offers may cost less.

## Phase 0: measure before building (1 hour, do not skip)
- Fix a paired evaluation set: 12 practice seeds at level 8 (reuse 9101–9112; baseline already known: mean €10.6k, min on-time 95.2%). Worlds are deterministic per seed, so compare paired differences, not means.
- Write `ana_gap.py` on `diag.py` dumps for 4 seeds. Report per world:
  - requests total; declined by rule (which rule); quoted; won; win rate by quote multiplier bucket.
  - margin per won order; fee paid / `referenceFeeCents`; share booked via offer vs app; drops; failed visits by reason; late orders by cause.
  - pairing potential: for each won order, was there another won or lost request within the same 24 h whose pickup is the first one's delivery town (or within 30 km), or same pickup yard and same delivery region? Count pairs that fit 12 h.
- Decline audit: on 4 seeds set `minslack=0, lowmult=1, suplo=0`, keep everything else. Record margin and on-time of the extra orders only. This tells whether hypothesis 2 is real.
- Decide the order of phases 1–3 from these numbers. If pairs are rare (<10% of orders), move phase 2 and 3 ahead of phase 1.

## Phase 1: multi-order gigs (biggest lever, ~3 hours)
- New module `bundle.py`, called from `Desk.win` and on a timer for unbooked orders.
- Candidates: two open (unbooked) orders A, B where `B.pickup` is within 40 road minutes of `A.delivery` (return legs and triangles). A driver moves one car at a time, so two cars from the same yard only chain if B's delivery brings the driver back near the yard.
- Feasible when stop windows (after note parsing, see `stops_for`) allow the sequence, total road minutes ≤ 12 h, and both deadlines hold with ≥ 3 h spare.
- Stop order: A pickup, A delivery, B pickup, B delivery.
- Fee for the bundle: start at 0.7 × (refA + refB) × 0.8 and ramp like today. The saving is the driver's trip home.
- Before bundling, withdraw both single gigs only if neither is booked. If the bundle is unbooked 6 h before the earlier `lastPickupAt`, split it back into single gigs with the urgency ramp. Never let a bundle risk a deadline.
- Trade-ins already are two-leg gigs: check the existing path still works.
- Test: paired seeds. Keep if mean margin rises and min on-time ≥ 94%.

## Phase 2: book-aware quoting and smarter declines (~3 hours)
- Replace the static decline rules with one expected-value test: quote if `max_m gain > 0`, with cost and p_late from the GBM. Let the model carry slack and supply (they are already features). Keep one hard rule only: decline when no driver can physically make it.
- Add features to `cost_model` and refit (`collect2.py`, `fit2.py`): pairs-with-open-order flag, number of our open unbooked orders in the pickup region, our drivers finishing within 30 km of the pickup in the next 12 h, hours until deadline, day of week, flu/outage flags.
- Marginal cost discount: when a request pairs with a held order (phase 1 test), cost = bundle fee − single fee of the held order.
- Capacity guard instead of `suplo`: per region, track unbooked orders and bookings per day. When unbooked backlog in a region exceeds what booked in the last 24 h, raise the multiplier for new requests there; relax when it clears.
- Quote `same_day` when slack ≥ 5 h and a driver of ours is near, with its own multiplier (list price is higher).
- Price-war day: if win rate from 08:00 drops below a third of the expected rate over ≥ 12 quotes, either follow down only on requests with cost ≤ 0.6 × list, or decline until 18:00. Compare both.
- Per-dealer win share: if we won > 70% of a dealer's last 8 requests, add +5% to the multiplier (the competitor undercuts dealers it loses).
- Trust: add the future value of trust for dealers with many requests (the `tvk` code exists but is off; retest it with the model).

## Phase 3: cheaper drivers (~2 hours)
- Track each driver's last known position and finish time from gig events. On each new gig, send direct offers first to (a) our drivers finishing within 30 km of the pickup before the window, (b) drivers living within 30 km of the delivery, (c) drivers who booked this lane before. Fee 0.55–0.65 × ref. Respect 3 offers per driver per day and 3 open per gig.
- Record offer answers per driver to keep a floor price estimate per driver and lane length.
- Fee schedule: test fewer steps (flat 0.8 for 3 h, then one jump) against the current ramp. Fewer booked raises means drivers wait less.
- Experienced-only audience for tight orders (fewer drops and late arrivals).

## Phase 4: on-time safety controller (1 hour, must ship)
- Track projected on-time = (delivered on time + booked with slack) / won. Below 95%: multiply quotes by 1.15 and fees by 1.2. Below 93%: decline new requests except pairs, and jump unbooked gigs to the steep schedule now.
- Simulate with `simfinal.py` on 4 seeds including `SIM_CRASHES`.

## Phase 5: tune, rehearse, submit
- `autotune.py` on the new parameters, 12 tuning seeds, then confirm on 12 fresh seeds.
- Play each new ranking round with `board.py` (each of the five weeks counts once per round; watch `client.board(8)` for a new `season`).
- Test finals Sat 14:00 and 20:00 Helsinki: run `python run_final.py`. Check the loop keeps up (4.5 real seconds per request) and the action rate stays under 20/s.
- Freeze code Sat 22:00 Helsinki (team rule). After that only parameters.
- Sunday: start `run_final.py` by 07:15. Registration closes 07:30. Watch it; restart if it dies (it rebuilds from snapshot).

## Phase 6: the pitch (jury decides among top 10)
- Update `PITCH.md` into 5–10 slides: the measurement that found the gap (same unit margin, less volume), the three mechanisms (bundles, book-aware quotes, on-time controller), a before/after table on paired seeds, and what a real dispatcher would reuse.
- Read https://spread.bahnexpress.com/judging for the jury criteria and the submission hash rule before writing.

## Rules of work
- One change at a time, paired seeds, keep a results table in `RESULTS.md` (seed set, mean margin, min on-time, verdict).
- Accept a change only at ≥ +3% mean margin over 12 paired seeds with min on-time ≥ 94% and no run under 92%.
- Max 8 practice worlds per team; run 4 at a time. Do not delete worlds you did not create.
- Secrets stay in `.env`. Commits are author-only, no AI attribution. Do not push or open a PR without asking.

## Time budget (Helsinki)
| When | What |
|---|---|
| 10:15–11:15 | Phase 0 |
| 11:15–14:00 | Best of phase 1 or 2 per phase 0 |
| 14:00 | Test final 1 with the current best |
| 14:30–18:00 | Remaining phase of 1/2, then phase 3 |
| 18:00–19:30 | Phase 4, tune |
| 20:00 | Test final 2 with the candidate |
| 20:30–22:00 | Fix what the test final showed, freeze |
| Sun 07:15 | Start final run |
