"""Router reasoning steps with fake paths. Needs no dataset.  python tests/test_stream.py"""
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sitelens import Answer, router  # noqa: E402


def fake(name, fn):
    m = types.ModuleType(name)
    m.answer = fn
    sys.modules[name] = m
    return name


def boom(p, q):
    raise ValueError("x")


router.PATHS = [
    fake("t.none", lambda p, q: None),
    fake("t.boom", boom),
    fake("t.ok", lambda p, q: Answer(3, unit="count", trace=["3 doors on level 1"])),
    fake("t.never", lambda p, q: Answer(9)),
]
steps = []
a = router.answer("data/x.pdf", "how many doors?", steps.append)
kinds = [(s["kind"], s["path"]) for s in steps]
assert a.value == 3, a
assert kinds == [("try", "none"), ("skip", "none"), ("try", "boom"), ("fail", "boom"),
                 ("try", "ok"), ("found", "ok"), ("trace", "ok")], kinds
assert steps[-1]["text"] == "3 doors on level 1" and all(s["t"] >= 0 for s in steps)
assert router.answer("data/x.pdf", "q").value == 3  # on_step is optional
print("stream ok")
