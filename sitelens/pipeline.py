"""Tiered answer with numbered sources, for the chat (T75).

1. This drawing: the exact readers (router, VLM held back).
2. Related sheets of the same project (exact readers only).
3. Last resort: the VLM on this drawing, then Gemini with Google Search grounding.

Every answer gets `sources` (numbered [n], drawing evidence first so [n] == evidence[n-1]) and `reasoning`
(lines that cite those numbers). Follow-ups are rewritten into standalone questions from the history.
Stoa's own questions skip tiers 2 and 3 (they are about the open sheet), so the demo check can't move.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.request
from pathlib import Path
from typing import Callable

from . import clarify
from . import router
from .router import _load, answer as route

Step = Callable[[dict], None]
MAX_RELATED = 6
RELATED_BUDGET_S = 25.0
EXACT_SKIP = ("vlm",)
RELATED_SKIP = ("vlm", "facts", "diff", "crosscheck")
GEMINI_EUR_PER_MTOK = (0.30, 2.50)
GROUNDING_EUR = 0.032   # Google Search grounding, per grounded request
NOT_FOUND = re.compile(r"(?i)not (shown|mentioned|visible|found|present|given|indicated)|cannot|can't|unknown|^n/?a$|no information")

# ---------- follow-ups ----------

FOLLOW = re.compile(r"(?i)^\s*(and|also|what about|how about|same for|then|ok(ay)?,?|und|ja|ja mis|entä|et)\b")
PRONOUN = re.compile(r"(?i)\b(it|its|that|those|these|them|there|this one|the same|each)\b")


def _rules(question: str, prev: str) -> str | None:
    """'and windows?' after 'How many doors on '1.korrus'?' → 'How many windows on '1.korrus'?'. Free."""
    if not FOLLOW.search(question):
        return None
    rest = FOLLOW.sub("", question).strip(" ?.,")
    new_names = clarify.QUOTED.findall(question)
    old_names = clarify.QUOTED.findall(prev)
    if new_names and old_names:   # "what about '2.korrus'?"
        return prev.replace(old_names[0], new_names[0], 1)
    new_noun, old_noun = clarify._noun(rest), clarify._noun(prev)
    if new_noun and old_noun and new_noun != old_noun and len(rest.split()) <= 3:
        return re.sub(rf"(?i)\b{old_noun[:-1]}s?\b", new_noun, prev, count=1)
    return None


REWRITE = """Rewrite the user's last question about a construction drawing as one standalone question that
names everything it refers to (element type, room, storey, sheet) using the earlier turns. Keep the user's
language and wording; change nothing if it is already standalone.
{turns}
Last question: {q}
Reply with JSON only: {{"standalone": "...", "followup": true or false}}"""


def followup(question: str, history: list[dict] | None) -> tuple[str, float]:
    """(standalone question, cost). history: [{"question", "answer"}], oldest first."""
    hist = [h for h in (history or []) if h.get("question")][-4:]
    if not hist:
        return question, 0.0
    r = _rules(question, hist[-1]["question"])
    if r:
        return r, 0.0
    short = len(question.split()) <= 8
    if not (FOLLOW.search(question) or (short and PRONOUN.search(question))) or not os.environ.get("GEMINI_API_KEY"):
        return question, 0.0
    turns = "\n".join(f"Q: {h['question']}\nA: {h.get('answer', '')}" for h in hist)
    try:
        j, cost, _ = _gemini(REWRITE.format(turns=turns, q=question), json_mode=True)
        s = str(j.get("standalone") or "").strip()
        return (s if j.get("followup") and s else question), cost
    except Exception:
        return question, 0.0


# ---------- Gemini ----------

def _gemini(prompt: str, json_mode: bool = False, search: bool = False, timeout: int = 40):
    key = os.environ["GEMINI_API_KEY"]
    model = os.environ.get("SITELENS_GEMINI_MODEL", "gemini-3.8-flash")
    body: dict = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0}}
    if json_mode:
        body["generationConfig"]["responseMimeType"] = "application/json"
    if search:
        body["tools"] = [{"google_search": {}}]
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": key})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.load(r)
    u = d.get("usageMetadata", {})
    cost = (u.get("promptTokenCount", 0) * GEMINI_EUR_PER_MTOK[0]
            + (u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0)) * GEMINI_EUR_PER_MTOK[1]) / 1e6
    cand = d["candidates"][0]
    text = "".join(p.get("text", "") for p in cand.get("content", {}).get("parts", []))
    if json_mode:
        return json.loads(text[text.find("{"): text.rfind("}") + 1]), cost, model
    return (text, cand.get("groundingMetadata") or {}), cost + (GROUNDING_EUR if search else 0.0), model


WEB = """You are SiteLens, a tool for construction project teams. The user has the drawing "{name}" open.
The drawing's own readers could not answer the question{why}. Always run a Google Search first, then answer from reliable web sources
(building codes, manufacturer data, standards, typical practice) in at most 4 short sentences, plain text,
no markdown. Say plainly when the answer depends on the specific project and can't be known from the web.
{turns}Question: {q}"""


def web(path: str, question: str, history: list[dict] | None, why: str = "") -> dict | None:
    """Gemini + Google Search. Returns {text, sources, reasoning_segments, cost, model} or None."""
    if not os.environ.get("GEMINI_API_KEY"):
        return None
    turns = "".join(f"Earlier: Q: {h['question']} A: {h.get('answer', '')}\n" for h in (history or [])[-3:])
    prompt = WEB.format(name=Path(path).name, q=question, why=why, turns=turns)
    try:
        (text, gm), cost, model = _gemini(prompt, search=True)
        if not gm.get("groundingChunks"):   # the model sometimes skips the search; one retry
            (text2, gm2), cost2, model = _gemini(prompt, search=True)
            cost += cost2
            if gm2.get("groundingChunks"):
                text, gm = text2, gm2
    except Exception:
        try:   # search grounding has its own quota: model knowledge, shown as uncited
            (text, gm), cost, model = _gemini(prompt)
        except Exception:
            return None
    if not text.strip():
        return None
    chunks = [c.get("web", {}) for c in gm.get("groundingChunks", [])]
    segs = []
    for s in gm.get("groundingSupports", []):
        seg = (s.get("segment") or {}).get("text", "").strip()
        idx = [i for i in s.get("groundingChunkIndices", []) if i < len(chunks)]
        if seg and idx:
            segs.append((seg, idx))
    return {"text": re.sub(r"\*\*|__", "", text).strip(), "chunks": chunks, "segments": segs, "cost": cost, "model": model,
            "queries": gm.get("webSearchQueries", [])}


# ---------- sources + reasoning ----------

TIER_NAME = {"drawing": "this drawing", "project": "related sheet", "vlm": "vision model", "web": "web"}


def _tokens(line: str) -> set[str]:
    # ids like D2, 2.09, W-12 and quoted names; a bare "2" would match every label
    toks = {t.lower() for t in re.findall(r"\b[A-Za-z]{0,3}-?\d+(?:[.,]\d+)?\b", line)}
    toks |= {t.lower() for t in clarify.QUOTED.findall(line)}
    return {t for t in toks if len(t) >= 2}


def _match(line: str, ev: list[dict], ns: list[int]) -> list[int]:
    """Which evidence a trace line is about: shared numbers / quoted names with the evidence label."""
    toks = _tokens(line)
    if not toks:
        return []
    hit = [n for e, n in zip(ev, ns) if any(t in (e.get("label") or "").lower() for t in toks)]
    return hit if len(hit) < len(ns) or len(ns) <= 3 else []


def _cite(a: dict, tier: str, sources: list[dict], reasoning: list[dict], intro: str) -> None:
    ev = a.get("evidence") or []
    ns = []
    for i, e in enumerate(ev):
        n = len(sources) + 1
        sources.append({"n": n, "tier": tier, "ev": i, "file": e.get("file"), "page": e.get("page", 0),
                        "bbox": e.get("bbox") or [], "label": e.get("label") or e.get("kind", ""),
                        "kind": e.get("kind", "box"), "ifc_guid": e.get("ifc_guid")})
        ns.append(n)
    marked = sum(1 for e in ev if len(e.get("bbox") or []) == 4 or e.get("ifc_guid"))
    reasoning.append({"tier": tier, "text": intro + (f" · {marked} marked, one [n] each" if marked > 1 else ""), "src": ns})
    value = a.get("value")
    for line in a.get("trace") or []:
        if re.search(r" path, [\d.]+s$", line):
            continue
        src = _match(line, ev, ns)
        # a line that states the result ("door: 36 drawn on the DXF layer") is backed by every mark
        if not src and isinstance(value, (int, float)) and re.search(rf"(?<![\d.]){re.escape(str(value))}(?![\d])", line):
            src = ns
        reasoning.append({"tier": tier, "text": line, "src": src})


def _sheet(p: str) -> str:
    return Path(p).stem.replace("_", " ")


def _readers(skip) -> list[str]:
    return [n.rsplit(".", 1)[1] for n in router.PATHS if _load(n) is not None and n.rsplit(".", 1)[1] not in skip]


def _fmt(a: dict) -> str:
    v, u = a.get("value"), a.get("unit")
    return f"{v} {u}" if u and u != "count" else str(v)


def run(path: str, question: str, on_step: Step | None = None, history: list[dict] | None = None,
        related: list[str] | None = None, stoa: bool = False, view_of: Callable[[str], str] = lambda p: p,
        general: bool = False, asked: str | None = None, cost: float = 0.0) -> dict:
    """The whole chat answer. stoa = one of Stoa's own questions (tier 1 only, with the VLM, like the scorer).
    asked = the user's wording when the caller already resolved the follow-up (question is the standalone one)."""
    t0 = time.time()

    def step(kind: str, text: str, short: str = "") -> None:
        if on_step:
            on_step({"kind": kind, "path": short, "text": text, "t": round(time.time() - t0, 3)})

    sources: list[dict] = []
    reasoning: list[dict] = []
    q = question
    if asked is None and not stoa and history:
        q, c = followup(question, history)
        cost += c
    question = asked or question
    if q != question:
        reasoning.append({"tier": "chat", "text": f"Follow-up to the earlier question, read as \"{q}\"", "src": []})

    def done(a: dict, tier: str) -> dict:
        a["sources"], a["reasoning"], a["tier"] = sources, reasoning, tier
        a["cost_eur"] = round((a.get("cost_eur") or 0.0) + cost, 6)
        if q != question:
            a["followup"] = {"question": question, "standalone": q}
        return a

    # 1. this drawing
    if not general:
        step("tier", f"Step 1: everything I can read from this drawing ({_sheet(path)}).")
        a = route(path, q, on_step, skip=() if stoa else EXACT_SKIP).to_dict()
        if a["value"] is not None and not (a["method"] == "vlm" and isinstance(a["value"], str) and NOT_FOUND.search(a["value"])):
            _cite(a, "drawing", sources, reasoning,
                  f"Read from this drawing with the {a['method']} reader: {_fmt(a)}")
            a["view"] = view_of(path)
            return done(a, "drawing")
        tried = _readers(() if stoa else EXACT_SKIP)
        reasoning.append({"tier": "drawing", "text": f"This drawing: none of the exact readers ({', '.join(tried)}) could answer.", "src": []})
        if stoa:
            a["tried"] = tried
            a["view"] = view_of(path)
            return done(a, "none")

        # 2. related sheets of the project
        rel = [r for r in dict.fromkeys(related or []) if r != path][:MAX_RELATED]
        if rel:
            step("tier", f"Step 2: not on this sheet. Checking {len(rel)} related sheet(s) in the project.")
            checked = []
            for r in rel:
                if time.time() - t0 > RELATED_BUDGET_S:
                    step("skip", "Out of time for more sheets.")
                    break
                checked.append(_sheet(r))
                try:
                    b = route(r, q, None, skip=RELATED_SKIP).to_dict()
                except Exception:
                    continue
                if b["value"] is None:
                    step("skip", f"{_sheet(r)}: no.", "project")
                    continue
                step("found", f"Found it on {_sheet(r)} ({b['method']} reader).", "project")
                for line in b["trace"]:
                    step("trace", line, "project")
                reasoning.append({"tier": "project", "text": f"Checked related sheets: {', '.join(checked)}", "src": []})
                _cite(b, "project", sources, reasoning, f"Found on related sheet {_sheet(r)} with the {b['method']} reader: {_fmt(b)}")
                b["view"] = view_of(r)
                b["source_path"] = r
                b["confidence"] = min(b.get("confidence") or 0.0, 0.8)   # another sheet: worth a look
                return done(b, "project")
            reasoning.append({"tier": "project", "text": f"Related sheets checked, none had it: {', '.join(checked)}", "src": []})

        # 3a. vision model on this drawing
        if _load("sitelens.paths.vlm") is not None and os.environ.get("SITELENS_VLM"):
            step("tier", "Step 3: asking a vision model to look at this drawing.")
            from .paths import vlm
            try:
                v = vlm.answer(path, q)
            except Exception:
                v = None
            if v is not None and v.value is not None and not (isinstance(v.value, str) and NOT_FOUND.search(v.value)):
                d = v.to_dict()
                _cite(d, "vlm", sources, reasoning, f"A vision model read it off this drawing: {_fmt(d)} (model output, please check)")
                d["view"] = view_of(path)
                d["confidence"] = min(d.get("confidence") or 0.0, 0.5)
                return done(d, "vlm")
            if v is not None:
                cost += v.cost_eur or 0.0
            reasoning.append({"tier": "vlm", "text": "The vision model found nothing on the sheet either.", "src": []})

    # 3b. web search
    step("tier", "Step 3: not in the drawings. Searching the web." if not general
         else "This isn't about the drawing itself. Searching the web.")
    w = web(path, q, history, why="" if general else " (it isn't on this sheet or the related sheets)")
    if w is None:
        step("fail", "No web answer either.")
        a = {"value": None, "unit": None, "method": "none", "confidence": 0.0, "cost_eur": 0.0, "evidence": [],
             "trace": [], "tried": _readers(())}
        a["view"] = view_of(path)
        return done(a, "none")
    cost += w["cost"]
    for c in w["chunks"]:
        sources.append({"n": len(sources) + 1, "tier": "web", "url": c.get("uri", ""), "title": c.get("title", ""),
                        "label": c.get("title", "") or c.get("uri", "")})
    base = len(sources) - len(w["chunks"])
    if w["queries"]:
        reasoning.append({"tier": "web", "text": "Searched: " + "; ".join(w["queries"][:3]), "src": []})
    for seg, idx in w["segments"]:
        reasoning.append({"tier": "web", "text": seg, "src": [base + i + 1 for i in dict.fromkeys(idx)]})
    if not w["segments"]:
        reasoning.append({"tier": "web", "text": f"{w['model']} answered without a web source (model knowledge)",
                          "src": [base + i + 1 for i in range(len(w["chunks"]))]})
    step("found", f"Answered from {len(w['chunks'])} web source(s)." if w["chunks"] else "Answered from model knowledge.")
    a = {"value": w["text"], "unit": None, "method": "web" if w["chunks"] else "general", "confidence": 0.0,
         "cost_eur": 0.0, "evidence": [], "trace": [f"{w['model']} with Google Search"], "view": view_of(path)}
    return done(a, "web")
