"""JSON over HTTP with a hard wall-clock deadline and retries, shared by the API backends.

urlopen's timeout is per socket read, so a server trickling bytes can hang a run for hours.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request

RETRY_HTTP = {429, 500, 502, 503, 504}
BACKOFF_S = (2, 8)


def _once(req: urllib.request.Request, deadline: float) -> dict:
    box: dict = {}

    def run():
        try:
            box["ok"] = json.load(urllib.request.urlopen(req, timeout=deadline))
        except BaseException as e:
            box["err"] = e

    # daemon: a stuck read must not keep the process alive after we give up on it
    t = threading.Thread(target=run, daemon=True)
    t.start()
    t.join(deadline)
    if t.is_alive():
        raise TimeoutError(f"no response in {deadline:.0f}s from {req.full_url}")
    if "err" in box:
        raise box["err"]
    return box["ok"]


def request_json(url: str, headers: dict, body: dict | None = None) -> dict:
    deadline = float(os.environ.get("SITELENS_VLM_TIMEOUT", "120"))
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    for i in range(len(BACKOFF_S) + 1):
        try:
            return _once(req, deadline)
        except urllib.error.HTTPError as e:
            if e.code not in RETRY_HTTP or i == len(BACKOFF_S):
                raise
        except (TimeoutError, urllib.error.URLError, ConnectionError):
            if i == len(BACKOFF_S):
                raise
        time.sleep(BACKOFF_S[i])
    raise AssertionError("unreachable")
