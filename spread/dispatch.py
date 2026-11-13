"""Spread dispatcher: the kit starter plus adaptive quotes and OR-Tools gig pairing.

Run: python dispatch.py --level 8 --seed s1   (needs SPREAD_URL, SPREAD_KEY)
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from typing import Optional

from ortools.sat.python import cp_model
from spread import starter
from spread.client import Client, SpreadError, World
from spread.starter import DAY, HOUR, WAKE_ON, WEEKDAYS, Desk, report, stops_for, Retry, without_windows
from spread.types import FeeStep, Order, PriceRequest


@dataclass
class Params:
    # Competitor sits 26-54% above list at level 8, 12-38% at level 7.
    markup: dict[int, float]
    fee_base: dict[int, float]
    win_step: float = 1.02
    loss_step: float = 0.97
    min_markup: float = 0.9
    max_markup: float = 1.8
    # Decline when the expected driver cost eats this share of the price.
    max_cost_share: float = 0.85
    batch: bool = True
    hold: int = 30
    max_link: int = 75
    combine: float = 0.85


def default_params() -> Params:
    return Params(
        markup={1: 1.0, 2: 1.0, 3: 1.0, 4: 1.05, 5: 1.05, 6: 1.08, 7: 1.22, 8: 1.32},
        fee_base={1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.0, 6: 1.05, 7: 1.3, 8: 1.35},
    )


class Roads:
    def __init__(self, world_map: dict):
        self.minutes = {(r["from"], r["to"]): r["minutes"] for r in world_map["roads"]}

    def __call__(self, a: str, b: str) -> int:
        return self.minutes.get((a, b), 10**6)


class SmartDesk(Desk):
    def __init__(self, world: World, level: int, now: int, params: Params, roads: Roads):
        super().__init__(world, level, now)
        self.p, self.roads = params, roads
        self.dealer_markup: dict[str, float] = {}
        self.held: dict[str, int] = {}  # order id -> minute won, waiting for a partner
        self.paired = 0

    # --- quotes -------------------------------------------------------------

    def markup_for(self, dealer: str) -> float:
        return self.dealer_markup.get(dealer, self.p.markup[self.level])

    def quote(self, request: PriceRequest) -> None:
        self.requests[request["id"]] = request
        if self.level <= 3:
            return super().quote(request)
        m = self.markup_for(request["dealerId"])
        cost = request["referenceFeeCents"] * self.p.fee_base[self.level]
        prices = {}
        for option in request["options"]:
            price = int(option["listPriceCents"] * m)
            prices[option["kind"]] = price if cost <= self.p.max_cost_share * price else option["listPriceCents"] * 10
        self.outbox.append({"type": "quote", "requestId": request["id"], "prices": prices})

    def learn(self, request_id: str, won: bool) -> None:
        request = self.requests.get(request_id)
        if request is None or self.level <= 3:
            return
        m = self.markup_for(request["dealerId"]) * (self.p.win_step if won else self.p.loss_step)
        self.dealer_markup[request["dealerId"]] = min(self.p.max_markup, max(self.p.min_markup, m))

    def handle(self, event) -> None:
        if event["kind"] == "order_lost":
            self.learn(event["requestId"], False)
        elif event["kind"] == "order_won":
            self.learn(event["order"]["id"], True)
        elif event["kind"] == "order_cancelled":
            self.held.pop(event["orderId"], None)
        super().handle(event)

    # --- fees ---------------------------------------------------------------

    def fees_for(self, order: Order, cars: int) -> list[FeeStep]:
        fee = self.requests[order["id"]]["referenceFeeCents"] * cars / len(order["legs"]) * self.p.fee_base[self.level]
        if order["id"] in self.urgent:
            return starter.steep(self.now, fee, self.level)
        return starter.rising(self.now, fee, self.level)

    # --- batching -------------------------------------------------------------

    def win(self, order: Order) -> None:
        if order["id"] not in self.requests or order["id"] in self.orders:
            return
        self.orders[order["id"]] = order
        if self.can_pair(order):
            self.held[order["id"]] = self.now
        else:
            self.post(order, starter.undelivered(order))

    def can_pair(self, order: Order) -> bool:
        if not self.p.batch or self.level < 3 or len(order["legs"]) != 1 or self.requests[order["id"]]["note"]:
            return False
        leg = order["legs"][0]
        if leg["pickup"]["privateAddress"] or leg["delivery"]["privateAddress"]:
            return False
        return order["lastPickupAt"] - self.now > self.p.hold + 6 * HOUR

    def pair_cost(self, a: Order, b: Order) -> Optional[int]:
        """Link minutes if one driver can take a then b inside both windows and the 12-hour rule."""
        la, lb = a["legs"][0], b["legs"][0]
        drive_a = self.roads(la["pickup"]["placeId"], la["delivery"]["placeId"])
        link = self.roads(la["delivery"]["placeId"], lb["pickup"]["placeId"])
        drive_b = self.roads(lb["pickup"]["placeId"], lb["delivery"]["placeId"])
        if link > self.p.max_link or drive_a + link + drive_b > 12 * HOUR:
            return None
        start = max(self.now + HOUR, la["pickup"]["window"]["from"])
        if start > la["pickup"]["window"]["to"]:
            return None
        arrive_a = start + drive_a
        if arrive_a > a["deadline"]:
            return None
        pick_b = max(arrive_a + link, lb["pickup"]["window"]["from"])
        # Waiting more than 2 hours between cars makes the pair worse than two gigs.
        if pick_b > lb["pickup"]["window"]["to"] or pick_b - (arrive_a + link) > 2 * HOUR:
            return None
        if pick_b + drive_b > b["deadline"] - HOUR:
            return None
        return link

    def flush(self, force: bool = False) -> None:
        """Pairs held orders with CP-SAT (max fee saved), posts pairs and orders held too long."""
        live = {oid: t for oid, t in self.held.items() if oid in self.orders}
        self.held = live
        if not live:
            return
        ids = list(live)
        fee = {oid: self.requests[oid]["referenceFeeCents"] for oid in ids}
        model = cp_model.CpModel()
        pairs = {}
        for a in ids:
            for b in ids:
                if a == b:
                    continue
                link = self.pair_cost(self.orders[a], self.orders[b])
                if link is not None:
                    gain = int((1 - self.p.combine) * (fee[a] + fee[b])) - link * 40
                    if gain > 0:
                        pairs[(a, b)] = (model.NewBoolVar(f"{a}>{b}"), gain)
        chosen: list[tuple[str, str]] = []
        if pairs:
            for oid in ids:
                model.AddAtMostOne([v for (a, b), (v, _) in pairs.items() if oid in (a, b)])
            model.Maximize(sum(g * v for v, g in pairs.values()))
            solver = cp_model.CpSolver()
            solver.parameters.max_time_in_seconds = 0.5
            if solver.Solve(model) in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                chosen = [k for k, (v, _) in pairs.items() if solver.Value(v)]
        for a, b in chosen:
            self.post_pair(self.orders[a], self.orders[b])
            self.held.pop(a), self.held.pop(b)
        for oid, since in list(self.held.items()):
            order = self.orders[oid]
            if force or self.now - since >= self.p.hold or order["lastPickupAt"] - self.now < 6 * HOUR:
                self.held.pop(oid)
                self.post(order, starter.undelivered(order))

    def post_pair(self, a: Order, b: Order) -> None:
        stops = stops_for(a, [0], None, Retry()) + stops_for(b, [0], None, Retry())
        stops = without_windows(stops, self.now)
        premium = a["legs"][0]["car"]["premium"] or b["legs"][0]["car"]["premium"]
        fee = (self.requests[a["id"]]["referenceFeeCents"] + self.requests[b["id"]]["referenceFeeCents"]) * self.p.combine * self.p.fee_base[self.level]
        self.outbox.append({"type": "post", "stops": stops, "audience": {"experienced": premium, "manualLicence": False},
                            "schedule": starter.rising(self.now, fee, self.level)})
        self.paired += 1

    # A paired gig carries two orders: when one order needs it back, both go out again as single gigs.

    def withdraw(self, order_id: str) -> bool:
        self.send_post_of(order_id)
        gigs = self.gigs_of(order_id)
        if any(g in self.booked for g in gigs):
            return False
        others = {s["orderId"] for g in gigs for s in self.posts[g]["stops"]} - {order_id}
        for oid in [order_id, *others]:
            self.leg_gigs.pop(oid, None)
        self.outbox += [{"type": "withdraw", "gigId": g} for g in gigs]
        for oid in others:
            if oid in self.orders:
                self.post(self.orders[oid], starter.undelivered(self.orders[oid]))
        return True

    def repost(self, gig_id: str) -> None:
        action = self.posts.get(gig_id)
        if action is None:
            return
        orders = list(dict.fromkeys(s["orderId"] for s in action["stops"]))
        if len(orders) == 1:
            return super().repost(gig_id)
        for oid in orders:
            if self.leg_gigs.get(oid, {}).get(0) != gig_id or oid not in self.orders:
                continue
            self.leg_gigs[oid].pop(0, None)
            order = self.orders[oid]
            stops = without_windows(stops_for(order, [0], None, Retry()), float("inf"))
            self.outbox.append({"type": "post", "stops": stops, "audience": {"experienced": order["legs"][0]["car"]["premium"], "manualLicence": False},
                                "schedule": self.fees_for(order, 1)})


def play_practice(world: World, level: int, params: Params, roads: Roads, quiet: bool = False) -> dict:
    snapshot = world.snapshot()
    desk, ends_at = SmartDesk(world, level, snapshot["now"], params, roads), snapshot["endsAt"]
    while desk.now < ends_at:
        day, midnight = desk.now // DAY, (desk.now // DAY + 1) * DAY
        desk.flush()
        limit = min(ends_at, midnight)
        if desk.held:
            limit = min(limit, desk.now + 10)
        actions, desk.outbox = desk.outbox, []
        step = world.advance(until=WAKE_ON, max=limit, actions=actions)
        desk.read_results(actions, step["results"])
        desk.now = step["now"]
        for event in step["events"]:
            desk.handle(event)
        if desk.now // DAY > day and not quiet:
            report(WEEKDAYS[day % 7], world.score())
    score = world.score()
    score["paired"] = desk.paired
    return score


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--level", type=int, choices=range(1, 9), default=8)
    parser.add_argument("--seed")
    parser.add_argument("--board", action="store_true")
    parser.add_argument("--no-batch", action="store_true")
    args = parser.parse_args()
    params = default_params()
    params.batch = not args.no_batch
    try:
        client = Client()
        roads = Roads(client.map())
        world = client.create(level=args.level, seed=args.seed, board=args.board)
        print(f"World {world.id}, level {args.level}, batch={params.batch}", flush=True)
        try:
            score = play_practice(world, args.level, params, roads)
        except BaseException:
            if not args.board:
                world.delete()
            raise
        report("End", score)
        print(f"paired gigs: {score['paired']}  ranked: {score['ranked']}")
    except SpreadError as error:
        sys.exit(f"spread: {error}")


if __name__ == "__main__":
    main()
