"""Check for a newer VLM and switch to it.

  python -m sitelens.vlm_backends              # active backend + model, newest of its family
  python -m sitelens.vlm_backends --upgrade    # switch to the newest; saves it in .env
  python -m sitelens.vlm_backends --use gemini-3.8-flash
  python -m sitelens.vlm_backends --backend gemma-api
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from . import BACKENDS, latest

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


def _load_env() -> None:
    """Read .env without overriding the shell, so the CLI sees what the server sees."""
    import os
    if ENV_FILE.is_file():
        for line in ENV_FILE.read_text(encoding="utf8").splitlines():
            if m := re.match(r"\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)", line):
                os.environ.setdefault(m.group(1), m.group(2).strip().strip("\"'"))


def _save_env(name: str, value: str) -> None:
    text = ENV_FILE.read_text(encoding="utf8") if ENV_FILE.is_file() else ""
    line = f"{name}={value}"
    text, n = re.subn(rf"(?m)^{name}=.*$", line, text)
    if not n:
        text += ("" if text.endswith("\n") or not text else "\n") + line + "\n"
    ENV_FILE.write_text(text, encoding="utf8")


def main() -> int:
    ap = argparse.ArgumentParser(prog="python -m sitelens.vlm_backends", description=__doc__.splitlines()[0])
    ap.add_argument("--backend", choices=sorted(BACKENDS), help="default: SITELENS_VLM")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--upgrade", action="store_true", help="switch to the newest model and save it in .env")
    g.add_argument("--use", metavar="MODEL", help="switch to this model and save it in .env")
    a = ap.parse_args()
    _load_env()

    s = latest.status(a.backend, refresh=True)
    if not s["backend"]:
        print("VLM off: set SITELENS_VLM (gemini, gemma-api, ...) or pass --backend")
        return 1
    print(f"backend  {s['backend']}\ncurrent  {s['current']}")
    if not s["env"]:
        print("latest   can't check: this backend doesn't list its models")
        return 0
    print(f"latest   {s['latest'] or 'up to date'}")
    if s["available"]:
        print(f"family   {', '.join(s['available'])}")

    target = a.use or (s["latest"] if a.upgrade else None)
    if a.upgrade and not target:
        return 0
    if target:
        try:
            latest.use(target, s["backend"])
        except ValueError as e:
            print(f"error: {e}", file=sys.stderr)
            return 1
        _save_env(s["env"], target)
        print(f"switched to {target} ({s['env']} in .env). Restart the server, or click the button in the UI.")
    elif s["latest"]:
        print("run with --upgrade to switch")
    return 0


if __name__ == "__main__":
    sys.exit(main())
