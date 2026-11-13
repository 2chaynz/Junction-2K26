import json, os, sys, time
os.environ["SPREAD_QUIET"]="1"
os.environ["SPREAD_PARAMS"]=sys.argv[1]
import dispatch
from spread.client import Client, SpreadError
c=Client(); tot=0; n=0
for i in range(5):
    try: w=c.create(level=8, board=True)
    except SpreadError as e: print('cannot create:',e); break
    dispatch.play_practice(w,8); s=w.score(); tot+=s['marginCents']; n+=1
    print(i+1, round(s['marginCents']/100), s['wonOrders'], round(s['onTimeShare'],3), s['ranked'], flush=True)
print('TOTAL', round(tot/100), 'runs', n)
