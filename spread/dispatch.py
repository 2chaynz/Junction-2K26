"""The starter: a whole dispatch system that you can read in five minutes, then change. HANDBOOK.md says
what it does and how to run it (`spread-starter --help` lists the options).

To change it, copy this file and run the copy: python dispatch.py
"""
from __future__ import annotations

import argparse
import contextlib
import re
import sys
import time
from typing import NamedTuple, Optional

from spread.client import Client, SpreadError, Unreachable, World
from spread.types import (
    Action, ActionResult, Audience, DeskEvent, DeskEventKind, DeskSnapshot, FeeStep, Gig, Note, Order, PostAction, PriceRequest,
    Score, StopRef, TimeWindow,
)

import json, math, os
HOUR, DAY = 60, 24 * 60
P = {"qm": 1.0, "opt": "first", "f0": 1.0, "fstep": 0.10, "fn": 6, "fint": 60, "s0": 1.5, "sstep": 0.25, "sn": 5, "sint": 30, "trust": 0.0, "ramp": 0, "f1": 1.4, "rn": 8, "minslack": 0, "lowslack": 600, "lowmult": 1.0, "suplo": 0, "supmult": 1.3, "supdecl": 0, "offer": 0, "ofee": 0.6, "orad": 30, "onear": 30, "omax": 6, "rq": 0, "model": 0, "cc": 1.1, "eta": 0.08, "mmin": 0.9, "cm": 0, "ccm": 1.0, "lam": 0.5, "u": 0, "ra": 0.0, "tvk": 0.0, "tvp": 12500, "resc": 0, "rescfee": 1.5, "rescn": 3, "sd": 0, "sdslack": 480, "sdmult": 1.15, "sdsup": 40, "etad": 0.0, "etap": 0.0, "r0": 0.04, "u1": 1.3, "u2": 1.7, "u3": 2.2, "t1": 600, "t2": 420, "t3": 300, "chain": 0, "sdonly": 1, "sdrisk": 1.0, "blsd": 9999, "blq": 9999, "blk": 0.5, "ufix": 0, "lsf": 1.0, "lsn": 5, "bundle": 0, "bf": 0.8, "brad": 30, "blink": 40, "bmax": 660, "bspare": 240, "bwait": 120, "bsplit": 480, "sf0": 1.1, "mle": 0, "mprec": 2.0, "mdecay": 0.995, "cfee": 0.7, "crad": 30, "cn": 2}
_best = os.path.join(os.path.dirname(os.path.abspath(__file__)), "best_params.json")
if "SPREAD_PARAMS" not in os.environ and os.path.exists(_best):
    P.update(json.load(open(_best)))
P.update(json.loads(os.environ.get("SPREAD_PARAMS", "{}")))
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
# The events that need an answer. Views and account lines arrive with the next event that needs an answer.
QUIET = bool(os.environ.get("SPREAD_QUIET"))
WAKE_ON: list[DeskEventKind] = ["offer_answered", "price_request", "order_won", "order_changed", "order_cancelled", "visit_failed", "gig_expired", "deadline_close"]


class Retry(NamedTuple):
    """How to post a leg again after a failed visit."""
    pickup_from: int = 0
    manual_licence: bool = False
    plates: bool = False


ROADS: dict = {}


def road_minutes(a: str, b: str) -> int:
    if not ROADS:
        from spread.client import Client as _C
        for r in _C().map()["roads"]:
            ROADS[(r["from"], r["to"])] = r["minutes"]
    return ROADS.get((a, b), 0)


PLACES: dict = {}


def supply(world, place: str) -> int:
    """Drivers living within 80 km of a place (straight line); the roster is fetched once per run."""
    import math
    cache = getattr(world, "_supply", None)
    if cache is None:
        if not PLACES:
            from spread.client import Client as _C
            for p in _C().map()["places"]:
                PLACES[p["id"]] = p
        homes = [d["homePlaceId"] for d in world.roster()]
        cache = world._supply = {}
        for pid, a in PLACES.items():
            n = 0
            for h in homes:
                b = PLACES[h]
                x = (a["lon"] - b["lon"]) * math.cos(math.radians((a["lat"] + b["lat"]) / 2))
                if 111 * math.hypot(x, a["lat"] - b["lat"]) <= 80:
                    n += 1
            cache[pid] = n
    return cache.get(place, 0)


def near(world, place: str, r: float = 30) -> int:
    """Drivers living within r km of a place."""
    cache = world.__dict__.setdefault("_near", {})
    if (place, r) not in cache:
        if not PLACES:
            km(place, place)
        homes = getattr(world, "_homes_list", None)
        if homes is None:
            homes = world._homes_list = [d["homePlaceId"] for d in world.roster()]
        cache[(place, r)] = sum(1 for h in homes if km(h, place) <= r)
    return cache[(place, r)]


def km(a: str, b: str) -> float:
    import math
    if not PLACES:
        from spread.client import Client as _C
        for p in _C().map()["places"]:
            PLACES[p["id"]] = p
    A, B = PLACES[a], PLACES[b]
    x = (A["lon"] - B["lon"]) * math.cos(math.radians((A["lat"] + B["lat"]) / 2))
    return 111 * math.hypot(x, A["lat"] - B["lat"])


MODEL: dict = {}


def load_model() -> dict:
    if not MODEL:
        import pathlib
        MODEL.update(json.loads((pathlib.Path(__file__).with_name("model.json")).read_text()))
    return MODEL


CM: dict = {}


def cost_model():
    if not CM:
        import pathlib, pickle
        CM["m"] = pickle.loads(pathlib.Path(__file__).with_name("cost_model.pkl").read_bytes())
    return CM["m"]


def predict_cost(world, request) -> tuple[float, float]:
    """Expected all-in cost as a multiple of the typical fee, and the chance the order is late."""
    import collections
    import featlib
    cache = getattr(world, "_homes", None)
    if cache is None:
        supply(world, request["legs"][0]["pickup"]["placeId"])
        cache = world._homes = collections.Counter(d["homePlaceId"] for d in world.roster())
        for r in __import__("spread.client", fromlist=["Client"]).Client().map()["roads"]:
            ROADS[(r["from"], r["to"])] = r["minutes"]
    reg, clf = cost_model()
    x = [featlib.feats(request, cache, PLACES, ROADS)]
    return float(reg.predict(x)[0]), float(clf.predict_proba(x)[0][1])


