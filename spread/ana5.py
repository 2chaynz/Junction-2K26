import json, collections, statistics as st, sys
from spread.client import Client
wid=sys.argv[1]; seed=sys.argv[2]
w=Client().world(wid); snap=w.snapshot()
ev=json.load(open(f'data/ev_{seed}.json')); rv=json.load(open(f'data/rv_{seed}.json'))
req={r['request']['id']:r['request'] for r in rv['requests']}
gigs={g['id']:g for g in snap['gigs']}
print(len(gigs), collections.Counter(g['status'] for g in gigs.values()))
book=collections.defaultdict(list); drops=collections.Counter(); views=collections.Counter()
for e in ev:
    if e['kind']=='gig_booked': book[e['gigId']].append(e)
    if e['kind']=='gig_dropped': drops[e['gigId']]+=1
    if e['kind']=='gig_viewed': views[e['gigId']]+=1
rows=[]
for gid,g in gigs.items():
    oid=g['stops'][0]['orderId']; 
    if gid not in book: continue
    b=book[gid][-1]; r=req[oid]
    rows.append(dict(ratio=b['feeCents']/r['referenceFeeCents'], wait=b['at']-g['postedAt'], drops=drops[gid], views=views[gid], n=len(book[gid]), first=g['schedule'][0]['feeCents']/r['referenceFeeCents']))
print(len(rows),'booked gigs; total drops',sum(drops.values()),'gigs w/ drops',sum(1 for r in rows if r['drops']))
print('final fee/ref q',[round(x,2) for x in st.quantiles([r['ratio'] for r in rows],n=10)])
print('wait min q',[round(x) for x in st.quantiles([r['wait'] for r in rows],n=10)])
for lo,hi in ((0,.8),(.8,1),(1,1.2),(1.2,1.5),(1.5,9)):
    S=[r for r in rows if lo<=r['ratio']<hi]
    if S: print(f'ratio {lo}-{hi}: n={len(S)} avg wait={st.mean(r["wait"] for r in S):.0f} dropgigs={sum(1 for r in S if r["drops"])/len(S):.2f} views={st.mean(r["views"] for r in S):.0f}')
