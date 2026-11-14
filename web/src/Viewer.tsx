import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fileUrl, viewScale } from "./api";
import { changeKind } from "./Changes";
import { fmtAnswer } from "./format";
import Sketch from "./Sketch";
import type { Answer, Mark, Shape, Tool } from "./types";

type Props = {
  view: string;
  answer: Answer | null;
  hover: number | null;
  focus: number | null;
  onHover: (i: number | null) => void;
  onFocus: (i: number | null) => void;
  onSize?: (w: number, h: number) => void;
  busy: boolean;
  changes?: boolean; // revision diff: colour marks by added / removed / changed, no margin note
  pen?: boolean; // T49 highlighter: drag paints a mark instead of panning
  mark?: Mark | null;
  onPen?: (on: boolean) => void;
  onMark?: (m: Mark | null) => void;
  // Measure: takeoff shapes to draw, the active draw tool and the scale for the live readout.
  shapes?: Shape[];
  tool?: Tool | null;
  mpu?: number | null;
  hotShape?: string | null;
  onShapeHover?: (id: string | null) => void;
  onShapeClick?: (id: string) => void;
  onDraw?: (points: number[][]) => void;
  zoomTo?: number[] | null; // [x0,y0,x1,y1] to fit, e.g. a reference box
  extra?: ReactNode; // more sheet tools (Measure) in the same toolbar
};

const CLOSED: Tool[] = ["area", "calarea"];

function readout(pts: number[][], tool: Tool, mpu: number | null | undefined): string {
  if (tool === "count") return `${pts.length}`;
  if (!mpu || pts.length < 2) return "";
  if (CLOSED.includes(tool) && pts.length >= 3) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      a += x0 * y1 - x1 * y0;
    }
    return `${((Math.abs(a) / 2) * mpu * mpu).toFixed(2)} m²`;
  }
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return `${(l * mpu).toFixed(2)} m`;
}

type T = { s: number; x: number; y: number };
type Box = { i: number; x0: number; y0: number; x1: number; y1: number; label: string; poly: number[][] | null };

// Deterministic jitter so a circle keeps its hand-drawn shape across renders.
function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// Large regions (rooms) get a wobbly rectangle: overlapping loops would hide the plan.
function penRect(b: Box, pad: number): string {
  const x0 = b.x0 - pad, y0 = b.y0 - pad, x1 = b.x1 + pad, y1 = b.y1 + pad;
  const j = (k: number) => (rand(b.i * 17 + k) - 0.5) * pad * 1.2;
  return `M${x0 + j(1)},${y0 + j(2)} L${x1 + j(3)},${y0 + j(4)} L${x1 + j(5)},${y1 + j(6)} ` +
    `L${x0 + j(7)},${y1 + j(8)} L${x0 + j(9)},${y0 + j(10) + pad * 1.5}`;
}

function penLoop(b: Box, minR: number): string {
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const rx = Math.max((b.x1 - b.x0) / 2 * 1.35, minR);
  const ry = Math.max((b.y1 - b.y0) / 2 * 1.35, minR);
  const start = rand(b.i) * Math.PI * 2;
  const n = 34;
  const pts: string[] = [];
  for (let k = 0; k <= n; k++) {
    const t = start + (k / n) * (Math.PI * 2 + 0.45); // overlap the start, like a pen
    const j = 1 + (rand(b.i * 31 + k) - 0.5) * 0.12 + (k / n) * 0.08;
    pts.push(`${(cx + Math.cos(t) * rx * j).toFixed(2)},${(cy + Math.sin(t) * ry * j).toFixed(2)}`);
  }
  return "M" + pts.join(" L");
}

