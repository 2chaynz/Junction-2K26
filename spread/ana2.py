import json, collections, statistics as st, sys
seed=sys.argv[1]
ev=json.load(open(f'data/ev_{seed}.json')); rv=json.load(open(f'data/rv_{seed}.json'))
req={r['request']['id']:r for r in rv['requests']}
tot=collections.defaultdict(int)
for e in ev:
    if e['kind']=='ledger': tot[e['line']['kind']]+=e['line']['cents']
print({k:round(v/100) for k,v in tot.items()}, 'margin', round(sum(tot.values())/100))
print(collections.Counter(r['outcome'] for r in rv['requests']))
won={e['order']['id']:e for e in ev if e['kind']=='order_won'}
fee=collections.defaultdict(int); rev={}; ref={}
for e in ev:
    if e['kind']=='ledger':
        l=e['line']
        if l['orderId'] is None: continue
        if l['kind']=='driver_fee': fee[l['orderId']]+=l['cents']
        else: fee[l['orderId']]+=l['cents'] if l['kind'] in('failed_visit','late_refund','waiting','release_fee','fine','undelivered_penalty') else 0
        if l['kind']=='revenue': rev[l['orderId']]=l['cents']
late={e['line']['orderId'] for e in ev if e['kind']=='ledger' and e['line']['kind']=='late_refund'}
rows=[]
for oid,e in won.items():
    o=e['order']; r=req[oid]['request']
    rows.append(dict(oid=oid,price=o['priceCents'],cost=-fee[oid],ref=r['referenceFeeCents'],late=oid in late,opt=o['option'],pk=o['legs'][0]['pickup']['placeId'],dl=o['legs'][-1]['delivery']['placeId'],legs=len(o['legs']),dealer=o['dealerId'],t=e['at'],slack=o['lastPickupAt']-e['at'],note=bool(r['note']),pr=o['priceCents']/r['referenceFeeCents']))
print(len(rows),'late',sum(r['late'] for r in rows))
def grp(key, mn=8):
    d=collections.defaultdict(list)
    for r in rows: d[key(r)].append(r)
    out=[]
    for k,v in d.items():
        if len(v)>=mn: out.append((sum(x['price']-x['cost'] for x in v)/100,k,len(v),round(sum(x['late'] for x in v)/len(v),2),round(st.mean(x['cost']/x['ref'] for x in v),2),round(st.mean(x['pr'] for x in v),2)))
    out.sort()
    print('  (margin, key, n, late%, cost/ref, price/ref)')
    for o in out[:6]+out[-4:]: print('  ',o)
print('by pickup'); grp(lambda r:r['pk'])
print('by dealer'); grp(lambda r:r['dealer'])
print('by option'); grp(lambda r:r['opt'])
print('by slack bucket'); grp(lambda r:min(int(r['slack']/120),12))
print('by legs'); grp(lambda r:r['legs'])
print('by day'); grp(lambda r:r['t']//1440)
