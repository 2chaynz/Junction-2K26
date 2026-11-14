import sys,re,subprocess,json,os
p=open(sys.argv[1]).read().strip() if os.path.exists(sys.argv[1]) else sys.argv[1]
seeds=sys.argv[2:]
res={}
for attempt in range(3):
    todo=[s for s in seeds if s not in res]
    if not todo: break
    for i in range(0,len(todo),8):
        out=subprocess.run([sys.executable,'sweep.py',p]+todo[i:i+8],capture_output=True,text=True).stdout
        for l in out.splitlines():
            m=re.match(r'(\S+)\s+margin\s+(-?[\d,]+).*ontime\s+([\d.]+)%',l)
            if m: res[m.group(1)]=(int(m.group(2).replace(',','')),float(m.group(3)))
r=list(res.values())
print('n',len(r),'mean margin',sum(x[0] for x in r)//max(1,len(r)),'on-time min',min(x[1] for x in r),'mean',round(sum(x[1] for x in r)/len(r),1),'n<92',sum(x[1]<92 for x in r),'n<90',sum(x[1]<90 for x in r))
