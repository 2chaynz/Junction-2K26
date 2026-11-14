# Spread: pitch outline (5-10 slides)

1. **Problem.** Run a car-transport desk for a week: quote dealers, pay freelance drivers, keep >=90% on time. Starter loses ~€72k a week at level 8.
2. **Insight: two curves.**
   - Dealers: P(win) falls steeply with price (logit slope about -7 per ln price). Flat list-price quoting wins the wrong cars.
   - Drivers: cost depends on where they live. 27% of gigs book at the opening fee within 20 min; the rest wait hours and drop.
3. **Quote engine.** For each request pick the price m that maximises `(m*list*(1-lam*p_late) - cost) * P(win|m)`.
   - P(win): logistic on ln price + dealer, pickup, delivery, option; fitted on ~76 worlds of randomised quotes; an online bias tracks each world's competitor level.
   - cost and p_late: gradient-boosted models on driver supply near pickup/delivery, drive time, slack, hour, private address.
   - Dealer trust (+1% per on-time order, level 8) folded into the price term.
   - Decline = quote far above list when expected margin <= 0.
4. **Dispatch engine.**
   - Own note parser (fi/sv/en): ready times, handover, hours, deadlines, gearbox, plates.
   - Fee schedule: plateau ramp 0.7/0.9/1.1x typical fee, then a ramp anchored to the last possible pickup, steep after the deadline warning.
   - Reposts on expiry/failed visit, reprices on drops.
5. **Robustness.** Delivery minimum is a hard gate, so the objective trades margin for on-time. Final runs from the live stream, rebuilds all books from snapshot+events after a crash, survives server restarts (tested with injected crashes at 12x speed).
6. **Results.** Practice level 8 (16 fresh seeds): ~€11k per week, on-time 96-99%. Ranking rounds: see board.
7. **What did not work (and why).** Higher flat fees (drivers learn to wait), quoting same_day (late), learned per-dealer multipliers (on-time drops), direct offers at low fees (2 accepted of 3000), trust-investing early (capacity cost > gain).
8. **Method.** Parallel seeded sweeps, offline fit from randomised-quote worlds, subagents for note parsing and quote learning, automated coordinate-descent tuning with on-time penalty.