class Desk:
    """What the starter remembers, and its answer to each event. The answers wait in the outbox
    until the starter sends them, and the world applies them at the current minute."""

    def __init__(self, world: World, level: int, now: int):
        self.world, self.level, self.now = world, level, now
        self.outbox: list[Action] = []  # the actions decided since the starter last sent
        self.requests: dict[str, PriceRequest] = {}
        self.orders: dict[str, Order] = {}  # the orders won and not cancelled
        self.leg_gigs: dict[str, dict[int, str]] = {}  # order id -> leg -> the gig that carries the leg
        self.booked: set[str] = set()  # the gigs that a driver holds now
        self.posts: dict[str, PostAction] = {}  # gig id -> the post that made it
        self.urgent: set[str] = set()  # the orders whose deadline warning has come
        self.trust: dict[str, int] = {}  # dealer id -> orders delivered on time (level 8 trust count)
        self.late_seen: set[str] = set()
        self.at_risk: set[str] = set()
        self.won_n = 0
        self.bias = 0.0
        self.obs: list[tuple[float, float]] = []
        self.dealer_reqs: dict[str, int] = {}
        self.bias_d: dict[int, float] = {}
        self.bias_p: dict[tuple, float] = {}
        self.pending_q: dict[str, tuple] = {}
        self.offer_queue: dict[str, list[str]] = {}
        self.offer_fee: dict[str, int] = {}
        self.offers_day: dict = {}
        self.drivers_home: Optional[list] = None
        self.dealer_of: dict[str, str] = {}
        self.gig_driver: dict[str, str] = {}  # booked gig -> its driver
        self.chain_sent: set = set()  # (driver, gig) offers already sent
        self.bundles: dict[str, int] = {}  # two-car gig -> minute to split it if still unbooked
        self.nobundle: set[str] = set()  # orders taken out of a two-car gig: they go alone from then on
        self.nb = 0

    def rejoin(self, snapshot: DeskSnapshot, history: list[DeskEvent]) -> None:
        """Rebuilds what it knows from the world, so a starter that stopped keeps its orders. Then answers
        what it missed: open requests, orders without a gig, failed visits without a new gig, and the
        deadline warnings, so the orders that had one keep their steep fees."""
        posted: dict[str, list[Gig]] = {}  # order id -> its gigs, oldest first
        self.booked = {gig["id"] for gig in snapshot["gigs"] if gig["status"] in ("booked", "working", "done")}
        for gig in snapshot["gigs"]:
            posted.setdefault(gig["stops"][0]["orderId"], []).append(gig)
            if gig["status"] in ("open", "booked", "working"):
                self.carry({"type": "post", "stops": gig["stops"], "audience": gig["audience"], "schedule": gig["schedule"]}, gig["id"])
        self.requests = {e["request"]["id"]: e["request"] for e in history if e["kind"] == "price_request"}
        self.dealer_of = {rid: r["dealerId"] for rid, r in self.requests.items()}
        for e in history:
            if e["kind"] == "ledger":
                self.ledger(e["line"])
        self.urgent = {e["orderId"] for e in history if e["kind"] == "deadline_close"}
        self.orders = {o["id"]: o for o in snapshot["orders"] if o["id"] in self.requests and o["status"] != "cancelled"}
        for order in self.orders.values():
            if order["status"] == "waiting" and not self.gigs_of(order["id"]):
                self.post(order, undelivered(order))
        for event in history:
            order = self.orders.get(event.get("orderId", ""))
            if order is None:
                continue
            if event["kind"] == "visit_failed" and order["deliveredAt"][event["leg"]] is None:
                later = [g for g in posted.get(order["id"], []) if g["postedAt"] >= event["at"] and g["id"] != event["gigId"]]
                if not any(stop["leg"] == event["leg"] for gig in later for stop in gig["stops"]):
                    self.retry(order["id"], event["leg"], event["reason"])
        for request in snapshot["openRequests"]:
            self.quote(request)

    def handle(self, event: DeskEvent) -> None:
        if event["kind"] == "price_request":
            self.quote(event["request"])
        elif event["kind"] == "order_won":
            self.win(event["order"])
        elif event["kind"] == "order_changed":
            self.change(event["order"])
        elif event["kind"] == "order_cancelled":  # the world has stopped the car and told each of its gigs what happens
            for books in (self.orders, self.leg_gigs):
                books.pop(event["orderId"], None)
            for g in event.get("gigs", []):
                if g["outcome"] == "withdrawn":
                    self.unbundle(g["gigId"], skip=event["orderId"])
        elif event["kind"] == "visit_failed":
            self.retry(event["orderId"], event["leg"], event["reason"])
        elif event["kind"] == "gig_expired":
            self.repost(event["gigId"])
        elif event["kind"] == "deadline_close":  # it comes again when a driver drops the car after the first warning
            self.raise_fees(event["orderId"])
        elif event["kind"] == "gig_booked":
            post = self.posts.get(event["gigId"])
            if post:
                self.at_risk.discard(post["stops"][0]["orderId"])
            self.booked.add(event["gigId"])
            self.offer_queue.pop(event["gigId"], None)
            self.gig_driver[event["gigId"]] = event["driverId"]
            if P["chain"]:
                self.chain_from(event["driverId"], event["gigId"])
        elif event["kind"] == "offer_answered":
            if event["answer"] != "accepted" and event["gigId"] not in self.booked:
                self.next_offer(event["gigId"])
        elif event["kind"] in ("gig_dropped", "no_show"):  # after a no-show the gig is open again; a late driver still comes
            self.booked.discard(event["gigId"])
            self.gig_driver.pop(event["gigId"], None)
        elif event["kind"] == "order_lost" and event["requestId"] in self.pending_q:
            self.learn(event["requestId"], 0.0)
        elif event["kind"] == "ledger":
            self.ledger(event["line"])
        if self.bundles:
            self.tick()
        if event["kind"] == "delivered":
            self.delivered(event["orderId"], event["leg"], event["at"])
            d = self.gig_driver.pop(event["gigId"], None)
            if d and P["chain"]:
                self.chain_from(d, event["gigId"])

    def ledger(self, line) -> None:
        oid = line.get("orderId")
        order = self.orders.get(oid) if oid else None
        dealer = order["dealerId"] if order else self.dealer_of.get(oid)
        if dealer is None:
            return
        if line["kind"] == "revenue":
            self.trust[dealer] = min(25, self.trust.get(dealer, 0) + 1)
        elif line["kind"] == "late_refund" and oid not in self.late_seen:
            self.late_seen.add(oid)
            self.trust[dealer] = max(0, self.trust.get(dealer, 0) - 1) // 2

    def risk(self) -> float:
        return (len(self.late_seen) + len(self.at_risk)) / max(40, self.won_n)

    def backlog(self) -> int:
        """Won orders with an undelivered car that no driver holds: the capacity we already owe."""
        n = 0
        for oid, o in self.orders.items():
            if any(d is None for d in o["deliveredAt"]) and not any(g in self.booked for g in self.gigs_of(oid)):
                n += 1
        return n

    def delivered(self, order_id: str, leg: int, at: int) -> None:
        self.at_risk.discard(order_id)
        self.leg_gigs.get(order_id, {}).pop(leg, None)
        if order_id in self.orders:
            self.orders[order_id]["deliveredAt"][leg] = at

    def quote(self, request: PriceRequest) -> None:
        self.requests[request["id"]] = request
        self.dealer_of[request["id"]] = request["dealerId"]
        self.dealer_reqs[request["dealerId"]] = self.dealer_reqs.get(request["dealerId"], 0) + 1
        opts = request["options"]
        chosen = opts[:1] if P["opt"] == "first" else opts[-1:] if P["opt"] == "last" else opts
        if P["opt"] == "nosame":
            chosen = [o for o in opts if o["kind"] != "same_day"]
        # estimated slack: time from when a driver could start to the last pickup that still delivers by the deadline
        def slack_of(o):
            leg0 = request["legs"][0]
            drive = sum(road_minutes(l["pickup"]["placeId"], l["delivery"]["placeId"]) for l in request["legs"])
            start = max(request["respondBy"] + 15, leg0["pickup"]["window"]["from"])
            return min(o["deadline"] - drive, leg0["pickup"]["window"]["to"]) - (request["respondBy"] + 15)
        kept = []
        mults = {}
        for o in chosen:
            sl = slack_of(o)
            if sl < P["minslack"]:
                continue
            kept.append(o)
            mults[o["kind"]] = P["lowmult"] if sl < P["lowslack"] else 1.0
        chosen = kept
        leg0 = request["legs"][0]
        sdo = next((o for o in opts if o["kind"] == "same_day"), None)
        bl = self.backlog()
        if os.environ.get("BLLOG"):
            print("BL", request["arrivedAt"], bl, file=sys.stderr)
        sd_ok = bool(P["sd"] and sdo is not None and self.risk() < P["sdrisk"] and bl < P["blsd"] and P["opt"] == "nosame" and slack_of(sdo) >= P["sdslack"] and supply(self.world, leg0["pickup"]["placeId"]) >= P["sdsup"]
                     and not leg0["pickup"]["privateAddress"] and not leg0["delivery"]["privateAddress"] and len(request["legs"]) == 1)
        if not chosen and sd_ok and P["sdonly"]:
            chosen, mults = [sdo], {"same_day": P["sdmult"]}
        if P["suplo"] or P["supdecl"]:
            n80 = supply(self.world, request["legs"][0]["pickup"]["placeId"])
            if n80 < P["supdecl"]:
                chosen = []
            elif n80 < P["suplo"]:
                mults = {k: v * P["supmult"] for k, v in mults.items()}
        if not chosen:
            self.outbox.append({"type": "quote", "requestId": request["id"], "prices": {opts[0]["kind"]: opts[0]["listPriceCents"] * 5}})
            return
        if P["model"] and chosen:
            mdl = load_model()
            leg0 = request["legs"][0]
            o0 = chosen[0]
            feats = [f"dealer:{request['dealerId']}", f"pk:{leg0['pickup']['placeId']}", f"dl:{leg0['delivery']['placeId']}", f"k:{o0['kind']}", f"day:{request['arrivedAt'] // DAY}"]
            day = request["arrivedAt"] // DAY
            pkey = (day, leg0["pickup"]["placeId"])
            base = mdl["icpt"] + sum(mdl["w"].get(f, 0.0) for f in feats) + self.bias + self.bias_d.get(day, 0.0) + self.bias_p.get(pkey, 0.0)
            tr = 1 + P["trust"] * self.trust.get(request["dealerId"], 0) / 100
            cost = request["referenceFeeCents"] * P["cc"] * max(mults.values())
            if P["suplo"] and supply(self.world, leg0["pickup"]["placeId"]) < P["suplo"]:
                cost *= P["supmult"]
            plate = 0.0
            if P["cm"]:
                pc, plate = predict_cost(self.world, request)
                cost = request["referenceFeeCents"] * pc * P["ccm"] * (1 + P["ra"] * max(0.0, self.risk() - P["r0"]))
                if bl > P["blq"]:
                    cost *= 1 + P["blk"] * (bl - P["blq"]) / P["blq"]
            tv = 0.0
            if P["tvk"] and self.trust.get(request["dealerId"], 0) < 25:
                dayf = request["arrivedAt"] / DAY
                per_day = self.dealer_reqs.get(request["dealerId"], 1) / max(0.5, dayf - 0.33)
                tv = P["tvk"] * 0.01 * per_day * max(0.0, 4.75 - dayf) * 0.25 * P["tvp"]
            best, bm = 0.0, None
            for i in range(0, 160):
                m = P["mmin"] + i * 0.01
                p = 1 / (1 + math.exp(-(base + mdl["slope"] * math.log(m / tr))))
                gain = (m * o0["listPriceCents"] * (1 - P["lam"] * plate) - cost + tv * (1 - plate)) * p
                if gain > best:
                    best, bm = gain, m
            self.pending_q[request["id"]] = (base, math.log(bm / tr) if bm else None, day, pkey, base - self.bias)
            if bm is None:
                self.outbox.append({"type": "quote", "requestId": request["id"], "prices": {o0["kind"]: o0["listPriceCents"] * 5}})
                return
            prices = {o["kind"]: int(o["listPriceCents"] * bm) for o in chosen}
            if sd_ok and "same_day" not in prices:
                prices["same_day"] = int(sdo["listPriceCents"] * bm * P["sdmult"])
            elif "same_day" in prices:
                prices["same_day"] = int(sdo["listPriceCents"] * bm * P["sdmult"])
            self.outbox.append({"type": "quote", "requestId": request["id"], "prices": prices})
            return
        if P["rq"]:
            import random
            m = math.exp(random.Random(request["id"] + str(request["arrivedAt"])).uniform(math.log(1.0), math.log(2.4)))
            self.outbox.append({"type": "quote", "requestId": request["id"], "prices": {o["kind"]: int(o["listPriceCents"] * m) for o in chosen}})
            return
        self.outbox.append({"type": "quote", "requestId": request["id"], "prices": {o["kind"]: int(o["listPriceCents"] * P["qm"] * mults[o["kind"]] * (1 + P["trust"] * self.trust.get(request["dealerId"], 0) / 100)) for o in chosen}})

    def learn(self, rid: str, won: float) -> None:
        base, lmeff, day, pkey, base0 = self.pending_q.pop(rid)
        if lmeff is None:
            return
        mdl = load_model()
        if P["mle"]:
            self.fit_level(base0, mdl["slope"] * lmeff, won)
            return
        p = 1 / (1 + math.exp(-(base + mdl["slope"] * lmeff)))
        self.bias += P["eta"] * (won - p)
        self.bias = max(-2.0, min(2.0, self.bias))
        if P["etad"]:
            self.bias_d[day] = max(-2.0, min(2.0, self.bias_d.get(day, 0.0) + P["etad"] * (won - p)))
        if P["etap"]:
            self.bias_p[pkey] = max(-2.0, min(2.0, self.bias_p.get(pkey, 0.0) + P["etap"] * (won - p)))

    def fit_level(self, base0: float, slope_term: float, won: float) -> None:
        """The world's price level as one logit offset: the maximum-likelihood fit to every quote outcome so far,
        recent ones weighted more, with a prior that pulls it to the offline model when outcomes are few."""
        self.obs.append((base0 + slope_term, won))
        b, n = self.bias, len(self.obs)
        for _ in range(8):
            g, h = -P["mprec"] * b, P["mprec"]
            for i, (z, y) in enumerate(self.obs):
                w = P["mdecay"] ** (n - 1 - i)
                p = 1 / (1 + math.exp(-(z + b)))
                g += w * (y - p)
                h += w * p * (1 - p)
            b += g / h
        self.bias = max(-4.0, min(4.0, b))

    def win(self, order: Order) -> None:
        self.won_n += 1
        if order["id"] in self.pending_q:
            self.learn(order["id"], 1.0)
        if order["id"] in self.requests and order["id"] not in self.orders:  # rejoin can know it already
            self.orders[order["id"]] = order
            self.post(order, undelivered(order))

    def change(self, order: Order) -> None:
        if order["id"] in self.orders:
            self.orders[order["id"]] = order
            if self.withdraw(order["id"]):
                self.post(order, undelivered(order))

    def repost(self, gig_id: str) -> None:
        """Posts a gig again when one of its windows ended before a driver booked it."""
        action = self.posts.get(gig_id)
        # A gig the starter has already taken off and posted again, after a change of plan, needs nothing.
        if action is None or not any(self.leg_gigs.get(s["orderId"], {}).get(s["leg"]) == gig_id for s in action["stops"]):
            return
        for stop in action["stops"]:
            self.leg_gigs.get(stop["orderId"], {}).pop(stop["leg"], None)
        order = self.orders.get(action["stops"][0]["orderId"])
        if order is None:
            return
        # One of its windows has ended, perhaps at a site's closing time before the window's own end: post without its own stop windows.
        stops = without_windows(action["stops"], float("inf"))
        self.outbox.append({**action, "stops": stops, "schedule": self.gig_fees(action, order)})

    def raise_fees(self, order_id: str) -> None:
        """From the order's deadline warning on, its gigs that no driver holds go at the steep fees."""
        order = self.orders.get(order_id)
        if order is None:
            return
        self.urgent.add(order_id)
        self.at_risk.add(order_id)
        self.send_post_of(order_id)
        for gig_id in self.gigs_of(order_id):
            if gig_id not in self.booked:
                self.outbox.append({"type": "reprice", "gigId": gig_id, "schedule": self.gig_fees(self.posts[gig_id], order)})
                if P["resc"]:
                    self.rescue(order, gig_id)

    def gig_fees(self, action: PostAction, order: Order) -> list[FeeStep]:
        """Fees for a posted gig: a gig with cars of two orders is paid as one trip, from the tighter order's clock."""
        oids = list(dict.fromkeys(s_["orderId"] for s_ in action["stops"]))
        orders = [self.orders[o] for o in oids if o in self.orders]
        if len(orders) < 2:
            return self.fees_for(order, pickups(action))
        fee = P["bf"] * sum(self.requests[o["id"]]["referenceFeeCents"] * sum(1 for s_ in action["stops"] if s_["orderId"] == o["id"] and s_["kind"] == "pickup") / len(o["legs"]) for o in orders)
        tight = min(orders, key=lambda o: o["lastPickupAt"])
        return self.fees_for(tight, 1, fee=fee, urgent=any(o["id"] in self.urgent for o in orders))

    def fees_for(self, order: Order, cars: int, fee: Optional[float] = None, urgent: Optional[bool] = None) -> list[FeeStep]:
        """The fees for some of the order's cars from now: rising, or steep once its deadline warning has come."""
        if fee is None:
            fee = self.requests[order["id"]]["referenceFeeCents"] * cars / len(order["legs"])
        if urgent is None:
            urgent = order["id"] in self.urgent
        if P["lsf"] != 1.0 and near(self.world, order["legs"][0]["pickup"]["placeId"]) < P["lsn"]:
            fee *= P["lsf"]  # few drivers live near the pickup: pay for a trip from further away from the start
        if P["ramp"] and not urgent:
            end = order["lastPickupAt"] - 180
            n = P["rn"]
            if end - self.now < 30:
                return [{"at": self.now, "feeCents": max(1, int(fee * P["f1"] + 0.5))}]
            return [{"at": int(self.now + k * (end - self.now) / (n - 1)), "feeCents": max(1, int(fee * (P["f0"] + (P["f1"] - P["f0"]) * k / (n - 1)) + 0.5))} for k in range(n)]
        if urgent:
            return steep(self.now, fee, self.level)
        base = rising(self.now, fee, self.level)
        if order["id"] in self.nobundle:  # back from a two-car gig that found no driver: time is short, open high
            base = [{"at": self.now, "feeCents": max(1, int(fee * P["sf0"] + 0.5))}]
        if P["u"] and P["ufix"]:
            # Urgency steps that fall inside the opening ramp still count: fee at each time = the higher of both schedules.
            last = order["lastPickupAt"]
            pts = [(s_["at"], s_["feeCents"]) for s_ in base]
            pts += [(max(self.now, last - lead), int(fee * mult + 0.5)) for mult, lead in ((P["u1"], P["t1"]), (P["u2"], P["t2"]), (P["u3"], P["t3"]))]
            out, top = [], 0
            for at, f in sorted(pts):
                top = max(top, f)
                if out and out[-1]["at"] == at:
                    out[-1]["feeCents"] = top
                elif not out or top > out[-1]["feeCents"]:
                    out.append({"at": at, "feeCents": top})
            return out
        if P["u"]:
            last = order["lastPickupAt"]
            top = base[-1]["feeCents"]
            for mult, lead in ((P["u1"], P["t1"]), (P["u2"], P["t2"]), (P["u3"], P["t3"])):
                at = last - lead
                f = int(fee * mult + 0.5)
                if at > base[-1]["at"] and f >= top:
                    base.append({"at": at, "feeCents": f})
                    top = f
        return base

    def retry(self, order_id: str, leg: int, reason: str) -> None:
        if order_id in self.orders:
            order = self.orders[order_id]
            self.leg_gigs.get(order_id, {}).pop(leg, None)  # the world has taken the car out of the failed gig
            car_not_there = reason in ("not_ready", "closed")
            pickup_from = retry_from(order, self.requests[order_id], leg, self.now) if car_not_there else 0
            self.post(order, [leg], Retry(pickup_from, manual_licence=reason == "licence", plates=reason == "no_plates"))

    def post(self, order: Order, legs: list[int], retry: Retry = Retry()) -> None:
        # A premium car needs an experienced driver: the fine is €150 a car.
        request = self.requests[order["id"]]
        manual, _, _ = note_flags(request)
        audience: Audience = {"experienced": any(leg["car"]["premium"] for leg in order["legs"]), "manualLicence": retry.manual_licence or manual}
        stops = without_windows(stops_for(order, legs, request, retry), self.now)
        self.outbox.append({"type": "post", "stops": stops, "audience": audience, "schedule": self.fees_for(order, len(legs))})
        if len(legs) == 1:
            return
        # A trade-in over the 12-hour limit for a gig with two cars goes as one gig per car.
        self.send()
        if not self.gigs_of(order["id"]):
            for leg in legs:
                self.post(order, [leg], retry)

    def start_offers(self, action: PostAction, gig_id: str) -> None:
        """Direct offers to drivers who live near the delivery but not near the pickup: the app does not notify them, and the trip home is free."""
        if self.drivers_home is None:
            self.drivers_home = [(d["id"], d["homePlaceId"]) for d in self.world.roster()]
        order = self.orders.get(action["stops"][0]["orderId"])
        if order is None:
            return
        pick = next(s_ for s_ in action["stops"] if s_["kind"] == "pickup")
        dele = next(s_ for s_ in action["stops"] if s_["kind"] == "delivery")
        pp = order["legs"][pick["leg"]]["pickup"]["placeId"]
        dp = order["legs"][dele["leg"]]["delivery"]["placeId"]
        if km(pp, dp) < P["onear"]:
            return
        cands = sorted((km(h, dp), d) for d, h in self.drivers_home if km(h, dp) <= P["orad"] and km(h, pp) > 30)
        self.offer_queue[gig_id] = [d for _, d in cands][: P["omax"] * 4]
        self.offer_fee[gig_id] = max(1, int(self.requests[order["id"]]["referenceFeeCents"] * pickups(action) / len(order["legs"]) * P["ofee"]))
        for _ in range(3):
            self.next_offer(gig_id)

    def end_place(self, gig_id: str) -> Optional[str]:
        action = self.posts.get(gig_id)
        order = action and self.orders.get(action["stops"][-1]["orderId"])
        return order and order["legs"][action["stops"][-1]["leg"]]["delivery"]["placeId"]

    def start_place(self, gig_id: str) -> Optional[str]:
        action = self.posts.get(gig_id)
        order = action and self.orders.get(action["stops"][0]["orderId"])
        return order and order["legs"][action["stops"][0]["leg"]]["pickup"]["placeId"]

    def is_open(self, gig_id: str) -> bool:
        action = self.posts.get(gig_id)
        if action is None or gig_id in self.booked:
            return False
        s0 = action["stops"][0]
        return self.leg_gigs.get(s0["orderId"], {}).get(s0["leg"]) == gig_id and s0["orderId"] in self.orders

    def chain_offer(self, driver: str, gig_id: str) -> bool:
        """Offers an open gig to one of our drivers who finishes near its pickup: the trip there is nearly free for them."""
        day = self.now // DAY
        if (driver, gig_id) in self.chain_sent or self.offers_day.get((driver, day), 0) >= 3:
            return False
        action = self.posts[gig_id]
        order = self.orders[action["stops"][0]["orderId"]]
        self.chain_sent.add((driver, gig_id))
        self.offers_day[(driver, day)] = self.offers_day.get((driver, day), 0) + 1
        fee = self.requests[order["id"]]["referenceFeeCents"] * pickups(action) / len(order["legs"]) * P["cfee"]
        self.outbox.append({"type": "offer", "gigId": gig_id, "driverId": driver, "feeCents": max(1, int(fee))})
        return True

    def chain_from(self, driver: str, gig_id: str) -> None:
        """A driver of ours will be free where this gig ends: offer them the nearest open gigs that start there."""
        end = self.end_place(gig_id)
        if end is None:
            return
        cands = sorted((km(end, p), g) for g in list(self.posts) if self.is_open(g) and (p := self.start_place(g)) and km(end, p) <= P["crad"])
        n = 0
        for _, g in cands:
            if n >= P["cn"]:
                break
            n += self.chain_offer(driver, g)

    def chain_to(self, gig_id: str) -> None:
        """A new gig: offer it to our drivers whose current gig ends near its pickup."""
        start = self.start_place(gig_id)
        if start is None:
            return
        cands = sorted((km(e, start), d) for g, d in self.gig_driver.items() if (e := self.end_place(g)) and km(e, start) <= P["crad"])
        n = 0
        for _, d in cands:
            if n >= P["cn"]:
                break
            n += self.chain_offer(d, gig_id)

    def rescue(self, order: Order, gig_id: str) -> None:
        """Offers an unbooked gig at a high fee to the drivers who live nearest its pickup."""
        if self.drivers_home is None:
            self.drivers_home = [(d["id"], d["homePlaceId"]) for d in self.world.roster()]
        action = self.posts[gig_id]
        pick = next(s_ for s_ in action["stops"] if s_["kind"] == "pickup")
        pp = order["legs"][pick["leg"]]["pickup"]["placeId"]
        cands = sorted((km(h, pp), d) for d, h in self.drivers_home if km(h, pp) <= 80)
        self.offer_queue[gig_id] = [d for _, d in cands][:30]
        self.offer_fee[gig_id] = max(1, int(self.requests[order["id"]]["referenceFeeCents"] * pickups(action) / len(order["legs"]) * P["rescfee"]))
        for _ in range(P["rescn"]):
            self.next_offer(gig_id)

    def next_offer(self, gig_id: str) -> None:
        q = self.offer_queue.get(gig_id)
        day = self.now // DAY
        while q:
            d = q.pop(0)
            if self.offers_day.get((d, day), 0) >= 3:
                continue
            self.offers_day[(d, day)] = self.offers_day.get((d, day), 0) + 1
            self.outbox.append({"type": "offer", "gigId": gig_id, "driverId": d, "feeCents": self.offer_fee[gig_id]})
            return

    def gigs_of(self, order_id: str) -> list[str]:
        """The gigs that carry the order's undelivered legs: one, or one for each leg of a split trade-in."""
        return list(dict.fromkeys(self.leg_gigs.get(order_id, {}).values()))

    def carry(self, action: PostAction, gig_id: str) -> None:
        """Remembers a gig that the world accepted: the post that made it, and the legs it carries."""
        for stop in action["stops"]:
            self.leg_gigs.setdefault(stop["orderId"], {})[stop["leg"]] = gig_id
        self.posts[gig_id] = action

    def withdraw(self, order_id: str) -> bool:
        """Takes an order's gigs out of the drivers' app. False, and nothing withdrawn, when a driver holds one of them."""
        self.send_post_of(order_id)
        gigs = self.gigs_of(order_id)
        if any(gig_id in self.booked for gig_id in gigs):
            return False
        self.leg_gigs.pop(order_id, None)
        self.outbox += [{"type": "withdraw", "gigId": gig_id} for gig_id in gigs]
        for gig_id in gigs:
            self.unbundle(gig_id, skip=order_id)
        return True

    def unbundle(self, gig_id: str, skip: str = "") -> None:
        """The cars of other orders in a gig that left the app go out again on their own gigs."""
        self.bundles.pop(gig_id, None)
        action = self.posts.get(gig_id)
        if action is None:
            return
        for oid in dict.fromkeys(s_["orderId"] for s_ in action["stops"]):
            if oid == skip or oid not in self.orders:
                continue
            legs = [l for l, g in self.leg_gigs.get(oid, {}).items() if g == gig_id]
            self.nobundle.add(oid)
            for l in legs:
                self.leg_gigs[oid].pop(l, None)
            if legs:
                self.post(self.orders[oid], legs)

    def try_bundle(self, gig_id: str) -> None:
        """Pairs a new one-car gig with an open one that starts near where it ends, or ends near where it starts:
        one driver moves both cars and skips a trip home and a trip out."""
        a = self.posts.get(gig_id)
        if a is None or not self.is_open(gig_id):
            return
        A = self.orders.get(a["stops"][0]["orderId"])
        if A is None or len(A["legs"]) != 1 or A["id"] in self.urgent or A["id"] in self.nobundle:
            return
        best = None
        for g, b in list(self.posts.items()):
            if g == gig_id or len(b["stops"]) != 2 or not self.is_open(g):
                continue
            B = self.orders.get(b["stops"][0]["orderId"])
            if B is None or B["id"] == A["id"] or len(B["legs"]) != 1 or B["id"] in self.urgent or B["id"] in self.nobundle:
                continue
            for first, second, fa, sa in ((A, B, a, b), (B, A, b, a)):
                link = self.chain_fit(first, second)
                if link is not None and (best is None or link < best[0]):
                    best = (link, g, first, second, fa, sa)
        if best is None:
            return
        _, g, first, second, fa, sa = best
        B = second if first is A else first
        res = self.world.act([{"type": "withdraw", "gigId": gig_id}, {"type": "withdraw", "gigId": g}])
        ok = [r["ok"] is True for r in res]
        for o, good in ((A, ok[0]), (B, ok[1])):
            if good:
                self.leg_gigs.get(o["id"], {}).pop(0, None)
        if not all(ok):
            for o, good in ((A, ok[0]), (B, ok[1])):
                if good:
                    self.post(o, [0])
            return
        stops = without_windows(fa["stops"] + sa["stops"], self.now)
        audience = {"experienced": fa["audience"]["experienced"] or sa["audience"]["experienced"], "manualLicence": fa["audience"]["manualLicence"] or sa["audience"]["manualLicence"]}
        action = {"type": "post", "stops": stops, "audience": audience, "schedule": []}
        self.orders[A["id"]], self.orders[B["id"]] = A, B
        action["schedule"] = self.gig_fees(action, first)
        r = self.world.act([action])[0]
        if r["ok"] is True:
            self.carry(action, r["id"])
            self.bundles[r["id"]] = min(first["lastPickupAt"], second["lastPickupAt"]) - P["bsplit"]
            self.nb += 1
        else:
            self.post(first, [0])
            self.post(second, [0])

    def chain_fit(self, first: Order, second: Order) -> Optional[float]:
        """Road minutes from the first car's delivery to the second car's pickup, when one driver can do both in time."""
        p1, d1 = first["legs"][0]["pickup"]["placeId"], first["legs"][0]["delivery"]["placeId"]
        p2, d2 = second["legs"][0]["pickup"]["placeId"], second["legs"][0]["delivery"]["placeId"]
        if km(d1, p2) > P["brad"]:
            return None
        link = road_minutes(d1, p2) if d1 != p2 else 0
        m1, m2 = road_minutes(p1, d1), road_minutes(p2, d2)
        if link > P["blink"] or m1 + link + m2 > P["bmax"]:
            return None
        t1 = max(self.now + 60, first["legs"][0]["pickup"]["window"]["from"])
        if t1 > first["lastPickupAt"] - P["bspare"]:
            return None
        arrive = t1 + m1 + link
        w2 = second["legs"][0]["pickup"]["window"]
        if arrive < w2["from"] - P["bwait"] or arrive > second["lastPickupAt"] - P["bspare"]:
            return None
        if max(arrive, w2["from"]) + m2 > second["deadline"] - P["bspare"]:
            return None
        return link

    def tick(self) -> None:
        """A two-car gig that no driver has booked by its split time goes back out as two one-car gigs."""
        for gid, at in list(self.bundles.items()):
            if self.now >= at:
                if gid not in self.booked and self.is_open(gid):
                    self.outbox.append({"type": "withdraw", "gigId": gid})
                    self.unbundle(gid)
                else:
                    self.bundles.pop(gid, None)

    def send_post_of(self, order_id: str) -> None:
        """A post of the order still in the outbox goes to the world now, so the starter knows its gig. Each gig carries one order."""
        if any(action["type"] == "post" and action["stops"][0]["orderId"] == order_id for action in self.outbox):
            self.send()

    def send(self) -> None:
        """Sends the outbox now. In practice, the outbox goes with the next advance instead. Offers that the
        results start go out in the same call."""
        for _ in range(4):
            actions, self.outbox = self.outbox, []
            if not actions:
                return
            for i in range(0, len(actions), 50):
                chunk = actions[i : i + 50]
                self.read_results(chunk, self.world.act(chunk))

    def read_results(self, actions: list[Action], results: list[ActionResult]) -> None:
        """Remembers the gig of each post that the world accepted."""
        for action, result in zip(actions, results):
            if action["type"] == "post" and result["ok"] is True:
                self.carry(action, result["id"])
                if P["offer"]:
                    self.start_offers(action, result["id"])
                if P["chain"]:
                    self.chain_to(result["id"])
                if P["bundle"] and pickups(action) == 1:
                    self.try_bundle(result["id"])


