import json, glob, math, numpy as np, collections
from spread.client import Client
from sklearn.linear_model import Ridge, LogisticRegression
from sklearn.ensemble import GradientBoostingRegressor, GradientBoostingClassifier
m=Client().map(); PL={p['id']:p for p in m['places']}; RD={(r['from'],r['to']):r['minutes'] for r in m['roads']}
import featlib
def feats(rq,hc): return featlib.feats(rq,hc,PL,RD)
X=[];Y=[];L=[];G=[]
for wi,f in enumerate(sorted(glob.glob('data/o_d*.json'))):
    d=json.load(open(f)); hc=collections.Counter(d['homes'])
    for r in d['rows']:
        rq=r['request']; X.append(feats(rq,hc)); Y.append(r['cost']/rq['referenceFeeCents']); L.append(r['late']); G.append(wi)
X=np.array(X,float);Y=np.array(Y);L=np.array(L);G=np.array(G)
print(len(Y),'mean cost/ref',Y.mean(),'late',L.mean())
te=G%4==0
for name,mod in (('ridge',Ridge(alpha=3.0)),('gbr',GradientBoostingRegressor(n_estimators=150,max_depth=3,learning_rate=0.05,subsample=0.8))):
    mod.fit(X[~te],Y[~te]); p=mod.predict(X[te])
    print(name,'cost rmse',np.sqrt(np.mean((p-Y[te])**2)),'baseline',np.sqrt(np.mean((Y[~te].mean()-Y[te])**2)),'corr',np.corrcoef(p,Y[te])[0,1])
cl=GradientBoostingClassifier(n_estimators=150,max_depth=3,learning_rate=0.05).fit(X[~te],L[~te]); pl=cl.predict_proba(X[te])[:,1]
print('late auc-ish corr',np.corrcoef(pl,L[te])[0,1])

import pickle
reg=GradientBoostingRegressor(n_estimators=150,max_depth=3,learning_rate=0.05,subsample=0.8,random_state=0).fit(X,Y)
cl=GradientBoostingClassifier(n_estimators=150,max_depth=3,learning_rate=0.05,random_state=0).fit(X,L)
pickle.dump((reg,cl),open('cost_model.pkl','wb')); print('saved')
