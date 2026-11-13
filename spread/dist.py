import sys,re,subprocess,json,os
p=open(sys.argv[1]).read().strip() if os.path.exists(sys.argv[1]) else sys.argv[1]
seeds=sys.argv[2:]
res=[]
for i in range(0,len(seeds),8):
    out=subprocess.run([sys.executable,'sweep.py',p]+seeds[i:i+8],capture_output=True,text=True).stdout
    for l in out.splitlines():
        m=re.search(r'margin\s+(-?[\d,]+).*ontime\s+([\d.]+)%',l)
        if m: res.append((int(m.group(1).replace(',','')),float(m.group(2))))
print('n',len(res),'mean margin',sum(r[0] for r in res)//len(res),'on-time min',min(r[1] for r in res),'mean',round(sum(r[1] for r in res)/len(res),1),'n<92',sum(r[1]<92 for r in res),'n<90',sum(r[1]<90 for r in res))
print(sorted(res,key=lambda r:r[1])[:5])
