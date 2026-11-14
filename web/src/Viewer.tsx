import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fileUrl, viewScale } from "./api";
import { fmtAnswer } from "./format";
import type { Answer } from "./types";

type Props = {
  view: string;
  answer: Answer | null;
  hover: number | null;
  focus: number | null;
  onHover: (i: number | null) => void;
  onFocus: (i: number | null) => void;
  onSize?: (w: number, h: number) => void;
  busy: boolean;
};

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

export default function Viewer({ view, answer, hover, focus, onHover, onFocus, onSize, busy }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [t, setT] = useState<T>({ s: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const drag = useRef<{ x: number; y: number; t: T } | null>(null);
  const scale = viewScale(view);

  useEffect(() => setSize(null), [view]);

  const boxes: Box[] = useMemo(() => {
    if (!answer) return [];
    return answer.evidence
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.file === view && e.bbox.length === 4)
      .map(({ e, i }) => ({ i, x0: e.bbox[0], y0: e.bbox[1], x1: e.bbox[2], y1: e.bbox[3], label: e.label, poly: e.polygon }));
  }, [answer, view]);

  const fitTo = useCallback(
    (x0: number, y0: number, x1: number, y1: number, pad: number, smooth: boolean) => {
      const el = box.current;
      if (!el || !size) return;
      const cw = el.clientWidth, ch = el.clientHeight;
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
  const note = answer && boxes.length ? fmtAnswer(answer) : "";

  return (
    <div
      className="viewer"
      ref={box}
      onWheel={onWheel}
      onMouseDown={(e) => (drag.current = { x: e.clientX, y: e.clientY, t })}
      onMouseMove={(e) => {
        const d = drag.current;
        if (!d) return;
        setAnimate(false);
        setT({ ...d.t, x: d.t.x + e.clientX - d.x, y: d.t.y + e.clientY - d.y });
      }}
      onMouseUp={() => (drag.current = null)}
      onMouseLeave={() => (drag.current = null)}
      onDoubleClick={fitAll}
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
                className={`mark ${hover === b.i ? "hot" : ""} ${focus === b.i ? "focus" : ""} ${
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
                <path
                  d={Math.max(b.x1 - b.x0, b.y1 - b.y0) * t.s > 70 ? penRect(b, 3 / t.s) : penLoop(b, 9 / t.s)}
                  pathLength={1}
                  style={{
                    animationDelay: `${Math.min(k * 45, 1400)}ms`,
                    // Firefox ignores non-scaling-stroke under CSS transforms: keep width in screen px by hand.
                    strokeWidth: (hover === b.i || focus === b.i ? 4.5 : 2.4) / t.s,
                  }}
                />
                {boxes.length <= 60 && (
                  <text x={Math.max(b.x1, b.x0 + 9 / t.s) + 4 / t.s} y={b.y0 - 2 / t.s} fontSize={13 / t.s}>
                    {b.i + 1}
                  </text>
                )}
              </g>
            ))}
            {union && note && (
              <g className="margin-note" transform={`translate(${union.x + 14 / t.s} ${union.y - 10 / t.s})`}>
                <text fontSize={30 / t.s}>{note}</text>
                <path d={`M0 ${8 / t.s} q ${60 / t.s} ${6 / t.s} ${120 / t.s} 0`} style={{ strokeWidth: 2 / t.s }} />
              </g>
            )}
          </svg>
        )}
      </div>
      {busy && <div className="busy" />}
      <div className="viewer-tools" onMouseDown={(e) => e.stopPropagation()}>
        <button onClick={fitAll}>Page</button>
        {boxes.length > 0 && <button onClick={() => (focus === null ? fitEvidence() : onFocus(null))}>All marks</button>}
      </div>
      <div className="viewer-hint mono">scroll to zoom · drag to pan · double-click to fit</div>
    </div>
  );
}
