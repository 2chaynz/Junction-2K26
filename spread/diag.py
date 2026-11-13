import json, os, sys, collections
os.environ["SPREAD_QUIET"]="1"
import dispatch
from spread.client import Client
c=Client(); seed=sys.argv[1]; level=int(sys.argv[2]) if len(sys.argv)>2 else 8
w=c.create(level=level, seed=seed)
dispatch.play_practice(w, level)
print(w.score())
ev=w.events(-1)
json.dump(ev, open(f"data/ev_{seed}.json","w"))
json.dump(w.reveal(), open(f"data/rv_{seed}.json","w"))
json.dump(w.roster(), open(f"data/dr_{seed}.json","w"))
print(w.id)
