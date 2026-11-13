import json, collections, statistics as st, math, sys
from spread.client import Client
m=Client().map(); P={p['id']:p for p in m['places']}
def km(a,b):
    A,B=P[a],P[b]; 
    x=(A['lon']-B['lon'])*math.cos(math.radians((A['lat']+B['lat'])/2)); y=A['lat']-B['lat']
    return 111*math.hypot(x,y)
seed=sys.argv[1]
dr=json.load(open(f'data/dr_{seed}.json'))
home=collections.Counter(d['homePlaceId'] for d in dr)
print(len(dr),'drivers',home.most_common(30))
ev=json.load(open(f'data/ev_{seed}.json')); rv=json.load(open(f'data/rv_{seed}.json'))
req={r['request']['id']:r['request'] for r in rv['requests']}
late={e['line']['orderId'] for e in ev if e['kind']=='ledger' and e['line']['kind']=='late_refund'}
cost=collections.defaultdict(int)
for e in ev:
    if e['kind']=='ledger' and e['line']['orderId']:
        l=e['line']
        if l['kind']!='revenue': cost[l['orderId']]-=l['cents']
rows=[]
for e in ev:
    if e['kind']!='order_won': continue
    o=e['order']; r=req[o['id']]; pk=o['legs'][0]['pickup']['placeId']; dl=o['legs'][0]['delivery']['placeId']
    n30=sum(1 for d in dr if km(d['homePlaceId'],pk)<=30); n80=sum(1 for d in dr if km(d['homePlaceId'],pk)<=80)
    nd=sum(1 for d in dr if km(d['homePlaceId'],dl)<=30)
    rows.append((n30,n80,nd,o['id'] in late,cost[o['id']]/r['referenceFeeCents'],o['priceCents']/r['referenceFeeCents']))
for name,idx,cuts in (('n30',0,(0,1,3,6,12,1000)),('n80',1,(0,3,8,15,30,1000)),('ndel30',2,(0,1,3,6,12,1000))):
    print(name)
    for lo,hi in zip(cuts,cuts[1:]):
        S=[r for r in rows if lo<=r[idx]<hi]
        if S: print(f'  {lo}-{hi}: n={len(S)} late={sum(r[3] for r in S)/len(S):.2f} cost/ref={st.mean(r[4] for r in S):.2f} price/ref={st.mean(r[5] for r in S):.2f}')
