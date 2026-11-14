# Results

Paired A/B, level 8, seeds 9101–9112 (`python ab.py <tag> '<overrides>'`, overrides on top of `best_params.json` at the time).
Accept: ≥ +3% mean margin, min on-time ≥ 94%, no run under 92%.

| Tag | Change | Mean margin | vs base | Better | Min on-time | Orders | Verdict |
|---|---|---|---|---|---|---|---|
| base | best_params.json at 5320ddd | €10,671 | — | — | 95.2% | 273 | baseline |
| nodecl | minslack 0, lowmult 1, suplo 0 | €10,799 | +1.2% | 6/12 | 94.6% | 276 | reject: static declines cost little |
| ccm85 | cost multiplier 0.85 (4 seeds) | — | −4.7% | 1/4 | 94.0% | +35% | reject: volume at lower price loses margin |
| nooffer | offers to drivers living near delivery off | €10,637 | −0.3% | 3/12 | 95.7% | 273 | neutral: those offers book 0–6 gigs a week |
| chain70 | offers to our drivers finishing near an open pickup, 0.7× typical | €10,655 | −0.1% | 5/12 | 94.8% | 273 | reject: 2–3 of ~1000 offers accepted (17 at 1.0×) |
| sd1 | quote same_day (also same-day-only requests), slack ≥ 8 h, supply ≥ 40 | €12,111 | +13.5% | 11/12 | 90.3% | 315 | on-time too low (9111 flu day) |
| sd_m125 | sd1 + same_day at 1.25× | €12,022 | +12.7% | 12/12 | 92.7% | 304 | on-time too low |
| sd_s600 | sd1 + slack ≥ 10 h | €12,039 | +12.8% | 11/12 | 93.6% | 309 | on-time too low |
| sd_ra | sd1 + risk-scaled cost | €12,118 | +13.6% | 11/12 | 90.4% | 314 | risk signal reacts too late |
| **sd_bl** | sd1 + backlog gate: no same_day when > 30 orders lack a driver, cost +50% per 40 over 40 | **€12,067** | **+13.1%** | 11/12 | **94.5%** | 312 | **accept → best1** |

## Phase 0 findings
- Weak worlds (9102, 9104): ~70% of requests offer same_day; we won ~15% of them and declined many outright. Same_day was the volume gap.
- Booked fees: median 0.85–1.0× typical, mostly at schedule steps 0–2. Median wait 60–90 min.
- Direct offers (both kinds) barely book: drivers read them and decline, or they expire.
- Late orders cluster on one day (flu): a backlog of unbooked orders is the early signal.

## Round 2 (vs best1 = sd_bl)
| Tag | Change | Mean margin | vs best1 | Better | Min on-time | Orders | Verdict |
|---|---|---|---|---|---|---|---|
| b1_sup20 | same_day supply ≥ 20 | €12,264 | +1.6% | 5/12 | 93.5% | 316 | reject |
| b1_sl360 | same_day slack ≥ 6 h | €12,355 | +2.4% | 9/12 | 93.3% | 317 | reject |
| b1_m105 | same_day at 1.05× | €12,711 | +5.3% | 10/12 | 91.8% | 330 | on-time too low |
| b1_m105bl20 | 1.05× + gate at 20 | €12,347 | +2.3% | 9/12 | 92.7% | 320 | reject |
| **b1_m110** | same_day at 1.10× | **€12,442** | **+3.1%** | 8/12 | **94.9%** | 320 | **accept → best2** (+16.6% vs base) |

## Round 3 (vs best2 = b1_m110)
| Tag | Change | Mean margin | vs best2 | Better | Min on-time | Orders | Verdict |
|---|---|---|---|---|---|---|---|
| b2_etad | per-day win bias, eta 0.15 | €12,695 | +2.0% | 9/12 | 93.0% | 321 | reject |
| b2_tvk | future trust value on (tvk 1.0) | €10,531 | −15.4% | 1/12 | 91.7% | 405 | reject: overbuys volume |
| b2_tvk25 | tvk 0.25 | €12,067 | −3.0% | 5/12 | 92.3% | 358 | reject |
| simf2 | live-clock final loop, speed 4 | €10,396 | — | — | 98.8% | 260 | final loop works with best2 |
| b2_flat85 | one flat opening fee 0.85× | €11,842 | −4.8% | 2/12 | 93.5% | 313 | reject: rising ramp is better |
| b2_ufix | urgency steps merged into opening ramp | €12,586 | +1.2% | 9/12 | 93.1% | 322 | reject |
| b2_ccm95 | cost multiplier 0.95 | €12,585 | +1.2% | 8/12 | 91.9% | 382 | reject: +60 orders, on-time falls |
| b2_lam75 | late penalty weight 0.75 | €12,798 | +2.9% | 9/12 | 92.0% | 336 | reject (close) |
| b2_ls13 | fee ×1.3 from start where < 5 drivers within 30 km | €12,311 | −1.1% | 4/12 | 94.6% | 320 | reject |
| b2_bun | two-car gigs (A's delivery within 30 km of B's pickup, ≤ 11 h driving), fee 0.8 × sum | €12,668 | +1.8% | 8/12 | 91.8% | 315 | reject: split bundles go late |
| b2_bun3 | + spare 6 h, split 10 h before, fee 0.85, split orders reopen at 1.1× | €12,909 | +3.8% | 9/12 | 93.7% | 319 | on-time just under |
| b2_bun4 | + split 12 h before, reopen at 1.3× (11 seeds) | €13,324 | +4.3% | 7/11 | 92.9% | 299 | on-time under bar (9111) |

## Ranking round 6 (Sat 12:00), best2
- €73,790 over 5 weeks (16.3k, 16.3k, 11.4k, 15.8k, 14.0k), on-time 94.1–99.1%. Rank 22/194. 10th: €87.0k. House best €77.6k.
- Top teams win 400–500 orders/week at 96–98% on-time; we win 320–390.

## Late-order analysis (ccm 0.95, 4 seeds)
- Most late cars: next_day, ≥ 24 h slack at win, booked only after the deadline warning, pickups with few drivers within 30 km.
- Bulk orders are not the cause. Bundled orders that were split back go late; orders kept in a done bundle rarely do.
