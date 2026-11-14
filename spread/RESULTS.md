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
