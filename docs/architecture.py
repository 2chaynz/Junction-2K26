# Regenerates the SiteLens architecture figure: python3 docs/architecture.py docs/architecture.svg out.html
import sys
W, H = 1640, 1290
INK = "#1f1f24"; GREY = "#6b6b75"; LIGHT = "#f2f2f4"
C = {  # path colours: (front, top, side)
    "ifc":   ("#7b6cf0", "#a79df7", "#5a4bd1"),
    "vec":   ("#f59a6b", "#f9bf9e", "#d97a4c"),
    "det":   ("#f06b6b", "#f7a1a1", "#cf4a4a"),
    "vlm":   ("#8c8c96", "#b5b5bd", "#6e6e78"),
    "ans":   ("#3f8f6b", "#79bf9d", "#2d6e50"),
}
out = []
def a(s): out.append(s)

def cube(x, y, k, s=26, dashed=False):
    f, t, d = C[k]
    o = s * 0.32
    if dashed:
        st = f'fill="none" stroke="{INK}" stroke-width="2" stroke-dasharray="4 3"'
        a(f'<rect x="{x}" y="{y}" width="{s}" height="{s}" {st}/>')
        a(f'<path d="M{x},{y} l{o},{-o} h{s} v{s} l{-o},{o}" {st}/>')
        return
    a(f'<path d="M{x},{y} l{o},{-o} h{s} l{-o},{o} z" fill="{t}"/>')
    a(f'<path d="M{x+s},{y} l{o},{-o} v{s} l{-o},{o} z" fill="{d}"/>')
    a(f'<rect x="{x}" y="{y}" width="{s}" height="{s}" fill="{f}"/>')

def stack(x, y, k, n=3, gap=34, **kw):
    for i in range(n): cube(x, y + i * gap, k, **kw)

def box(x, y, w, h, label, sub=None, bold=False, fill=LIGHT, dash=False, fs=24, rot=False):
    sw = 3.5 if bold else 2.5
    da = ' stroke-dasharray="9 7"' if dash else ""
    a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{INK if not dash else GREY}" stroke-width="{sw}"{da}/>')
    cx, cy = x + w / 2, y + h / 2
    if rot:
        a(f'<text x="{cx}" y="{cy}" font-size="{fs}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 {cx} {cy})">{label}</text>')
        return
    dy = -10 if sub else 0
    a(f'<text x="{cx}" y="{cy+dy}" font-size="{fs}" text-anchor="middle" dominant-baseline="middle">{label}</text>')
    if sub:
        a(f'<text x="{cx}" y="{cy+18}" font-size="15" fill="{GREY}" text-anchor="middle" dominant-baseline="middle">{sub}</text>')

