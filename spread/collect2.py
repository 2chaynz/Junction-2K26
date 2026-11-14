import json, os, sys, collections, concurrent.futures as cf
os.environ["SPREAD_QUIET"]="1"
_old=({"opt":"nosame","model":1,"cc":1.3,"trust":1.0,"minslack":300,"lowmult":1.3,"lowslack":900,"suplo":15,"supmult":1.3,"s0":1.2,"sstep":0.2,"sn":6,"f0":0.7,"fstep":0.2,"fn":3,"fint":60,"offer":1,"ofee":0.6,"onear":10,"omax":12})
os.environ["SPREAD_PARAMS"]=open("best_params.json").read()
import dispatch_asif as dispatch
from spread.client import Client
def run(seed):
    c=Client(); w=c.create(level=8, seed=seed)
    try:
        dispatch.play_practice(w, 8)
        ev=w.events(-1); snap=w.snapshot(); rv=w.reveal(); dr=w.roster()
        cost=collections.defaultdict(int); late=set(); rev={}
        for e in ev:
            if e['kind']=='ledger' and e['line']['orderId']:
                l=e['line']
                if l['kind']=='revenue': rev[l['orderId']]=l['cents']
                else: cost[l['orderId']]-=l['cents']
                if l['kind']=='late_refund': late.add(l['orderId'])
        req={r['request']['id']:r['request'] for r in rv['requests']}
        out=[]
        for o in snap['orders']:
            if o['status']=='cancelled': continue
            out.append(dict(request=req[o['id']], order=o, cost=cost[o['id']], late=o['id'] in late, rev=rev.get(o['id'],0)))
        json.dump(dict(rows=out, homes=[d['homePlaceId'] for d in dr]), open(f"data/o_{seed}.json","w"))
        return seed, len(out)
    finally:
        try: w.delete()
        except Exception: pass
with cf.ThreadPoolExecutor(max_workers=6) as ex:
    for r in ex.map(run, sys.argv[1:]): print(r, flush=True)
