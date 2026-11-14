"""Coordinate-descent over dispatch params. Score = mean margin - penalties for low on-time."""
import json, os, re, subprocess, sys, time
SEEDS = [f"t{i}" for i in range(1, 17)]
best = json.load(open("best_params.json"))
SPACE = {  # param: candidate deltas (multiplicative or additive as given)
    "ccm": [-0.05, 0.05], "lam": [-0.4, 0.4], "mmin": [-0.1, 0.1], "trust": [-0.3, 0.0],
    "f0": [-0.1, 0.1], "fstep": [-0.05, 0.05], "fint": [-20, 20], "s0": [-0.2, 0.2], "sstep": [-0.1, 0.1],
    "u1": [-0.1, 0.1], "u2": [-0.15, 0.15], "u3": [-0.2, 0.2], "t1": [-120, 120], "t2": [-90, 90], "t3": [-60, 60],
    "minslack": [-120, 180], "suplo": [-8, 10], "supmult": [-0.15, 0.15], "eta": [-0.03, 0.04],
}
def evaluate(p):
    out = subprocess.run([sys.executable, "dist2.py", json.dumps(p)] + SEEDS, capture_output=True, text=True).stdout
    m = re.search(r"RESULT (\S+) (\S+) (\S+) (\d+) (\d+)", out)
    if not m: return None
    mean, mn, mo, n92, n = float(m[1]), float(m[2]), float(m[3]), int(m[4]), int(m[5])
    if n < len(SEEDS) - 1: return None
    score = mean - 800 * max(0.0, 96.5 - mo) - 1500 * n92 - 600 * max(0.0, 94 - mn)
    return score, mean, mn, mo, n92
log = open("autotune.log", "a")
def say(s):
    print(s, flush=True); log.write(s + "\n"); log.flush()
cur = evaluate(best); say(f"BASE {cur} {json.dumps(best)}")
for rnd in range(2):
    for k, deltas in SPACE.items():
        for d in deltas:
            cand = dict(best); v = cand.get(k, 0) + d
            if k in ("fint", "t1", "t2", "t3", "minslack", "suplo"): v = int(v)
            if v <= 0 and k not in ("trust", "eta"): continue
            cand[k] = round(v, 4) if isinstance(v, float) else v
            r = evaluate(cand)
            say(f"{k}={cand[k]} -> {r}")
            if r and r[0] > cur[0] + 120:
                best, cur = cand, r
                json.dump(best, open("tuned_params.json", "w"), indent=0)
                say(f"  ACCEPT {k}={cand[k]} score {r[0]:.0f}")
say(f"FINAL {cur} {json.dumps(best)}")
