"""Compares variants on the same seeds, in parallel. Max 8 live practice worlds per team.

Run: python evaluate.py --level 8 --seeds 4 --flag winprob
     python evaluate.py --seeds 8 --set ramp_close=1.4 --set max_backlog=20
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor

from spread.client import Client

from dispatch import Roads, default_params, play_practice


def parse(value: str):
    for cast in (int, float):
        try:
            return cast(value)
        except ValueError:
            pass
    return value == "True" if value in ("True", "False") else value


def run(roads: Roads, level: int, seed: str, overrides: dict) -> dict:
    params = default_params()
    for key, value in overrides.items():
        setattr(params, key, value)
    world = Client().create(level=level, seed=seed)
    try:
        return play_practice(world, level, params, roads, quiet=True)
    finally:
        world.delete()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--level", type=int, default=8)
    parser.add_argument("--seeds", type=int, default=4)
    parser.add_argument("--offset", type=int, default=0, help="first seed index")
    parser.add_argument("--flag", help="Params bool to switch off/on")
    parser.add_argument("--set", action="append", default=[], help="key=value override, repeatable")
    parser.add_argument("--detail", action="store_true", help="print the ledger and event counts")
    args = parser.parse_args()
    base = {k: parse(v) for k, v in (s.split("=", 1) for s in args.set)}
    variants = [{**base, args.flag: v} for v in (False, True)] if args.flag else [base]
    roads = Roads(Client().map())
    jobs = [(f"eval-{i}", n) for i in range(args.offset, args.offset + args.seeds) for n in range(len(variants))]
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda j: run(roads, args.level, j[0], variants[j[1]]), jobs))
    totals = [0] * len(variants)
    unranked = [0] * len(variants)
    for (seed, n), s in zip(jobs, results):
        totals[n] += s["marginCents"]
        unranked[n] += not s["ranked"]
        print(f"{seed:<8} {variants[n]}  margin €{s['marginCents'] / 100:>11,.2f}  on time {s['onTimeShare']:6.1%}  orders {s['wonOrders']:>4}  paired {s['paired']:>3}  ranked {s['ranked']}")
        if args.detail:
            print("   ledger €", {k: v // 100 for k, v in s["ledger"].items()})
            c = s["counts"]
            print("   events", {k: c.get(k, 0) for k in ("price_request", "order_won", "order_lost", "deadline_close", "gig_expired", "gig_dropped", "no_show", "visit_failed", "order_cancelled")})
    for n, variant in enumerate(variants):
        print(f"total {variant}: €{totals[n] / 100:,.2f}  unranked {unranked[n]}")


if __name__ == "__main__":
    main()
