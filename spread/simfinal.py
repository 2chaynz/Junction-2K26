"""Plays a practice world with a moving clock (speed factor S x the final's pace) through play_final."""
import json, os, sys, threading, time
os.environ["SPREAD_PARAMS"] = open("best_params.json").read() if len(sys.argv) < 3 else sys.argv[2]
import dispatch_asif as dispatch
from spread.client import Client
speed = float(sys.argv[1]) if len(sys.argv) > 1 else 2.0
seed = sys.argv[3] if len(sys.argv) > 3 else "simf1"
c = Client(); w = c.create(level=8, seed=seed)
ends = w.snapshot()["endsAt"]
state = {"now": 0}
def secs_per_min(minute):
    d = minute // 1440; h = (minute % 1440) / 60
    if d >= 7 and d >= 7: base = 9 if (d == 7 and 6 <= h < 22) else 3
    elif d < 5 and 6 <= h < 22: base = 18
    elif d == 5 and 6 <= h < 22: base = 6
    else: base = 3
    return base / 60 / speed
def clock():
    w2 = Client().world(w.id)
    while state["now"] < ends:
        t0 = time.time()
        try:
            r = w2.advance(by=1)
            state["now"] = r["now"]
        except Exception as e:
            print("advance error", e, flush=True); time.sleep(1); continue
        time.sleep(max(0, secs_per_min(state["now"]) - (time.time() - t0)))
th = threading.Thread(target=clock, daemon=True); th.start()
t = time.time()
crash = {"left": int(os.environ.get("SIM_CRASHES", "0")), "n": 0}
orig = dispatch.Desk.handle
def flaky(self, event):
    crash["n"] += 1
    if crash["left"] and crash["n"] % 4000 == 0:
        crash["left"] -= 1
        raise dispatch.Unreachable(0, "injected crash")
    return orig(self, event)
dispatch.Desk.handle = flaky
try:
    while True:
        try:
            dispatch.play_final(w, now_fn=lambda: state["now"]); break
        except dispatch.Unreachable as e:
            print("restart after:", e, flush=True)
finally:
    th.join(timeout=5)
s = w.score()
print("SIMFINAL", round(s["marginCents"] / 100), s["wonOrders"], round(s["onTimeShare"], 3), s["ranked"], f"{time.time()-t:.0f}s")
try: w.delete()
except Exception: pass
