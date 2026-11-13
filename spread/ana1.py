import json, collections, statistics as st
from spread.client import Client
c=Client(); w=c.world('w372133bebe091437873b'); snap=w.snapshot(); json.dump(snap,open('data/snap_a3.json','w'))
ev=json.load(open('data/ev_a3.json')); rv=json.load(open('data/rv_a3.json'))
req={r['request']['id']:r['request'] for r in rv['requests']}
orders={o['id']:o for o in snap['orders']}
fee=collections.defaultdict(int); 
for e in ev:
    if e['kind']=='ledger' and e['line']['kind']=='driver_fee' and e['line']['orderId']: fee[e['line']['orderId']]+=e['line']['cents']
late={e['line']['orderId'] for e in ev if e['kind']=='ledger' and e['line']['kind']=='late_refund'}
rows=[]
for oid,o in orders.items():
    r=req[oid]
    if oid not in fee: continue
    rows.append((oid, o['priceCents'], fee[oid], r['referenceFeeCents'], oid in late, o['legs'][0]['pickup']['placeId'], o['legs'][-1]['delivery']['placeId'], len(o['legs'])))
print(len(rows))
ratio=[r[2]/r[3] for r in rows]
print('fee/ref quantiles',[round(x,2) for x in st.quantiles(ratio,n=10)])
pr=[r[1]/r[3] for r in rows]
print('price/ref quantiles',[round(x,2) for x in st.quantiles(pr,n=10)])
print('margin/order mean', sum(r[1]-r[2] for r in rows)/len(rows)/100)
for lo,hi in ((0,3000),(3000,6000),(6000,12000),(12000,25000),(25000,10**9)):
    S=[r for r in rows if lo<=r[1]<hi]
    if S: print(lo,hi,len(S),'avg price',round(sum(r[1] for r in S)/len(S)/100),'avg fee',round(sum(r[2] for r in S)/len(S)/100),'late%',round(100*sum(r[4] for r in S)/len(S)))
