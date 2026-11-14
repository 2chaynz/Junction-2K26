import json, os, sys, concurrent.futures as cf
os.environ["SPREAD_QUIET"]="1"
os.environ["SPREAD_PARAMS"]=json.dumps({"opt":"nosame","rq":1,"trust":0,"minslack":300,"f0":0.7,"fstep":0.2,"fn":3,"fint":60,"offer":1,"onear":10,"omax":12,"suplo":15,"supmult":1.3})
import dispatch_asif as dispatch
from spread.client import Client
def run(seed):
    c=Client(); w=c.create(level=8, seed=seed)
    try:
        dispatch.play_practice(w, 8)
        rv=w.reveal()
        json.dump(rv['requests'], open(f"data/q_{seed}.json","w"))
        return seed, w.score()['wonOrders']
    finally:
        try: w.delete()
        except Exception: pass
seeds=sys.argv[1:]
with cf.ThreadPoolExecutor(max_workers=4) as ex:
    for r in ex.map(run, seeds): print(r, flush=True)
