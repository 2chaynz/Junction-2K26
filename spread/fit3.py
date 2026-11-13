import json, glob, math, numpy as np, collections
from spread.client import Client
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
import featlib
m=Client().map(); PL={p['id']:p for p in m['places']}; RD={(r['from'],r['to']):r['minutes'] for r in m['roads']}
# supply features need homes per world; use roster counts from o_d* worlds are different seeds -> use c-series: need homes. approximate with fixed global home distribution
hc=collections.Counter()
for f in glob.glob('data/o_d*.json'):
    for h in json.load(open(f))['homes']: hc[h]+=1
for k in hc: hc[k]/=len(glob.glob('data/o_d*.json'))
files=sorted(glob.glob('data/q_c*.json')); rows=[]; dealers={}
for wi,f in enumerate(files):
    for r in json.load(open(f)):
        if r['quote'] is None: continue
        rq=r['request']; k=list(r['quote'])[0]; o=[o for o in rq['options'] if o['kind']==k][0]
        mm=r['quote'][k]/o['listPriceCents']
        if mm>3: continue
        d=dealers.setdefault(rq['dealerId'],len(dealers))
        base=featlib.feats(rq,hc,PL,RD)
        rows.append((wi,r['outcome']=='won',[math.log(mm),d,o['listPriceCents']/1000,rq['referenceFeeCents']/o['listPriceCents'],1.0 if k=='next_day' else 0.0]+base))
w=np.array([r[0] for r in rows]); y=np.array([r[1] for r in rows]); X=np.array([r[2] for r in rows],float)
def ll(p,y): p=np.clip(p,1e-6,1-1e-6); return -np.mean(y*np.log(p)+(1-y)*np.log(1-p))
te=w%4==0
g=HistGradientBoostingClassifier(max_iter=200,learning_rate=0.05,max_depth=4,categorical_features=[1],l2_regularization=1.0).fit(X[~te],y[~te])
print('gbm test ll',ll(g.predict_proba(X[te])[:,1],y[te]))
# monotone in price: constraint
g2=HistGradientBoostingClassifier(max_iter=200,learning_rate=0.05,max_depth=4,categorical_features=[1],l2_regularization=1.0,monotonic_cst=[-1]+[0]*(X.shape[1]-1)).fit(X[~te],y[~te])
print('gbm monotone test ll',ll(g2.predict_proba(X[te])[:,1],y[te]))
