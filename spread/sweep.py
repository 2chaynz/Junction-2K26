"""usage: python sweep.py '<params json>' seed1 seed2 ... [--level 8]  -> runs worlds in parallel threads."""
import json, os, sys, time, concurrent.futures as cf
args = sys.argv[1:]
level, dump = 8, None
if "--level" in args:
    i = args.index("--level"); level = int(args[i + 1]); del args[i:i + 2]
if "--dump" in args:
    i = args.index("--dump"); dump = args[i + 1]; del args[i:i + 2]
os.environ["SPREAD_PARAMS"] = args[0]
os.environ["SPREAD_QUIET"] = "1"
import dispatch
from spread.client import Client

def run(seed):
    c = Client()
    w = c.create(level=level, seed=seed)
    try:
        dispatch.play_practice(w, level)
        s = w.score()
        if dump:
            for k, v in (("ev", w.events(-1)), ("rv", w.reveal()), ("dr", w.roster()), ("sn", w.snapshot())):
                json.dump(v, open(f"data/{k}_{dump}_{seed}.json", "w"))
        return seed, s
    finally:
        for _ in range(6):
            try:
                w.delete(); break
            except Exception:
                time.sleep(5)

t = time.time()
tot, ons = 0, []
with cf.ThreadPoolExecutor(max_workers=min(8, len(args) - 1)) as ex:
    for seed, s in ex.map(run, args[1:]):
        tot += s["marginCents"]; ons.append(s["onTimeShare"])
        print(f"{seed:10} margin {s['marginCents']/100:>11,.0f}  rev {s['revenueCents']/100:>9,.0f} orders {s['wonOrders']:>4} ontime {s['onTimeShare']:6.1%} undel {s['undeliveredShare']:5.1%} {'R' if s['ranked'] else '-'}", flush=True)
print(f"TOTAL {tot/100:,.0f}  mean {tot/100/len(ons):,.0f}  min_ontime {min(ons):.1%}  ({time.time()-t:.0f}s)", flush=True)