def retry_from(order: Order, request: PriceRequest, leg: int, now: int) -> int:
    """When to try a car again after a visit found it not ready or the site closed: two hours on, or,
    when the dealer moved the deadline for a car that is late, when the car should be ready by the
    same delay."""
    promised = next((o["deadline"] for o in request["options"] if o["kind"] == order["option"]), order["deadline"])
    delay = max(0, order["deadline"] - promised)
    return max(now + 2 * HOUR, order["legs"][leg]["pickup"]["window"]["from"] + delay)


def undelivered(order: Order) -> list[int]:
    return [leg for leg in range(len(order["legs"])) if order["deliveredAt"][leg] is None]


def pickups(action: PostAction) -> int:
    """The cars a post carries."""
    return sum(1 for stop in action["stops"] if stop["kind"] == "pickup")


def without_windows(stops: list[StopRef], before: float) -> list[StopRef]:
    """Leaves out the stop windows that end before `before`, so the world's window applies: once the order's
    window has ended, it runs to the end of the world."""
    return [{k: v for k, v in stop.items() if k != "window"} if "window" in stop and stop["window"]["to"] < before else stop for stop in stops]


def rising(now: int, fee: float, level: int) -> list[FeeStep]:
    """The fee at once, then 10% of it more every hour: six steps, up to 1.5 times. Level 1 takes one fee only."""
    # int(x + 0.5) rounds halves up, as JavaScript's Math.round does, so both starters post the same fees.
    return [{"at": now + k * P["fint"], "feeCents": max(1, int(fee * (P["f0"] + k * P["fstep"]) + 0.5))} for k in range(1 if level == 1 else P["fn"])]


