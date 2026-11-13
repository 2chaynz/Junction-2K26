import json, collections, statistics as st
from spread.client import Client
roads={(r['from'],r['to']):r['minutes'] for r in Client().map()['roads']}
ev=json.load(open('data/ev_b1.json')); rv=json.load(open('data/rv_b1.json'))
req={r['request']['id']:r['request'] for r in rv['requests']}
diffs=[]
low=[]
for e in ev:
    if e['kind']!='order_won': continue
    o=e['order']; r=req[o['id']]
    drive=sum(roads[(l['pickup']['placeId'],l['delivery']['placeId'])] for l in r['legs'])
    est=o['deadline']-drive
    diffs.append(est-o['lastPickupAt'])
    if o['lastPickupAt']-e['at']<420: low.append((o['id'],o['option'],e['at'],o['deadline'],drive,o['lastPickupAt'],r['legs'][0]['pickup']['window'],r['legs'][0]['delivery']['hours'],r['note'] and r['note']['text']))
print(st.quantiles(diffs,n=10))
for x in low[:12]: print(x)
