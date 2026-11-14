"""Ask sessions per project: saved conversations a team can reopen. One JSON file per project.

Stored next to measure takeoffs (`SITELENS_STORE`'s parent, default `.sitelens/sessions/`).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
from pathlib import Path

MAX_MSGS = 400  # a session is a working conversation, not an archive
_lock = threading.Lock()  # one project file is rewritten whole: serialize load-modify-save


def _dir() -> Path:
    base = os.environ.get("SITELENS_STORE")
    d = Path(base).parent / "sessions" if base else Path(__file__).resolve().parent.parent / ".sitelens" / "sessions"
    d.mkdir(parents=True, exist_ok=True)
    gi = d.parent / ".gitignore"
    if d.parent.name == ".sitelens" and not gi.exists():
        gi.write_text("*\n")
    return d


def _file(project: str) -> Path:
    # Project keys hold slashes ("ifc/clinic"); the hash keeps two keys from sharing a slug.
    slug = re.sub(r"[^\w-]+", "_", project).strip("_")[:60]
    return _dir() / f"{slug}-{hashlib.sha1(project.encode()).hexdigest()[:8]}.json"


def _load(project: str) -> dict[str, dict]:
    f = _file(project)
    if not f.exists():
        return {}
    try:
        return json.loads(f.read_text(encoding="utf8"))
    except (OSError, ValueError):
        return {}


def _save(project: str, data: dict[str, dict]) -> None:
    f = _file(project)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf8")
    tmp.replace(f)


def _summary(s: dict) -> dict:
    msgs = s.get("msgs", [])
    asks = [m for m in msgs if m.get("kind") == "user"]
    last = next((m for m in reversed(msgs) if m.get("kind") == "answer"), None)
    a = (last or {}).get("answer") or {}
    return {
        "id": s["id"], "title": s.get("title") or (asks[0]["text"] if asks else "New session"),
        "created": s.get("created"), "updated": s.get("updated"), "questions": len(asks),
        "paths": list(dict.fromkeys(m["path"] for m in msgs if m.get("path"))),
        "last": {"question": last.get("question"), "value": a.get("value"), "unit": a.get("unit")} if last else None,
    }


def list_sessions(project: str) -> list[dict]:
    return sorted((_summary(s) for s in _load(project).values()), key=lambda s: s["updated"] or 0, reverse=True)


def get(project: str, sid: str) -> dict | None:
    return _load(project).get(sid)


def put(project: str, sid: str, msgs: list[dict], title: str | None = None) -> dict:
    if not re.fullmatch(r"[\w-]{4,64}", sid):
        raise ValueError("bad session id")
    with _lock:
        return _put(project, sid, msgs, title)


def _put(project: str, sid: str, msgs: list[dict], title: str | None) -> dict:
    data = _load(project)
    now = time.time()
    s = data.get(sid) or {"id": sid, "project": project, "created": now}
    # Live "pending" bubbles are UI state; they'd reopen as a spinner that never ends.
    s["msgs"] = [m for m in msgs if m.get("kind") != "pending"][-MAX_MSGS:]
    s["updated"] = now
    if title is not None:
        s["title"] = title.strip()[:120]
    data[sid] = s
    _save(project, data)
    return _summary(s)


def delete(project: str, sid: str) -> bool:
    with _lock:
        data = _load(project)
        if data.pop(sid, None) is None:
            return False
        _save(project, data)
        return True


def overview() -> dict[str, dict]:
    """{project: {"sessions": n, "updated": t}} for the project picker."""
    out = {}
    for f in _dir().glob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf8"))
        except (OSError, ValueError):
            continue
        for s in data.values():
            p = s.get("project")
            if not p:
                continue
            o = out.setdefault(p, {"sessions": 0, "updated": 0})
            o["sessions"] += 1
            o["updated"] = max(o["updated"], s.get("updated") or 0)
    return out