def steep(now: int, fee: float, level: int) -> list[FeeStep]:
    """1.5 times the fee at once, then a quarter of it more every half hour, up to 2.5 times. Level 1 takes one fee only."""
    return [{"at": now + k * P["sint"], "feeCents": max(1, int(fee * (P["s0"] + k * P["sstep"]) + 0.5))} for k in range(1 if level == 1 else P["sn"])]


def stops_for(order: Order, legs: list[int], request: PriceRequest, retry: Retry) -> list[StopRef]:
    """A pickup and a delivery for each leg. A stop has its own window only when the note or the retry
    makes it narrower. Without one, the world plans the pickup in the order's window and the delivery by
    the deadline. A note that needs plates or a charge gets them on the first post."""
    _, plates, low_battery_note = note_flags(request)
    stops: list[StopRef] = []
    for leg in legs:
        car, pickup, delivery = order["legs"][leg]["car"], order["legs"][leg]["pickup"], order["legs"][leg]["delivery"]
        noted = window_from_note(request, pickup["window"], "pickup")
        start = max(noted["from"], retry.pickup_from)
        pickup_window: TimeWindow = {"from": start, "to": max(noted["to"], start)}
        delivery_base: TimeWindow = {"from": delivery["window"]["from"], "to": max(delivery["window"]["from"], order["deadline"])}
        delivery_window = window_from_note(request, delivery_base, "delivery")
        low_battery = car["electric"] and ((car["chargePercent"] is not None and car["chargePercent"] < 30) or low_battery_note)
        first: StopRef = {"orderId": order["id"], "leg": leg, "kind": "pickup", "withPlates": retry.plates or plates, "withCharging": low_battery}
        second: StopRef = {"orderId": order["id"], "leg": leg, "kind": "delivery"}
        stops += [narrower(first, pickup_window, pickup["window"]), narrower(second, delivery_window, delivery_base)]
    return stops


