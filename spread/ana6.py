import json, collections, sys, statistics as st
seed=sys.argv[1]
ev=json.load(open(f'data/ev_{seed}.json')); rv=json.load(open(f'data/rv_{seed}.json'))
req={r['request']['id']:r['request'] for r in rv['requests']}
won={e['order']['id']:e for e in ev if e['kind']=='order_won'}
late={}
for e in ev:
    if e['kind']=='ledger' and e['line']['kind']=='late_refund': late[e['line']['orderId']]=e['line']['detail']
print(seed,'orders',len(won),'late',len(late))
# per order event timeline
tl=collections.defaultdict(list)
gig2o={}
for e in ev:
    k=e['kind']
    if 'orderId' in e: tl[e['orderId']].append(e)
for oid in list(late)[:14]:
    o=won[oid]['order']; r=req[oid]
    kinds=collections.Counter(e['kind'] for e in tl[oid] if e['kind'] in('deadline_close','visit_failed','order_changed','release','gig_expired'))
    print(oid,o['option'],'won@',won[oid]['at'],'lastPick',o['lastPickupAt'],'ddl',o['deadline'],late[oid],dict(kinds),'ref',r['referenceFeeCents'],'note' if r['note'] else '', r['legs'][0]['pickup']['placeId'],'>',r['legs'][0]['delivery']['placeId'], 'priv' if r['legs'][0]['pickup']['privateAddress'] or r['legs'][0]['delivery']['privateAddress'] else '')
