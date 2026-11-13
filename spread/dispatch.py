"""Spread dispatcher: the kit starter plus adaptive quotes and OR-Tools gig pairing.

Run: python dispatch.py --level 8 --seed s1   (needs SPREAD_URL, SPREAD_KEY)
"""
from __future__ import annotations

import argparse
import math
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
    winprob: bool = True
    win_scale: float = 0.08
    win_lr: float = 0.03
    ramp: bool = True
    ramp_open: float = 1.0
    ramp_close: float = 1.6
    ramp_lead: int = 8 * HOUR
    on_time_target: float = 0.95
    caution_gain: float = 10.0
    town_risk: float = 0.0
    min_slack: int = 3 * HOUR
    urgent_lead: int = 6 * HOUR
    max_backlog: int = 15
    backlog_free: int = 5
    backlog_cost: float = 0.05


def default_params() -> Params:
    return Params(
        markup={1: 1.0, 2: 1.0, 3: 1.0, 4: 1.05, 5: 1.05, 6: 1.08, 7: 1.3, 8: 1.45},
        fee_base={1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.0, 6: 1.05, 7: 1.3, 8: 1.35},
    )


class WinModel:
    """Online logistic model: P(win) = sigmoid((threshold - price/list) / scale).
    Threshold = base + offsets for dealer, pickup place and delivery place, as the
    competitor's price is list x lane x day factors and dealers differ."""

    def __init__(self, base: float, scale: float, lr: float):
        self.base, self.scale, self.lr = base, scale, lr
        self.offset: dict[str, float] = {}

    @staticmethod
    def keys(request: PriceRequest) -> list[str]:
        leg = request["legs"][0]
        return [f"d:{request['dealerId']}", f"p:{leg['pickup']['placeId']}", f"q:{leg['delivery']['placeId']}"]

    def threshold(self, keys: list[str]) -> float:
        return self.base + sum(self.offset.get(k, 0.0) for k in keys)

    def p_win(self, keys: list[str], x: float) -> float:
        z = (self.threshold(keys) - x) / self.scale
        return 1 / (1 + math.exp(-max(-30.0, min(30.0, z))))

    def update(self, keys: list[str], x: float, won: bool) -> None:
        grad = (float(won) - self.p_win(keys, x)) * self.lr
        # The base moves with the day factor and price war; offsets learn lanes and dealers.
        self.base += grad
        for k in keys:
            self.offset[k] = self.offset.get(k, 0.0) + grad


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
        self.model = WinModel(params.markup[level] + 0.05, params.win_scale, params.win_lr)
        self.on_time, self.late = 0, 0
        self.stress: dict[str, int] = {}  # pickup place -> times its cars struggled to find a driver
        self.fee_ratio = params.fee_base[level]  # booked fee / typical fee, learned
        self.quoted: dict[str, float] = {}  # request id -> lowest quoted price/list ratio
        self.held: dict[str, int] = {}  # order id -> minute won, waiting for a partner
        self.paired = 0

    # --- quotes -------------------------------------------------------------

    def markup_for(self, dealer: str) -> float:
        return self.dealer_markup.get(dealer, self.p.markup[self.level])

    def quote(self, request: PriceRequest) -> None:
        self.requests[request["id"]] = request
        if self.level <= 3:
            return super().quote(request)
        if self.p.winprob:
            return self.quote_winprob(request)
        m = self.markup_for(request["dealerId"])
        cost = request["referenceFeeCents"] * self.p.fee_base[self.level]
        prices = {}
        for option in request["options"]:
            price = int(option["listPriceCents"] * m)
            prices[option["kind"]] = price if cost <= self.p.max_cost_share * price else option["listPriceCents"] * 10
        self.outbox.append({"type": "quote", "requestId": request["id"], "prices": prices})

    def quote_winprob(self, request: PriceRequest) -> None:
        """Quotes the price/list ratio that maximises P(win) x (price - cost)."""
        backlog = self.backlog()
        if backlog >= self.p.max_backlog:
            prices = {o["kind"]: o["listPriceCents"] * 10 for o in request["options"]}
            self.outbox.append({"type": "quote", "requestId": request["id"], "prices": prices})
            return
        crowd = (1 + self.p.backlog_cost * max(0, backlog - self.p.backlog_free)) * self.caution()
        place = request["legs"][0]["pickup"]["placeId"]
        crowd *= 1 + self.p.town_risk * self.stress.get(place, 0)
        cost = request["referenceFeeCents"] * self.fee_ratio * crowd / self.p.max_cost_share
        keys = self.model.keys(request)
        prices = {}
        leg = request["legs"][0]
        drive = sum(self.roads(l["pickup"]["placeId"], l["delivery"]["placeId"]) for l in request["legs"])
        ready = leg["pickup"]["window"]["from"]
        for option in request["options"]:
            listed = option["listPriceCents"]
            best, best_x = 0.0, None
            if option["deadline"] - max(ready, self.now) - drive < self.p.min_slack:
                prices[option["kind"]] = listed * 10
                continue
            for i in range(56):
                x = 0.9 + i * 0.02
                gain = self.model.p_win(keys, x) * (x * listed - cost)
                if gain > best:
                    best, best_x = gain, x
            prices[option["kind"]] = int(listed * best_x) if best_x else listed * 10
        self.quoted[request["id"]] = min(prices[o["kind"]] / o["listPriceCents"] for o in request["options"])
        self.outbox.append({"type": "quote", "requestId": request["id"], "prices": prices})

    def order_of(self, gig_id) -> str:
        action = self.posts.get(gig_id or "")
        return action["stops"][0]["orderId"] if action else ""

    def caution(self) -> float:
        """Above 1 when our own on-time share drifts under target: costs look higher, so we win fewer, safer cars."""
        done = self.on_time + self.late
        if done < 15:
            return 1.0
        return 1 + self.p.caution_gain * max(0.0, self.p.on_time_target - self.on_time / done)

    def record_delivery(self, order_id: str, at: int) -> None:
        order = self.orders.get(order_id)
        if order is None or any(d is None for d in order["deliveredAt"]):
            return
        if at <= order["deadline"]:
            self.on_time += 1
        else:
            self.late += 1

    def backlog(self) -> int:
        """Won orders still waiting for a driver: more of them means late cars."""
        waiting = 0
        for oid, order in self.orders.items():
            if all(d is not None for d in order["deliveredAt"]):
                continue
            gigs = self.gigs_of(oid)
            if oid in self.held or not gigs or not all(g in self.booked for g in gigs):
                waiting += 1
        return waiting

    def learn_fee(self, gig_id: str, fee: int) -> None:
        action = self.posts.get(gig_id)
        if action is None:
            return
        ref = sum(self.requests[s["orderId"]]["referenceFeeCents"] / len(self.requests[s["orderId"]]["legs"])
                  for s in action["stops"] if s["kind"] == "pickup" and s["orderId"] in self.requests)
        if ref > 0:
            self.fee_ratio += 0.1 * (fee / ref - self.fee_ratio)

    def learn(self, request_id: str, won: bool) -> None:
        request = self.requests.get(request_id)
        if request is None or self.level <= 3:
            return
        x = self.quoted.get(request_id)
        if x is not None and x < 5:
            self.model.update(self.model.keys(request), x, won)
        m = self.markup_for(request["dealerId"]) * (self.p.win_step if won else self.p.loss_step)
        self.dealer_markup[request["dealerId"]] = min(self.p.max_markup, max(self.p.min_markup, m))

    def handle(self, event) -> None:
        if event["kind"] == "order_lost":
            self.learn(event["requestId"], False)
        elif event["kind"] == "order_won":
            self.learn(event["order"]["id"], True)
        elif event["kind"] == "delivered":
            super().handle(event)
            return self.record_delivery(event["orderId"], event["at"])
        elif event["kind"] in ("deadline_close", "gig_expired", "no_show"):
            order = self.orders.get(event.get("orderId") or self.order_of(event.get("gigId")))
            if order is not None:
                place = order["legs"][0]["pickup"]["placeId"]
                self.stress[place] = self.stress.get(place, 0) + 1
        elif event["kind"] == "gig_booked":
            self.learn_fee(event["gigId"], event["feeCents"])
        elif event["kind"] == "order_cancelled":
            self.held.pop(event["orderId"], None)
        elif event["kind"] == "order_changed":
            # A held order has no gig yet: the base change() posts it, so it must stop waiting.
            self.held.pop(event["order"]["id"], None)
        super().handle(event)

    # --- fees ---------------------------------------------------------------

    def fees_for(self, order: Order, cars: int) -> list[FeeStep]:
        fee = self.requests[order["id"]]["referenceFeeCents"] * cars / len(order["legs"]) * self.p.fee_base[self.level]
        if order["id"] in self.urgent:
            return starter.steep(self.now, fee, self.level)
        if self.p.ramp and self.level >= 2:
            return self.ramp(fee / self.p.fee_base[self.level], order["lastPickupAt"])
        return starter.rising(self.now, fee, self.level)

    def ramp(self, ref: float, last_pickup: int) -> list[FeeStep]:
        """Opens low and climbs to a high fee 4h before the last pickup, in 30-min steps.
        Cheap nearby drivers book early; a slow climb keeps drivers from learning big raises."""
        end = max(self.now + HOUR, last_pickup - self.p.ramp_lead)
        steps = max(1, min(48, (end - self.now) // 30))
        c = self.caution()
        lo, hi = self.p.ramp_open * ref * c, self.p.ramp_close * ref * c
        return [{"at": self.now + k * (end - self.now) // steps, "feeCents": max(1, int(lo + (hi - lo) * k / steps))}
                for k in range(steps + 1)][:48]

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

    def escalate(self) -> None:
        """Steep fees from `urgent_lead` before the last pickup, earlier than the world's 3h warning."""
        for oid, order in list(self.orders.items()):
            if oid in self.urgent or oid in self.held or order["status"] != "waiting":
                continue
            gigs = self.gigs_of(oid)
            if gigs and not any(g in self.booked for g in gigs) and self.now >= order["lastPickupAt"] - self.p.urgent_lead:
                self.raise_fees(oid)

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
        desk.escalate()
        limit = min(ends_at, midnight, desk.now + 30)
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
