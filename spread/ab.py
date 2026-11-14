"""Paired A/B on the 12 eval seeds. usage: python ab.py <tag> '<param overrides json>' [--vs base] [--seeds a,b,..]
Overrides apply on top of best_params.json. Saves data/ab_<tag>.json; prints paired diff vs --vs."""
import json, os, subprocess, sys

SEEDS = [str(s) for s in range(9101, 9113)]
args = sys.argv[1:]
vs = "base"
if "--vs" in args:
    i = args.index("--vs"); vs = args[i + 1]; del args[i:i + 2]
seeds = SEEDS
if "--seeds" in args:
    i = args.index("--seeds"); seeds = args[i + 1].split(","); del args[i:i + 2]
tag, over = args[0], json.loads(args[1]) if len(args) > 1 else {}
params = json.load(open("best_params.json"))
params.update(over)
path = f"data/ab_{tag}.json"
res = json.load(open(path)) if os.path.exists(path) else {}
todo = [s for s in seeds if s not in res]
py = os.path.join(".venv", "Scripts", "python")
for i in range(0, len(todo), 4):
    out = subprocess.run([py, "sweep.py", json.dumps(params)] + todo[i:i + 4], capture_output=True, text=True).stdout
    for line in out.splitlines():
        p = line.split()
        if len(p) > 9 and p[1] == "margin":
            res[p[0]] = {"margin": float(p[2].replace(",", "")), "orders": int(p[6]), "ontime": float(p[8].rstrip("%")) / 100}
    json.dump(res, open(path, "w"))
base = json.load(open(f"data/ab_{vs}.json")) if os.path.exists(f"data/ab_{vs}.json") and vs != tag else {}
both = [s for s in seeds if s in res and s in base]
mean = sum(res[s]["margin"] for s in seeds if s in res) / max(1, sum(s in res for s in seeds))
mn = min(res[s]["ontime"] for s in seeds if s in res)
line = f"{tag}: mean {mean:,.0f}  min_ontime {mn:.1%}  orders {sum(res[s]['orders'] for s in seeds if s in res)/len(seeds):.0f}"
if both:
    b = sum(base[s]["margin"] for s in both) / len(both)
    a = sum(res[s]["margin"] for s in both) / len(both)
    wins = sum(res[s]["margin"] > base[s]["margin"] for s in both)
    line += f"  vs {vs} {b:,.0f}: {100*(a/b-1):+.1f}%  better on {wins}/{len(both)}"
print(line)
for s in seeds:
    if s in res:
        d = f" ({res[s]['margin']-base[s]['margin']:+,.0f})" if s in base else ""
        print(f"  {s} {res[s]['margin']:>8,.0f}{d} {res[s]['orders']:>4} {res[s]['ontime']:.1%}")
print("params", json.dumps(over))
