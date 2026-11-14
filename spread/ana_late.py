"""Why orders are late. usage: python ana_late.py <tag> seeds..."""
import json, sys, collections
tag = sys.argv[1]
for seed in sys.argv[2:]:
    ev = json.load(open(f"data/ev_{tag}_{seed}.json")); sn = json.load(open(f"data/sn_{tag}_{seed}.json"))
    won = {e["order"]["id"]: e for e in ev if e["kind"] == "order_won"}
    late = {e["line"]["orderId"] for e in ev if e["kind"] == "ledger" and e["line"]["kind"] in ("late_refund", "undelivered_penalty")}
    gig_order = {g["id"]: g["stops"][0]["orderId"] for g in sn["gigs"]}
    first_book, drops, dc, fails = {}, collections.Counter(), {}, collections.Counter()
    for e in ev:
        o = gig_order.get(e.get("gigId"))
        if e["kind"] == "gig_booked" and o and o not in first_book: first_book[o] = e["at"]
        if e["kind"] == "gig_dropped" and o: drops[o] += 1
        if e["kind"] == "deadline_close" and e["orderId"] not in dc: dc[e["orderId"]] = e["at"]
        if e["kind"] == "visit_failed": fails[e["orderId"]] += 1
    cause = collections.Counter()
    for o in late:
        w = won[o]
        if fails[o]: c = "failed_visit"
        elif o not in first_book: c = "never_booked"
        elif o in dc and first_book[o] > dc[o]: c = "booked_after_warning"
        elif drops[o]: c = "dropped"
        else: c = "booked_in_time_still_late"
        cause[(c, w["order"]["option"])] += 1
    slack = collections.Counter()
    for o in late:
        w = won[o]; slack[min(24, (w["order"]["lastPickupAt"] - w["at"]) // 120 * 2)] += 1
    print(seed, "won", len(won), "late", len(late), "warnings", len(dc), dict(cause))
    print("   late by slack hours at win:", sorted(slack.items()))
    print("   late by win day:", sorted(collections.Counter(won[o]["at"] // 1440 for o in late).items()))