def narrower(stop: StopRef, window: TimeWindow, base: TimeWindow) -> StopRef:
    return {**stop, "window": window} if window["from"] > base["from"] or window["to"] < base["to"] else stop


# Keywords, matched on lower-cased clauses. A closing word turns a time after it into the site's closing time.
AFTER = re.compile(r"j.{0,2}keen|alkaen|aikaisintaan|\bafter\b|\bfrom\b|earliest|not before|ei ennen|valmi|\bready\b|efter|tidigast|inte före|\bklar\b|först|\bvasta\b|once paid|payment", re.ASCII)
BEFORE = re.compile(r"ennen|mennessä|mennessa|viim|\bbefore\b|\bby\b|latest|ltaest|före|senast|\basti\b|\buntil\b|\btill\b|\btills\b|innan", re.ASCII)
CLOSED = re.compile(r"kiinni|sulkee|suljet|\bcloses?\b|\bclosed\b|stänger|stängt|ei ketään|ei kukaan|nobody|no one|ingen", re.ASCII)
DELIVERY = re.compile(r"toimit|perill|perila|perilä|peril[ae]|vastaanot|kohde|destination|dstination|deliver|arriv|receiv|leverera|leverans|framme|mottag", re.ASCII)
PICKUP = re.compile(r"nou[dt]|hake|haett|hämt|\bhaku|collect|pick ?up|\bready\b|valmi|\bklar\b|luovut|handover|hand over|maks|maskaa|payment|pays|release", re.ASCII)
CORRECTION = re.compile(r"korjaus|correction|corrected|\bcorr\b|ei kun|ei vaan|i mean|instead|rättelse", re.ASCII)
HANDOVER = re.compile(r"vasta|maks|once paid|pays|payment|sitten|sen jälkeen|luovut", re.ASCII)
DENIAL = re.compile(r"(?:\bnot|\binte|\bej|\bei)$", re.ASCII)
# Opening hours as a range: "9-16", "klo 9.00-14.30", "kl 10-14".
RANGE = re.compile(r"(?<![\d.:])(\d{1,2})(?:[.:](\d{2}))?\s*-\s*(\d{1,2})(?:[.:](\d{2}))?(?![\d])", re.ASCII)
# A clock time: after klo/kl/kello/klockan/at, with a colon or dot, with am/pm, or next to a bound word.
CLOCK = re.compile(
    r"(?<![\w.:])(?:(?:klo|kl|kello|klockan|at)\.?\s*(\d{1,2})(?:[.:](\d{2}))?"
    r"|(\d{1,2})[.:](\d{2})(?!\d)"
    r"|(\d{1,2})(?=\s*(?:mennessä|mennessa|asti|alkaen|jälkeen|ennen|viimeistään|viim|latest|earliest|before|after|by)\b)"
    r"|(\d{1,2})(?=\s*(?:am|pm)\b))(?:\s*(am|pm)\b)?",
    re.ASCII,
)
DAY_WORDS = [
    (re.compile(r"tänään|tanaan|\bidag\b|\btoday\b", re.ASCII), 0),
    (re.compile(r"ylihuom\w*|i övermorgon|övermorgon|overmorgon|day after tomorrow", re.ASCII), 2),
    (re.compile(r"\bhuom\w*n\w*|\bi morgon\b|\bimorgon\b|\btomorrow\b|\btomorow\b|\btmrw\b|\btmr\b|\btmw\b", re.ASCII), 1),
]
WEEKDAY = re.compile(
    r"\b(maanantai\w*|måndag\w*|monday|mon|ma(?=\s+(?:klo|kl|\d))|mån(?=\s+(?:klo|kl|\d))"
    r"|tiistai\w*|tisdag\w*|tuesday|tues?|ti(?=\s+(?:klo|kl|\d))"
    r"|keskiviikko\w*|onsdag\w*|wednesday|wed|ke(?=\s+(?:klo|kl|\d))|ons(?=\s+(?:klo|kl|\d))"
    r"|torstai\w*|torsdag\w*|thursday|thu|thurs|thur|to(?=\.?\s+(?:klo|kl|\d))|tors(?=\s+(?:klo|kl|\d))"
    r"|perjantai\w*|fredag\w*|friday|fri|pe(?=\s+(?:klo|kl|\d))|fre(?=\s+(?:klo|kl|\d))"
    r"|lauantai\w*|lördag\w*|saturday|sat|la(?=\s+(?:klo|kl|\d))"
    r"|sunnuntai\w*|söndag\w*|sunday|sun|su(?=\s+(?:klo|kl|\d)))\b",
    re.ASCII,
)
WORD_HOUR = re.compile(
    r"(?<![a-zäöå])(?:(puoli|half)\s+)?"
    r"(yhdentoista|kahdentoista|yhdelt[äa]|kahdelt[äa]|kolmelt[äa]|neljält[äa]|neljalt[äa]|viidelt[äa]|kuudelt[äa]|seitsemält[äa]|seitsemalt[äa]|kahdeksalt[äa]|kahdeksält[äa]"
    r"|yhdeksält[äa]|yhdeksalt[äa]|kymmenelt[äa]|yhdeltätoista|kahdeltatoista"
    r"|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio|elva|tolv)(?![a-zäöå])"
)
WORD_NUMBERS = {
    "yhdeltä": 1, "yhdelta": 1, "yhdentoista": 11, "kahdentoista": 12, "kahdelta": 2, "kahdeltä": 2, "kolmelta": 3, "kolmeltä": 3, "neljältä": 4, "neljalta": 4,
    "viideltä": 5, "viidelta": 5, "kuudelta": 6, "kuudeltä": 6, "seitsemältä": 7, "seitsemalta": 7, "kahdeksalta": 8, "kahdeksältä": 8,
    "yhdeksältä": 9, "yhdeksalta": 9, "kymmeneltä": 10, "kymmenelta": 10, "yhdeltätoista": 11, "kahdeltatoista": 12,
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "ett": 1, "två": 2, "tre": 3, "fyra": 4, "fem": 5, "sex": 6, "sju": 7, "åtta": 8, "nio": 9, "tio": 10, "elva": 11, "tolv": 12,
}
WEEKDAY_INDEX = [("maa", 0), ("ma", 0), ("mon", 0), ("mån", 0), ("tii", 1), ("tue", 1), ("tis", 1), ("ti", 1), ("kes", 2), ("wed", 2), ("ons", 2), ("ke", 2),
                 ("tor", 3), ("thu", 3), ("tors", 3), ("to", 3), ("per", 4), ("fri", 4), ("fre", 4), ("pe", 4), ("lau", 5), ("sat", 5), ("lör", 5), ("la", 5),
                 ("sun", 6), ("sön", 6), ("su", 6)]