export default function Viewer({
  view, answer, hover, focus, onHover, onFocus, onSize, busy, changes, pen, mark, onPen, onMark,
  shapes = [], tool = null, mpu, hotShape, onShapeHover, onShapeClick, onDraw, zoomTo, extra,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [t, setT] = useState<T>({ s: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const drag = useRef<{ x: number; y: number; t: T } | null>(null);
  const scale = viewScale(view);
  const [draft, setDraft] = useState<number[][]>([]);
  const [cursor, setCursor] = useState<number[] | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => setSize(null), [view]);
  useEffect(() => setDraft([]), [tool, view]);

  const toPaper = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return [+((e.clientX - r.left - t.x) / t.s).toFixed(2), +((e.clientY - r.top - t.y) / t.s).toFixed(2)];
  };

  function finish(pts = draft) {
    if (!tool || !onDraw) return;
    const need = tool === "count" ? 1 : CLOSED.includes(tool) ? 3 : 2;
    if (pts.length >= need) onDraw(pts);
    setDraft([]);
  }

  function addPoint(p: number[]) {
    if (!tool) return;
    const last = draft[draft.length - 1];
    if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) * t.s < 4) return; // double-click's second click
    const first = draft[0];
    // clicking the first point closes an area
    if (CLOSED.includes(tool) && first && draft.length >= 3 && Math.hypot(first[0] - p[0], first[1] - p[1]) * t.s < 10)
      return finish();
    const next = [...draft, p];
    if (tool === "calibrate" && next.length === 2) return finish(next);
    setDraft(next);
  }

  useEffect(() => {
    if (!tool) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Escape") setDraft([]);
      if (e.key === "Enter") finish();
      if (e.key === "Backspace") setDraft((d) => d.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const boxes: Box[] = useMemo(() => {
    if (!answer) return [];
    return answer.evidence
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.file === view && e.bbox.length === 4 && e.label !== "your mark")
      .map(({ e, i }) => ({ i, x0: e.bbox[0], y0: e.bbox[1], x1: e.bbox[2], y1: e.bbox[3], label: e.label, poly: e.polygon }));
  }, [answer, view]);

  const fitTo = useCallback(
    (x0: number, y0: number, x1: number, y1: number, pad: number, smooth: boolean) => {
      const el = box.current;
      if (!el || !size) return;
      const cw = el.clientWidth, ch = el.clientHeight;
      if (!cw || !ch) return; // not laid out yet: a zero scale would put marks at infinity
      const full = Math.min(cw / size.w, ch / size.h) * 0.96;
      const w = Math.max(x1 - x0, 1) * pad, h = Math.max(y1 - y0, 1) * pad;
      const s = Math.min(Math.max(Math.min(cw / w, ch / h), full), full * 10);
      setAnimate(smooth);
      setT({ s, x: cw / 2 - ((x0 + x1) / 2) * s, y: ch / 2 - ((y0 + y1) / 2) * s });
    },
    [size],
  );

  const fitAll = useCallback(() => size && fitTo(0, 0, size.w, size.h, 1, true), [size, fitTo]);

  const fitEvidence = useCallback(() => {
    if (!size) return;
    if (boxes.length === 0) return fitTo(0, 0, size.w, size.h, 1, false);
    const x0 = Math.min(...boxes.map((b) => b.x0)), y0 = Math.min(...boxes.map((b) => b.y0));
    const x1 = Math.max(...boxes.map((b) => b.x1)), y1 = Math.max(...boxes.map((b) => b.y1));
    fitTo(x0, y0, x1, y1, 1.5, true);
  }, [boxes, size, fitTo]);

  useEffect(() => {
    if (zoomTo && zoomTo.length === 4) fitTo(zoomTo[0], zoomTo[1], zoomTo[2], zoomTo[3], 2.2, true);
  }, [zoomTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // New answer → zoom to all evidence; no evidence → whole sheet.
  useEffect(() => fitEvidence(), [fitEvidence]);

  useEffect(() => {
    const b = boxes.find((x) => x.i === focus);
    if (b) fitTo(b.x0, b.y0, b.x1, b.y1, 1.8, true);
    else if (focus === null) fitEvidence();
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  function onWheel(e: React.WheelEvent) {
    const el = box.current!;
    const r = el.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = Math.exp(-e.deltaY * 0.0015);
    setAnimate(false);
    setT((p) => ({ s: p.s * k, x: mx - (mx - p.x) * k, y: my - (my - p.y) * k }));
  }

  const union = boxes.length
    ? { x: Math.max(...boxes.map((b) => b.x1)), y: Math.min(...boxes.map((b) => b.y0)) }
    : null;
  const note = answer && boxes.length && !changes ? fmtAnswer(answer) : "";

  return (
    <div
      className={`viewer ${tool ? "drawing" : ""}`}
      ref={box}
      onWheel={onWheel}
      onMouseDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, t };
        down.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        const d = down.current;
        if (tool && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) addPoint(toPaper(e));
      }}
      onMouseMove={(e) => {
        if (tool) setCursor(toPaper(e));
        const d = drag.current;
        if (!d) return;
        setAnimate(false);
        setT({ ...d.t, x: d.t.x + e.clientX - d.x, y: d.t.y + e.clientY - d.y });
      }}
      onMouseUp={() => (drag.current = null)}
      onMouseLeave={() => (drag.current = null)}
      onDoubleClick={() => (tool ? finish() : fitAll())}
    >
      <div
        className={`paper ${animate ? "smooth" : ""}`}
        style={{
          width: size?.w ?? 0,
          height: size?.h ?? 0,
          transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`,
        }}
      >
        <img
          key={view}
          src={fileUrl(view, scale)}
          draggable={false}
          onLoad={(e) => {
            const im = e.currentTarget;
            setSize({ w: im.naturalWidth / scale, h: im.naturalHeight / scale });
            onSize?.(im.naturalWidth / scale, im.naturalHeight / scale);
          }}
          style={{ width: size?.w, height: size?.h }}
          alt=""
        />
        {size && (
          <svg className="redline" viewBox={`0 0 ${size.w} ${size.h}`} width={size.w} height={size.h}>
            {boxes.map((b, k) => (
              <g
                key={`${answer?.trace.join()}-${b.i}`}
                className={`mark ${changes ? `k-${changeKind(b.label)}` : ""} ${hover === b.i ? "hot" : ""} ${focus === b.i ? "focus" : ""} ${
                  focus !== null && focus !== b.i ? "dim" : ""
                }`}
                onMouseEnter={() => onHover(b.i)}
                onMouseLeave={() => onHover(null)}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => onFocus(focus === b.i ? null : b.i)}
              >
                {b.poly && b.poly.length > 2 && (
                  <polygon className="area" points={b.poly.map((p) => p.join(",")).join(" ")} />
                )}
                {changes ? (
                  // revision diff: a flat highlighter over the changed cells, like a marker on a printed table
                  <rect
                    className="hl"
                    x={b.x0 - 1}
                    y={b.y0 - 1}
                    width={b.x1 - b.x0 + 2}
                    height={b.y1 - b.y0 + 2}
                    style={{ strokeWidth: (hover === b.i || focus === b.i ? 2 : 0) / t.s }}
                  />
                ) : (
                  <path
                    d={Math.max(b.x1 - b.x0, b.y1 - b.y0) * t.s > 70 ? penRect(b, 3 / t.s) : penLoop(b, 9 / t.s)}
                    pathLength={1}
                    style={{
                      animationDelay: `${Math.min(k * 45, 1400)}ms`,
                      // Firefox ignores non-scaling-stroke under CSS transforms: keep width in screen px by hand.
                      strokeWidth: (hover === b.i || focus === b.i ? 4.5 : 2.4) / t.s,
                    }}
                  />
                )}
                {boxes.length <= 60 && !changes && (
                  <text x={Math.max(b.x1, b.x0 + 9 / t.s) + 4 / t.s} y={b.y0 - 2 / t.s} fontSize={13 / t.s}>
                    {b.i + 1}
                  </text>
                )}
              </g>
            ))}
            {shapes.map((sh) => (
              <g
                key={sh.id}
                className={`mshape t-${sh.tone} ${hotShape === sh.id ? "hot" : ""}`}
                onMouseEnter={() => onShapeHover?.(sh.id)}
                onMouseLeave={() => onShapeHover?.(null)}
                onMouseDown={(e) => tool || e.stopPropagation()}
                onClick={(e) => {
                  if (tool) return;
                  e.stopPropagation();
                  onShapeClick?.(sh.id);
                }}
              >
                {sh.tone === "count"
                  ? sh.points.map((p, k) => <circle key={k} cx={p[0]} cy={p[1]} r={6 / t.s} style={{ strokeWidth: 2 / t.s }} />)
                  : sh.closed
                    ? <polygon points={sh.points.map((p) => p.join(",")).join(" ")} style={{ strokeWidth: (hotShape === sh.id ? 3.5 : 1.8) / t.s }} />
                    : <polyline points={sh.points.map((p) => p.join(",")).join(" ")} style={{ strokeWidth: (hotShape === sh.id ? 3.5 : 2.2) / t.s }} />}
                {sh.label && (hotShape === sh.id || shapes.length <= 40) && (
                  <text
                    x={sh.points.reduce((a, p) => a + p[0], 0) / sh.points.length}
                    y={sh.points.reduce((a, p) => a + p[1], 0) / sh.points.length}
                    fontSize={(hotShape === sh.id ? 14 : 11) / t.s}
                  >
                    {sh.label}
                  </text>
                )}
              </g>
            ))}
            {tool && draft.length > 0 && (
              <g className="mdraft">
                {(() => {
                  const pts = cursor ? [...draft, cursor] : draft;
                  const str = pts.map((p) => p.join(",")).join(" ");
                  const last = pts[pts.length - 1];
                  return (
                    <>
                      {tool === "count" ? null : CLOSED.includes(tool) ? (
                        <polygon points={str} style={{ strokeWidth: 2 / t.s }} />
                      ) : (
                        <polyline points={str} style={{ strokeWidth: 2 / t.s }} />
                      )}
                      {draft.map((p, k) => <circle key={k} cx={p[0]} cy={p[1]} r={4 / t.s} />)}
                      <text x={last[0] + 10 / t.s} y={last[1] - 10 / t.s} fontSize={14 / t.s}>
                        {readout(tool === "count" ? draft : pts, tool, mpu)}
                      </text>
                    </>
                  );
                })()}
              </g>
            )}
            {union && note && (
              <g className="margin-note" transform={`translate(${union.x + 14 / t.s} ${union.y - 10 / t.s})`}>
                <text fontSize={30 / t.s}>{note}</text>
                <path d={`M0 ${8 / t.s} q ${60 / t.s} ${6 / t.s} ${120 / t.s} 0`} style={{ strokeWidth: 2 / t.s }} />
              </g>
            )}
          </svg>
        )}
        {size && onMark && <Sketch w={size.w} h={size.h} s={t.s} pen={!!pen} mark={mark ?? null} onMark={onMark} />}
      </div>
      {busy && <div className="busy" />}
      <div className="viewer-tools" onMouseDown={(e) => e.stopPropagation()}>
        <button onClick={fitAll}>Page</button>
        {onPen && (
          <button className={pen ? "pen-on" : ""} onClick={() => onPen(!pen)} title="Paint over a spot, then ask about it">
            Highlight
          </button>
        )}
        {boxes.length > 0 && <button onClick={() => (focus === null ? fitEvidence() : onFocus(null))}>All marks</button>}
        {extra}
      </div>
      <div className="viewer-hint mono">
        {tool
          ? tool === "calibrate"
            ? "click both ends of the known dimension"
            : `click to add points · ${tool === "count" ? "Enter to finish" : "double-click or Enter to finish"} · Backspace undo · Esc cancel`
          : pen
            ? "paint over a spot, then ask about it · Esc to stop"
            : "scroll to zoom · drag to pan · double-click to fit"}
      </div>
    </div>
  );
}
