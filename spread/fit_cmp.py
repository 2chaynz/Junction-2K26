import json, glob, math, collections, numpy as np
from sklearn.linear_model import LogisticRegression
from spread.client import Client
files=sorted(glob.glob('data/q_c*.json'))
rows=[]
for wi,f in enumerate(files):
    for r in json.load(open(f)):
        if r['quote'] is None: continue
        rq=r['request']; k=list(r['quote'])[0]
        lp=[o for o in rq['options'] if o['kind']==k][0]['listPriceCents']
        m=r['quote'][k]/lp
        if m>3: continue
        leg=rq['legs'][0]
        rows.append(dict(w=wi,y=r['outcome']=='won',lm=math.log(m),dealer=rq['dealerId'],pk=leg['pickup']['placeId'],dl=leg['delivery']['placeId'],day=(rq['arrivedAt']//1440),hr=(rq['arrivedAt']%1440)//60,legs=len(rq['legs']),k=k,note=bool(rq['note']),lane=leg['pickup']['placeId']+'>'+leg['delivery']['placeId'],ref=rq['referenceFeeCents'],lst=lp))
def design(rows, cats, vocab=None):
    if vocab is None:
        vocab={}
        for c in cats:
            for v in sorted(set(r[c] for r in rows)): vocab[(c,v)]=len(vocab)
    X=np.zeros((len(rows),len(vocab)+1))
    for i,r in enumerate(rows):
        X[i,0]=r['lm']
        for c in cats:
            j=vocab.get((c,r[c]))
            if j is not None: X[i,j+1]=1
    return X,vocab
y=np.array([r['y'] for r in rows])
tr=[i for i,r in enumerate(rows) if r['w']%4!=0]; te=[i for i,r in enumerate(rows) if r['w']%4==0]
def ll(p,y): p=np.clip(p,1e-6,1-1e-6); return -np.mean(y*np.log(p)+(1-y)*np.log(1-p))
for cats in (['dealer','pk','dl','k'],['dealer','pk','dl','k','day'],['dealer','pk','dl','k','hr'],['dealer','pk','dl','k','day','hr'],['dealer','pk','dl','k','legs','note']):
    Xa,voc=design([rows[i] for i in tr],cats)
    Xb,_=design([rows[i] for i in te],cats,voc)
    m=LogisticRegression(C=0.3,max_iter=2000).fit(Xa,y[tr])
    print(cats,'test ll %.4f'%ll(m.predict_proba(Xb)[:,1],y[te]))
# final export on all data
cats=['dealer','pk','dl','k']
Xa,voc=design(rows,cats)
m=LogisticRegression(C=0.3,max_iter=3000).fit(Xa,y)
out={'slope':float(m.coef_[0][0]),'icpt':float(m.intercept_[0]),'w':{f'{c}:{v}':float(m.coef_[0][j+1]) for (c,v),j in voc.items()}}
pass
print('exported',len(out['w']),'slope',out['slope'],'icpt',out['icpt'])
