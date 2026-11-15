"""Pre-demo check (T96): ask every scripted chip on a running server, compare with the expected answer.

Also warms the caches (the CTR cross-check indexes 66 sheets on first ask), so run it right before presenting.
    python scripts/demo_check.py [--url http://localhost:8000]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "web" / "src" / "demoScript.json"


def ok(chip: dict, a: dict) -> bool:
    exp, v = chip["expect"], a.get("value")
    if chip.get("method") and a.get("method") != chip["method"]:
        return False
    if isinstance(exp, str):
        return exp.lower() in str(v).lower()
    try:
        return abs(float(v) - exp) <= max(0.02 * abs(exp), 1e-9)   # Stoa's tolerance: exact counts, ±2 % quantities
    except (TypeError, ValueError):
        return False


def call(url: str, method: str = "GET", body: dict | None = None, timeout: int = 300):
    req = urllib.request.Request(url, json.dumps(body).encode() if body else None,
                                 {"Content-Type": "application/json"}, method=method)
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000")
    a = ap.parse_args(argv)
    listed = {d["path"] for d in call(a.url + "/api/drawings")}
    fails = 0
    for proj in json.loads(SCRIPT.read_text(encoding="utf8")):
        print(f"== {proj['project']}")
        if proj["path"] not in listed:
            print(f"  FAIL not listed: {proj['path']}")
            fails += 1
            continue
        for chip in proj["chips"]:
            t = time.time()
            try:
                ans = call(a.url + "/api/ask", "POST", {"path": proj["path"], "question": chip["q"]})
            except Exception as e:   # noqa: BLE001 - report and keep checking the rest
                ans = {"value": f"error: {e}"}
            good = ok(chip, ans) and bool(ans.get("evidence"))
            fails += not good
            print(f"  {'PASS' if good else 'FAIL'} {time.time() - t:5.1f}s {chip['role']:<16} "
                  f"{str(ans.get('value'))[:48]!s:<48} ({ans.get('method')}, {len(ans.get('evidence') or [])} marks)"
                  f"{'' if good else '  expected ' + str(chip['expect'])}")
    try:
        rev = call(a.url + "/api/demo/revisions")
        print(f"== Vitoria revisions (?demo): {'PASS' if rev else 'FAIL'} {len(rev)} changed elements")
        fails += not rev
    except Exception as e:   # noqa: BLE001
        print(f"== Vitoria revisions (?demo): FAIL {e}")
        fails += 1
    print("ALL PASS" if not fails else f"{fails} FAILED")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