def arrow(x1, y1, x2, y2, dash=False, color=INK, w=3):
    da = ' stroke-dasharray="8 6"' if dash else ""
    m = "ah" if color == INK else "ahg"
    a(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{w}"{da} marker-end="url(#{m})"/>')

def path(d, dash=False, color=INK, w=3, end=True):
    da = ' stroke-dasharray="8 6"' if dash else ""
    m = ' marker-end="url(#%s)"' % ("ah" if color == INK else "ahg") if end else ""
    a(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}"{da}{m}/>')

def text(x, y, s, fs=18, anchor="middle", color=INK, it=False, rot=None, weight=None):
    st = ' font-style="italic"' if it else ""
    wt = f' font-weight="{weight}"' if weight else ""
    tr = f' transform="rotate({rot} {x} {y})"' if rot else ""
    a(f'<text x="{x}" y="{y}" font-size="{fs}" text-anchor="{anchor}" fill="{color}"{st}{wt}{tr}>{s}</text>')

# ---- thumbnails (input drawings) ----
def thumb_ifc(x, y):
    # isometric building
    a(f'<g stroke="{INK}" stroke-width="2" fill="#ece9fd">')
    a(f'<path d="M{x+20},{y+60} l60,-30 l60,30 v60 l-60,30 l-60,-30 z"/>')
    a(f'<path d="M{x+20},{y+60} l60,30 l60,-30" fill="none"/>')
    a(f'<path d="M{x+80},{y+90} v60" fill="none"/>')
    a(f'<path d="M{x+20},{y+90} l60,30 l60,-30" fill="none" stroke-dasharray="4 3"/>')
    a('</g>')
    text(x + 80, y + 172, "model.ifc", 15, color=GREY)

def thumb_vec(x, y):
    a(f'<g stroke="{INK}" stroke-width="2" fill="white">')
    a(f'<rect x="{x+15}" y="{y+20}" width="130" height="120"/>')
    a(f'<path d="M{x+80},{y+20} v70 M{x+15},{y+90} h130 M{x+110},{y+90} v50" fill="none"/>')
    a(f'<path d="M{x+80},{y+60} a18,18 0 0 1 18,18" fill="none" stroke-width="1.5"/>')
    a('</g>')
    for tx, ty, s in ((47, 55, "Zimmer"), (47, 70, "15.90 m²"), (112, 55, "Küche"), (60, 120, "Bad")):
        text(x + tx, y + ty, s, 11)
    text(x + 80, y + 172, "plan.pdf / .dxf", 15, color=GREY)

def thumb_det(x, y):
    a(f'<rect x="{x+15}" y="{y+20}" width="130" height="120" fill="#e9e6df" stroke="{INK}" stroke-width="4"/>')
    a(f'<path d="M{x+15},{y+75} h70 v65 M{x+85},{y+20} v30" fill="none" stroke="{INK}" stroke-width="4"/>')
    for (bx, by) in ((100, 95), (122, 95), (40, 40)):
        a(f'<rect x="{x+bx}" y="{y+by}" width="14" height="14" fill="none" stroke="{C["det"][2]}" stroke-width="2.5"/>')
    a(f'<rect x="{x+50}" y="{y+16}" width="28" height="8" fill="#9fc6e6" stroke="{INK}" stroke-width="1.5"/>')
    text(x + 80, y + 172, "scan.png", 15, color=GREY)

def thumb_vlm(x, y):
    a(f'<rect x="{x+15}" y="{y+20}" width="130" height="120" fill="#f4f1ea" stroke="{INK}" stroke-width="2"/>')
    a(f'<path d="M{x+25},{y+40} q30,-10 50,5 t50,0 M{x+25},{y+70} h90 M{x+40},{y+100} q20,15 60,-5" fill="none" stroke="{GREY}" stroke-width="2"/>')
    a(f'<rect x="{x+60}" y="{y+55}" width="60" height="40" fill="none" stroke="{INK}" stroke-width="2.5" stroke-dasharray="6 4"/>')
    text(x + 80, y + 172, "old sheet / any", 15, color=GREY)

# ---- layout ----
rows = [  # key, y-center, row label, reader, reader sub, tool, tool sub, cost, measured
    ("ifc", 160, "BIM", "ifcopenshell", "spaces · walls · slabs", "IFC query", "psets, sums per storey", "€0", "room areas 782/804"),
    ("vec", 380, "Vector", "PyMuPDF + ezdxf", "words · polylines · layers", "Geometry rules", "shape → class, room → unit", "€0", "Swiss 96.4% of 2,358 Qs"),
    ("det", 600, "Raster", "YOLO detector", "fine-tuned + OCR, on CPU", "Count boxes", "class filter per question", "€0 local", "open weights · T5/T6"),
    ("vlm", 820, "Fallback", "Crop renderer", "cuts out only the region", "Small open VLM", "Qwen3-VL-2B / Gemma", "€0 local", "open weights · T7"),
]
X_IN, X_RD, X_TOK, X_RT, X_TL, X_EV, X_ANS, X_OUT = 40, 250, 470, 590, 720, 990, 1110, 1430

a(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="SiteLens architecture: a question and a drawing go through a cheapest-first router over four paths (BIM, vector, raster detector, VLM fallback); each path returns a value with evidence boxes and a cost; answers are scored against Stoa\'s answer key; the detector is fine-tuned on CubiCasa5K excluding Stoa drawings." font-family="Times New Roman, Georgia, serif" fill="{INK}">')
a(f'<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{INK}"/></marker>'
  f'<marker id="ahg" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{GREY}"/></marker></defs>')
a(f'<rect width="{W}" height="{H}" fill="white"/>')

thumbs = {"ifc": thumb_ifc, "vec": thumb_vec, "det": thumb_det, "vlm": thumb_vlm}
for k, yc, lab, rd, rds, tl, tls, cost, meas in rows:
    text(X_IN - 8, yc, lab, 24, rot=-90)
    thumbs[k](X_IN, yc - 95)
    arrow(X_IN + 160, yc, X_RD - 6, yc)
    box(X_RD, yc - 42, 180, 84, rd, rds, fs=21)
    arrow(X_RD + 180, yc, X_TOK - 8, yc)
    stack(X_TOK, yc - 48, k, gap=34)
    # into router
    arrow(X_TOK + 40, yc, X_RT - 4, yc)
    # router -> tool
    arrow(X_RT + 90, yc, X_TL - 6, yc)
    box(X_TL, yc - 42, 200, 84, tl, tls, fs=21)
    text(X_TL + 100, yc + 66, f"{cost} · {meas}", 15, color=GREY, it=True)
    arrow(X_TL + 200, yc, X_EV - 6, yc)
    # evidence cubes: value + boxes
    cube(X_EV, yc - 40, "ans"); cube(X_EV + 34, yc - 40, k)
    cube(X_EV, yc - 6, "ans", dashed=(k == "vlm")); cube(X_EV + 34, yc - 6, k)
    cube(X_EV + 34, yc + 28, k)

# index caption
text(X_TOK + 20, 92, "Index", 22)

# router (tall, like 'Student')
box(X_RT, 105, 90, 780, "", bold=True)
text(X_RT + 38, 495, "Router", 34, rot=-90)
text(X_RT + 72, 495, "plain code · no model · €0", 16, color=GREY, it=True, rot=-90)
text(X_RT - 16, 118, "①", 22, color=GREY)
text(X_RT + 45, 935, "②", 22, color=GREY)
text(X_RD - 14, rows[3][1] - 46, "③", 22, color=GREY)
text(X_TL - 14, rows[3][1] - 46, "④", 22, color=GREY)
# fallthrough arrows inside router gap: None -> next
for i in range(3):
    y1 = rows[i][1] + 30; y2 = rows[i + 1][1] - 30
    text(X_RT + 108, (y1 + y2) / 2, "None → next", 14, anchor="start", color=GREY, it=True)
# question
box(X_RT - 45, 10, 180, 58, "Question", "any language", fs=21)
arrow(X_RT + 45, 68, X_RT + 45, 102)

# answer card
ay, ah = 300, 420
box(X_ANS, ay, 250, ah, "", fill="white", bold=True)
text(X_ANS + 125, ay + 38, "Answer", 26)
for i, (k, v) in enumerate((("value", "15.9"), ("unit", "m²"), ("evidence", "[file, page, bbox]"), ("trace", "steps"), ("cost_eur", "0.0"), ("confidence", "0.95"))):
    yy = ay + 90 + i * 50
    text(X_ANS + 22, yy, k, 18, anchor="start", weight="bold")
    text(X_ANS + 228, yy, v, 17, anchor="end", color=GREY)
for k, yc, *_ in rows:
    tx = X_EV + 74
    path(f"M{tx},{yc} C{tx+20},{yc} {X_ANS-30},{ay+ah/2} {X_ANS-4},{ay+ah/2}")
text(X_ANS + 125, ay - 18, "first path that answers wins", 15, color=GREY, it=True)

# outputs (dashed like loss boxes)
box(X_OUT, 170, 180, 200, "", dash=True, fill="#fafafa")
text(X_OUT + 90, 210, "Demo UI", 24)
for i, s in enumerate(("boxes on the plan", "step-by-step trace", "€ per answer")):
    text(X_OUT + 90, 250 + i * 32, s, 16, color=GREY)
box(X_OUT, 505, 180, 280, "", dash=True, fill="#fafafa")
text(X_OUT + 90, 545, "Scorer", 24)
for i, s in enumerate(("vs. answer key", "count: exact", "area/len/vol: ±2%", "dev split only", "baseline: Gemini API", "on full sheet (paid,", "comparison only)")):
    text(X_OUT + 90, 580 + i * 29, s, 16, color=GREY)
path(f"M{X_ANS+250},{ay+120} H{X_OUT-40} V270 H{X_OUT-4}", dash=True, color=GREY)
path(f"M{X_ANS+250},{ay+300} H{X_OUT-40} V635 H{X_OUT-4}", dash=True, color=GREY)
# answer key into scorer
box(X_OUT, 820, 180, 70, "questions.jsonl", "7,990 Qs · Stoa key", fs=19)
arrow(X_OUT + 90, 820, X_OUT + 90, 790, dash=True, color=GREY)

# training loop (dashed region, like Sinkhorn block)
ty = 1000
a(f'<rect x="{X_RD-20}" y="{ty-50}" width="{X_EV-X_RD+60}" height="92" rx="10" fill="#f6f6f8" stroke="{GREY}" stroke-width="2.5" stroke-dasharray="9 7"/>')
box(X_RD, ty - 34, 200, 64, "CubiCasa5K labels", "≈ 5k Finnish plans, SVG", fs=18)
arrow(X_RD + 200, ty - 4, X_RD + 250, ty - 4)
box(X_RD + 255, ty - 34, 200, 64, "exclude Stoa plans", "no test leakage", fs=18)
arrow(X_RD + 455, ty - 4, X_RD + 505, ty - 4)
box(X_RD + 510, ty - 34, 230, 64, "YOLO fine-tune", "Verda A100 · ≈ €4 of €200 credit", fs=18)
# weights up to detector
wx = X_RD + 625
path(f"M{wx},{ty+30} V{ty+62} H{X_RD-28} V{rows[2][1]+92} H{X_RD+90} V{rows[2][1]+46}", dash=True, color=GREY)
text(X_RD - 36, 760, "weights", 17, color=GREY, it=True, rot=-90)

# legend
lx, ly = X_ANS - 30, ty + 6
cube(lx, ly - 18, "ans", s=20); text(lx + 34, ly, "value", 17, anchor="start")
cube(lx + 110, ly - 18, "det", s=20); text(lx + 144, ly, "evidence (bbox / guid)", 17, anchor="start")
a(f'<line x1="{lx+340}" y1="{ly-6}" x2="{lx+390}" y2="{ly-6}" stroke="{GREY}" stroke-width="3" stroke-dasharray="8 6"/>')
text(lx + 400, ly, "offline / evaluation", 17, anchor="start")

# notes panel
NY = 1110
notes = [
    ("① Router", ["Plain code, not a model.", "Calls the paths in order;", "the first that answers wins.", "Costs nothing."]),
    ("② Cheapest first", ["Free, exact readers (BIM, vector)", "run before any model. A model", "only runs when they can't answer.", "Cost = 25% of Stoa's score."]),
    ("③ Crop renderer", ["Sends only a small region", "(title block, one room) to the VLM,", "not the whole sheet: faster,", "cheaper, and more accurate."]),
    ("④ €0 per answer", ["Detector and VLM are open weights", "running locally. Gemini is only the", "paid comparison baseline. Only paid", "step: detector training (credit)."]),
]
nw, gap = 380, 13
for i, (head, lines) in enumerate(notes):
    nx = 40 + i * (nw + gap)
    a(f'<rect x="{nx}" y="{NY}" width="{nw}" height="160" rx="10" fill="#f6f6f8" stroke="{GREY}" stroke-width="2"/>')
    text(nx + 18, NY + 34, head, 21, anchor="start", weight="bold")
    for j, ln in enumerate(lines):
        text(nx + 18, NY + 66 + j * 26, ln, 17, anchor="start", color="#3a3a42")

a('</svg>')
svg = "\n".join(out)
open(sys.argv[1], "w").write(svg)
html = f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SiteLens architecture</title>
<style>
body{{margin:0;padding:24px;font-family:Georgia,serif;background:#f4f4f6;color:#1f1f24}}
figure{{margin:0 auto;max-width:1640px;background:white;border-radius:12px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.12)}}
svg{{width:100%;height:auto;display:block}}
figcaption{{font-size:15px;line-height:1.5;color:#44444c;padding:12px 8px 4px;max-width:1100px}}
@media (prefers-color-scheme: dark){{body{{background:#17171b}}}}
</style></head><body>
<figure>
{svg}
<figcaption><b>SiteLens.</b> A question and a drawing enter a cheapest-first router. Each path reads the drawing its own way (BIM via ifcopenshell, vector PDF/DXF geometry, a fine-tuned YOLO detector on scans, a small VLM on crops as last resort) and returns a value with evidence boxes and a cost; a path that can't answer returns None and the next one tries. Answers are scored against Stoa's answer key (counts exact, quantities ±2%) and shown in the UI with highlights, trace and €/answer. The detector is fine-tuned offline on public CubiCasa5K labels with every Stoa drawing excluded.</figcaption>
</figure></body></html>'''
open(sys.argv[2], "w").write(html)
