"""Data-free checks run by scripts/check.sh."""
from eval.score import grade
from eval.split import drawing_id, in_split, split_of
from sitelens import Answer, Evidence

c = {"type": "count", "answer": 3}
a = {"type": "area", "answer": 100.0}
assert grade(c, 3) and grade(c, 3.0) and not grade(c, 4) and not grade(c, 2.6) and not grade(c, None)
assert grade(a, 101.9) and grade(a, 98.1) and not grade(a, 102.5)
assert grade({"type": "text", "answer": "x"}, "x") is None
assert drawing_id("data/ifc_models/m_plan-02-x.pdf") == drawing_id("data/ifc_models/m.ifc")
assert split_of("data/swiss_dwellings/a.pdf") == split_of("data/swiss_dwellings/a.dxf")
assert Answer(1, evidence=[Evidence("f", [0, 0, 1, 1])]).to_dict()["evidence"][0]["bbox"] == [0, 0, 1, 1]
assert in_split("data/cubicasa5k/colorful-11260.png", "test") and not in_split("data/swiss_dwellings/a.pdf", "test")
from sitelens.paths import vlm
try:
    vlm.get("nope")
    raise AssertionError("unknown VLM backend accepted")
except ValueError as e:
    assert "gemini" in str(e) and "nemotron" in str(e)
with vlm.use_backend("nemotron"):
    assert vlm._override.get() == "nemotron"
assert vlm._override.get() is None
import http.server, os, threading, time
from sitelens.vlm_backends import _http
calls = []
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # 1st: 503, 2nd: hangs past the deadline, 3rd: ok
        calls.append(1)
        if len(calls) == 1:
            self.send_error(503)
            return
        if len(calls) == 2:
            time.sleep(2)
        self.send_response(200); self.end_headers(); self.wfile.write(b'{"ok": 1}')
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
_http.BACKOFF_S, os.environ["SITELENS_VLM_TIMEOUT"] = (0, 0), "0.5"
assert _http.request_json(f"http://127.0.0.1:{srv.server_port}/", {}) == {"ok": 1} and len(calls) == 3
srv.shutdown()
print("selftest ok")