def note_flags(request: PriceRequest) -> tuple[bool, bool, bool]:
    """What the note says about the car: a manual gearbox, no plates, a weak battery."""
    text = ((request.get("note") or {}).get("text") or "").lower()
    manual = bool(re.search(r"manuaa|manual|manuell|ei automaatti|stick shift", text))
    plates = bool(re.search(r"kilpi|kilvet|kilpe|rekkar|rekisterikilv|skylt|plates|siirtokilv|koekilv|unregistered|number plate|registration plate", text))
    low_battery = bool(re.search(r"akku|batter", text)) and bool(re.search(r"heikko|weak|low|tyhj|vähis|vähän|empty|dead|flat", text))
    return manual, plates, low_battery


def note_clauses(text: str) -> list[str]:
    """Splits a note at sentences, commas and slashes, so that each clause has one stop."""
    t = text.lower().replace("–", "-").replace("—", "-")
    t = re.sub(r"\b(kl|klo|viim|n|ma|ti|ke|to|pe|la|su|mon|tue|wed|thu|fri|sat|sun|tmrw)\.(?=\s)", r"\1", t)
    return [c.strip() for c in re.split(r"\.(?!\d)|[!;\n/,?]", t) if c.strip()]


def clause_stop(clause: str) -> str:
    """A pickup word wins. A clause with only a delivery word is for the delivery; the rest are for the pickup."""
    if PICKUP.search(clause):
        return "pickup"
    return "delivery" if DELIVERY.search(clause) else "pickup"


