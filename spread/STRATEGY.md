# Strategy notes

From the handbook plus research on freight pricing and crowd-shipping pay. Ordered by expected gain.

## Quotes
- Model P(win | price/list, lane, day) per lane, as Uber Freight does with booking probability. Fit it online from our own wins and losses. Quote the price that maximises P(win) x (price - expected fee).
- Floors: a minimum margin per lane, a maximum price, and a fallback price.
- Detect the level 8 price war (wins suddenly drop everywhere, 08:00-18:00): stop quoting low that day instead of chasing it.
- Detect the outage (one region suddenly wins at high prices): raise prices there by ~25%.
- Dealer trust (level 8): win and deliver on time for the same dealers. On-time orders raise the price they accept by up to 25%. A late order halves it.
- Decline bad requests: drives to towns with no drivers, long trips out to the pickup, evening pickups, risky notes.

## Driver fees
- Acceptance is a logit in fee vs driver cost (Torres, EPFL). Estimate the cost per lane from the hours it takes gigs to get booked.
- Drivers learn our raises and wait for them. Open close to the clearing fee and raise little; avoid always rising (handbook: "teaches drivers to wait").
- Direct offers to drivers who finish one of our gigs near the next pickup: cheap, and no raise to learn from.
- Never let a car reach `deadline_close`: being late costs a refund plus the dealer's trust.

## Batching / OR-Tools
- Pairing fires rarely with 30-min holds. Better: chain new orders onto drivers already on our gigs (direct offer at their drop-off point).
- Return legs and the bulk order (30-40 cars from one yard) are the real batching wins.
- Crowd-shipping papers report savings from flexible delays (8%) and multi-stop routes (17%).

## Process
- Fixed seeds, A/B every change, 4+ seeds (world varies a lot: s1 vs s2 differ by 2x).
- `reveal` after each week: check note reading, and the fee at which each lane got booked.

## Sources
- [AWS: dynamic pricing for logistics](https://aws.amazon.com/blogs/supply-chain/dynamic-pricing-for-logistics-service-providers-to-maximize-profitability)
- [Uber Freight: booking probability (Markov)](https://www.uber.com/bg/en/blog/freight-markov/)
- [GetTransport: bidding guardrails](https://blog.gettransport.com/trends-in-logistic/how-small-transport-companies-compete-with-giants-via-freight-marketplaces)
- [Joint matching and pricing for crowd-shipping (arXiv 2507.01749)](https://arxiv.org/html/2507.01749v1)
- [Torres et al., route pricing with acceptance logit (EPFL)](https://transp-or.epfl.ch/documents/technicalReports/Torres2024_0.pdf)
- [Dynamic compensation for occasional drivers (Uni Duisburg-Essen)](https://www.pl.msm.uni-due.de/en/research/publications/optimizing-last-mile-delivery-a-dynamic-compensation-strategy-for-occasional-drivers-6902/)
- [Preference-aware compensation (arXiv 2502.05060)](https://arxiv.org/pdf/2502.05060)
- [Amazon last-mile routing challenge winners (MIT)](https://news.mit.edu/2021/last-mile-routing-research-challenge-three-winning-teams-0824)
