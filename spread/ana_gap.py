"""Gap analysis on sweep --dump output. usage: python ana_gap.py <tag> seed1 seed2 ..."""
import json, sys, collections, math
from spread.client import Client

m = Client().map()
PL = {p["id"]: p for p in m["places"]}
RD = {(r["from"], r["to"]): r["minutes"] for r in m["roads"]}


def km(a, b):
    A, B = PL[a], PL[b]
    x = (A["lon"] - B["lon"]) * math.cos(math.radians((A["lat"] + B["lat"]) / 2))
    return 111 * math.hypot(x, A["lat"] - B["lat"])


def rd(a, b):
    return 0 if a == b else RD.get((a, b), 10**6)


tag, seeds = sys.argv[1], sys.argv[2:]
for seed in seeds:
    ev = json.load(open(f"data/ev_{tag}_{seed}.json"))
    rv = json.load(open(f"data/rv_{tag}_{seed}.json"))
    reqs = {r["request"]["id"]: r for r in rv["requests"]}
    n = len(reqs)
    declined = quoted = won = 0
    buckets = collections.defaultdict(lambda: [0, 0])
    for rid, r in reqs.items():
        q, rq = r.get("quote") or {}, r["request"]
        lp = {o["kind"]: o["listPriceCents"] for o in rq["options"]}
        mults = [v / lp[k] for k, v in q.items() if k in lp]
        if not mults or min(mults) >= 4:
            declined += 1
            continue
        quoted += 1
        b = round(min(mults), 1)
        buckets[b][0] += 1
        if r["outcome"] == "won":
            won += 1
            buckets[b][1] += 1
    led = collections.defaultdict(int)
    fee = collections.defaultdict(int)
    late = set()
    for e in ev:
        if e["kind"] == "ledger":
            l = e["line"]
            led[l["kind"]] += l["cents"]
            if l["kind"] == "driver_fee" and l["orderId"]:
                fee[l["orderId"]] -= l["cents"]
            if l["kind"] == "late_refund":
                late.add(l["orderId"])
    orders = {e["order"]["id"]: (e["at"], e["order"]) for e in ev if e["kind"] == "order_won"}
    accepted = {e["gigId"] for e in ev if e["kind"] == "offer_answered" and e["answer"] == "accepted"}
    booked = [e for e in ev if e["kind"] == "gig_booked"]
    via_offer = sum(1 for e in booked if e["gigId"] in accepted)
    drops = sum(1 for e in ev if e["kind"] == "gig_dropped")
    fails = collections.Counter(e["reason"] for e in ev if e["kind"] == "visit_failed")
    feeref = [fee[o] / reqs[o]["request"]["referenceFeeCents"] for o in orders if fee.get(o)]
    margin = sum(led.values())
    print(f"== {seed}: margin {margin/100:,.0f}  requests {n}  declined {declined}  quoted {quoted}  won {won} ({won/max(1,quoted):.0%} of quoted)  late {len(late)}")
    print("   ledger", {k: round(v / 100) for k, v in led.items()})
    print(f"   margin/order {margin/100/max(1,len(orders)):.0f}  fee/ref mean {sum(feeref)/max(1,len(feeref)):.2f}  bookings {len(booked)} via offer {via_offer}  drops {drops}  fails {dict(fails)}")
    print("   win rate by min quote/list:", {k: f"{v[1]}/{v[0]}" for k, v in sorted(buckets.items()) if v[0] >= 5})
    # pairing potential: B's pickup within 30 km of A's delivery, B ready within 24h of A, chain fits 12 h
    allr = [r["request"] for r in reqs.values() if len(r["request"]["legs"]) == 1]
    wonids = set(orders)
    pairs_ww = pairs_any = 0
    for a in allr:
        if a["id"] not in wonids:
            continue
        la = a["legs"][0]
        dA = rd(la["pickup"]["placeId"], la["delivery"]["placeId"])
        ok_any = ok_ww = False
        for b in allr:
            if b is a:
                continue
            lb = b["legs"][0]
            if abs(lb["pickup"]["window"]["from"] - la["pickup"]["window"]["from"]) > 1440:
                continue
            if km(la["delivery"]["placeId"], lb["pickup"]["placeId"]) > 30:
                continue
            tot = dA + rd(la["delivery"]["placeId"], lb["pickup"]["placeId"]) + rd(lb["pickup"]["placeId"], lb["delivery"]["placeId"])
            if tot > 720:
                continue
            ok_any = True
            if b["id"] in wonids:
                ok_ww = True
        pairs_any += ok_any
        pairs_ww += ok_ww
    print(f"   won orders with a chain partner: any request {pairs_any}/{len(orders)}  won partner {pairs_ww}/{len(orders)}")