def weekday_offset(word: str, arrival_wd: int) -> int:
    """A weekday name is 2 to 6 days after the request arrives, never the arrival day or the next."""
    index = next((i for prefix, i in WEEKDAY_INDEX if word.startswith(prefix)), 0)
    offset = (index - arrival_wd) % 7
    return offset + 7 if offset < 2 else offset


def clock_times(clause: str, arrived: int, handover: bool) -> list[tuple[str, int]]:
    """The (bound, minute) pairs of a clause: 'from' for a time from which, 'to' for a time until which."""
    arrival_day = arrived // DAY
    day_marks: list[tuple[int, int]] = []
    for pattern, offset in DAY_WORDS:
        day_marks += [(m.start(), offset) for m in pattern.finditer(clause)]
    day_marks += [(m.start(), weekday_offset(m.group(1), arrival_day % 7)) for m in WEEKDAY.finditer(clause)]
    times: list[tuple[int, int, int]] = []  # position, minute of the day, end position
    for m in CLOCK.finditer(clause):
        hour = int(m.group(1) or m.group(3) or m.group(5) or m.group(6) or 0)
        minute = int(m.group(2) or m.group(4) or 0)
        meridiem = m.group(7)
        if meridiem == "pm" and hour < 12:
            hour += 12
        elif meridiem == "am" and hour == 12:
            hour = 0
        if hour <= 24 and minute <= 59:
            times.append((m.start(), hour * HOUR + minute, m.end()))
    for m in WORD_HOUR.finditer(clause):
        before = clause[max(0, m.start() - 14) : m.start()]
        if not (m.group(1) or m.group(2).endswith(("lta", "ltä", "toista")) or re.search(r"klo|kl|kello|klockan|at|by|from|until|till|before|after|efter|före|senast|viim|ennen|jälkeen|alkaen|mennessä|asti|innan|earliest|latest", before)):
            continue
        hour = WORD_NUMBERS[m.group(2)]
        hour = hour if hour >= 9 else hour + 12  # an hour in words is a working hour, from 9 to 17
        minute = 0
        if m.group(1):  # "half three" is 14:30
            hour, minute = hour - 1, 30
        times.append((m.start(), hour * HOUR + minute, m.end()))
    out: list[tuple[str, int]] = []
    for pos, minute_of_day, end in sorted(times):
        whole = clause if len(times) == 1 else clause[max(0, pos - 30) : end + 30]
        before = re.sub(r"(?:klo|kl|kello|klockan|at)\.?$", "", clause[:pos].rstrip()).rstrip()
        if DENIAL.search(before):  # "ei kun klo 18" denies the time it names
            continue
        offset = 0
        if day_marks:
            near = min(day_marks, key=lambda mark: abs(mark[0] - pos))
            if abs(near[0] - pos) < 60:
                offset = near[1]
        value = (arrival_day + offset) * DAY + minute_of_day
        if CLOSED.search(whole):
            out.append(("to", value))
        elif AFTER.search(whole):
            out.append(("from", value))
        elif BEFORE.search(whole):
            out.append(("to", value))
        elif CORRECTION.search(clause):
            out.append(("", value))  # a corrected time takes the bound of the time it corrects
        elif handover:
            out.append(("from", value))  # the car is handed over only from then on
    if not times and day_marks and CORRECTION.search(clause):
        out.append(("day", (arrival_day + min(day_marks)[1]) * DAY))  # "I mean Wednesday" moves the time before it
    return out


