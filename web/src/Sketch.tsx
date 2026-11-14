import { useRef, useState } from "react";
import type { Mark } from "./types";
import "./sketch.css";

const BRUSH_PX = 14; // brush radius on screen; stored in sheet units so it scales with zoom

type Props = {
  w: number;
  h: number;
  s: number; // current zoom: sheet units → screen px
  pen: boolean;
  mark: Mark | null;
  onMark: (m: Mark | null) => void;
};

function d(points: number[][]): string {
  if (points.length === 1) return `M${points[0][0]},${points[0][1]} l0.01,0`;
  return "M" + points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L");
}

// Highlighter layer over the sheet: paint over a spot, then ask about it. Same coords as evidence bboxes.
export default function Sketch({ w, h, s, pen, mark, onMark }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [live, setLive] = useState<number[][] | null>(null);

  const toSheet = (e: React.PointerEvent): number[] => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [p.x, p.y];
  };

  const r = BRUSH_PX / s;
  const shown = live ?? mark?.points ?? null;
  const width = 2 * (live ? r : mark?.r ?? r);

  return (
    <svg
      ref={svg}
      className={`sketch ${pen ? "pen" : ""}`}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      onMouseDown={(e) => pen && e.stopPropagation()}
      onPointerDown={(e) => {
        if (!pen || e.button !== 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setLive([toSheet(e)]);
      }}
      onPointerMove={(e) => {
        if (!live) return;
        const p = toSheet(e);
        const q = live[live.length - 1];
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) * s > 3) setLive([...live, p]); // thin out: one point per 3 px
      }}
      onPointerUp={() => {
        if (!live) return;
        const xs = live.map((p) => p[0]), ys = live.map((p) => p[1]);
        onMark({
          page: 0,
          points: live,
          r,
          bbox: [Math.min(...xs) - r, Math.min(...ys) - r, Math.max(...xs) + r, Math.max(...ys) + r],
        });
        setLive(null);
      }}
    >
      {shown && <path className="hl" d={d(shown)} style={{ strokeWidth: width }} />}
    </svg>
  );
}
