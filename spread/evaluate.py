"""Compares variants on the same seeds, in parallel. Max 8 live practice worlds per team.

Run: python evaluate.py --level 8 --seeds 4 --flag winprob
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor

from spread.client import Client

from dispatch import Roads, default_params, play_practice


def run(client: Client, roads: Roads, level: int, seed: str, variant: bool, flag: str) -> dict:
    params = default_params()
    setattr(params, flag, variant)
    world = Client().create(level=level, seed=seed)
    try:
        return play_practice(world, level, params, roads, quiet=True)
    except BaseException:
        world.delete()
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--level", type=int, default=8)
    parser.add_argument("--seeds", type=int, default=4)
    parser.add_argument("--flag", default="winprob", help="Params bool to switch off/on")
    args = parser.parse_args()
    client = Client()
    roads = Roads(client.map())
    jobs = [(f"eval-{i}", v) for i in range(args.seeds) for v in (False, True)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda j: run(client, roads, args.level, *j, args.flag), jobs))
    totals = {False: 0, True: 0}
    for (seed, batch), s in zip(jobs, results):
        totals[batch] += s["marginCents"]
        print(f"{seed:<8} {args.flag}={batch!s:<5} margin €{s['marginCents'] / 100:>11,.2f}  on time {s['onTimeShare']:6.1%}  orders {s['wonOrders']:>4}  paired {s['paired']:>3}  ranked {s['ranked']}")
    for batch, total in totals.items():
        print(f"total {args.flag}={batch}: €{total / 100:,.2f}")


if __name__ == "__main__":
    main()