def window_from_note(request: PriceRequest, window: TimeWindow, stop: str) -> TimeWindow:
    """Narrows a stop's window by the note: a ready time or a payment handover is a start, a deadline or
    a closing time an end, and opening hours a range, "arkisin 9-16". Days count from the request's
    arrival: "huomenna" is tomorrow, a weekday name 2 to 6 days on. A correction replaces what came before."""
    note = request.get("note")
    if not note:
        return window
    start, end = window["from"], window["to"]
    constraints: list[tuple[str, int]] = []
    handover = stop == "pickup" and bool(HANDOVER.search(note["text"].lower()))
    previous = "pickup"
    for clause in note_clauses(note["text"]):
        has_word = PICKUP.search(clause) or DELIVERY.search(clause)
        kind = previous if CORRECTION.search(clause) and not has_word else clause_stop(clause)  # a correction goes with what it corrects
        previous = kind
        if kind != stop:
            continue
        for match in RANGE.finditer(clause):
            hours = (int(match[1]), int(match[2] or 0), int(match[3]), int(match[4] or 0))
            if hours[0] > 24 or hours[2] > 24 or hours[1] > 59 or hours[3] > 59:
                continue
            opens, closes = hours[0] * HOUR + hours[1], hours[2] * HOUR + hours[3]
            if opens >= closes:
                continue
            start = max(start, start // DAY * DAY + opens)  # opening hours hold every day
            end = min(end, end // DAY * DAY + closes)
        constraints += clock_times(RANGE.sub(" ", clause), request["arrivedAt"], handover)
    rebased: list[tuple[str, int]] = []
    for bound, value in constraints:
        if bound == "day":
            if rebased:
                rebased[-1] = (rebased[-1][0], value + rebased[-1][1] % DAY)
            continue
        rebased.append((bound, value))
    inherited = "to"
    constraints = []
    for bound, value in rebased:
        inherited = bound or inherited
        constraints.append((inherited, value))
    if CORRECTION.search(note["text"].lower()):
        constraints = list({bound: value for bound, value in constraints}.items())
    for bound, value in constraints:
        if bound == "from":
            start = max(start, value)
        else:
            end = min(end, value)
    if start <= end:
        return {"from": start, "to": end}
    # A ready time after the window's end: the pickup still runs to the window's own end.
    return {"from": start, "to": max(start, window["to"])} if stop == "pickup" else window


def play_practice(world: World, level: int) -> None:
    """Steps the world from one event that needs an answer to the next, and stops at each midnight for a report."""
    snapshot = world.snapshot()
    desk, ends_at = Desk(world, level, snapshot["now"]), snapshot["endsAt"]
    while desk.now < ends_at:
        day, midnight = desk.now // DAY, (desk.now // DAY + 1) * DAY
        # One request a step: the advance applies the outbox, then moves the clock.
        actions, desk.outbox = desk.outbox, []
        step = world.advance(until=WAKE_ON, max=min(ends_at, midnight), actions=actions)
        desk.read_results(actions, step["results"])
        desk.now = step["now"]
        for event in step["events"]:
            desk.handle(event)
        if desk.now // DAY > day and not QUIET:
            report(WEEKDAYS[day % 7], world.score())


def play_final(world: World, now_fn=None) -> None:
    """Rebuilds the books, then answers events as they come. After a second without an event,
    it reads the clock."""
    history = world.events()
    snapshot = world.snapshot()
    if snapshot["now"] >= snapshot["endsAt"]:
        return
    level = next((w["level"] for w in world.client.worlds() if w["worldId"] == world.id), 8)
    desk = Desk(world, level, snapshot["now"])
    desk.rejoin(snapshot, history)
    desk.send()
    for event in world.stream(after=history[-1]["seq"] if history else -1, idle=1.0):
        day = desk.now // DAY
        desk.now = (now_fn() if now_fn else world.client.final()["now"]) if event is None else max(desk.now, event["at"])
        if event is not None:
            desk.handle(event)
        desk.send()
        if desk.now // DAY > day:
            report(WEEKDAYS[day % 7], world.score())
        if desk.now >= snapshot["endsAt"]:
            return


def report(label: str, score: Score) -> None:
    orders = f"{score['wonOrders']:>4} orders  {score['onTimeShare']:6.1%} on time  {score['undeliveredShare']:5.1%} not delivered"
    print(f"{label:<9}  margin €{score['marginCents'] / 100:>11,.2f}  revenue €{score['revenueCents'] / 100:>11,.2f}  {orders}", flush=True)


def next_final(client: Client) -> World:
    """Your copy of the final that is set or runs now. Waits while none is set and while the last one has
    ended: the organisers set a test final 15 minutes before its start, and the final 30 minutes before."""
    said = False
    while True:
        try:
            world: Optional[World] = client.world(client.final()["worldId"])
        except SpreadError as error:
            if error.status != 404:
                raise
            world = None
        if world is not None:
            snapshot = world.snapshot()
            if snapshot["now"] < snapshot["endsAt"]:
                return world
        if not said:
            print("No final is set. Waiting for it: the organisers set a test final 15 minutes before its start, and the final 30 minutes before.", flush=True)
            said = True
        time.sleep(10)


def main() -> None:
    parser = argparse.ArgumentParser(description="Plays a Spread world with the starter. Set SPREAD_URL and SPREAD_KEY first.")
    parser.add_argument("--level", type=int, choices=range(1, 9), default=8, help="the practice level, 1 to 8 (default 8)")
    parser.add_argument("--seed", help="any text; the same seed gives the same world")
    parser.add_argument("--board", action="store_true", help="play your next ranking run at the level; it counts in the practice rankings")
    parser.add_argument("--final", action="store_true", help="play your copy of the final from the live stream")
    args = parser.parse_args()
    try:
        client = Client()
        score = None
        if args.final:
            world = None
            # A server restart drops every connection. The desk then rebuilds its books from the server, as after its own restart.
            while True:
                try:
                    if world is None:
                        world = next_final(client)
                        print(f"Final world {world.id}.", flush=True)
                    play_final(world)
                    score = world.score()
                    break
                except Unreachable as error:
                    print(f"spread: {error}. Trying again in 5 seconds.", file=sys.stderr, flush=True)
                    time.sleep(5)
        else:
            world = client.create(level=args.level, seed=args.seed, board=args.board)
            # A ranking run that a team deletes plays to its end without the team's system, and counts.
            name = f"{'Ranking run' if args.board else 'Practice world'} {world.id}"
            stops = "Ctrl-C or an error stops your system: the run then plays to its end without it, and counts." if args.board else "Ctrl-C or an error stops the run and deletes the world."
            print(f"{name}, level {args.level}. {stops}", flush=True)
            try:
                play_practice(world, args.level)
            except BaseException as error:  # a world left behind holds one of the team's eight practice slots
                try:
                    world.delete()
                    deleted = True
                except SpreadError:
                    deleted = False
                after = (f"{name} plays to its end without your system, and counts." if args.board
                         else f"{name} is deleted." if deleted else f"{name} is not deleted: it holds one of your eight practice slots.")
                if isinstance(error, KeyboardInterrupt):
                    sys.exit(f"Stopped. {after}")
                print(f"Stopped by the error below. {after}", file=sys.stderr)
                raise
        score = score or world.score()
        report("End", score)
        print("Ranked." if score["ranked"] else "Not ranked: no order won." if score["wonOrders"] == 0 else "Not ranked: the delivery minimum is 90% of the orders on time.")
    except SpreadError as error:
        sys.exit(f"spread: {error}")
    except KeyboardInterrupt:
        sys.exit("Stopped. The final world keeps running without your system; start it again with --final.")


if __name__ == "__main__":
    main()
