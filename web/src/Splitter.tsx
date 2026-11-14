import { useCallback, useEffect, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import "./splitter.css";

const KEY = "sitelens.panels";
const DEF = { explorer: 288, chat: 400 };
const MIN = { explorer: 180, chat: 300 };
const MAX = { explorer: 560, chat: 820 };
const STAGE_MIN = 360; // the drawing never gets squeezed below this
type Side = keyof typeof DEF;
type Widths = Record<Side, number>;

function saved(): Widths {
  try {
    return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEF;
  }
}

/** Panel widths for the Ask view, kept in localStorage. Spread `props` on `.askview`. */
export function usePanels() {
  const [w, setW] = useState<Widths>(saved);
  useEffect(() => localStorage.setItem(KEY, JSON.stringify(w)), [w]);
  const set = useCallback((side: Side, px: number) => setW((o) => ({ ...o, [side]: px })), []);
  // Collapsed explorer keeps a 14 px strip with the re-open button.
  const style = { "--explorer": `${w.explorer || 14}px`, "--chat": `${w.chat}px` } as CSSProperties;
  return { w, set, props: { style, "data-explorer": w.explorer ? "on" : "off" } };
}

type Props = { side: Side; w: Widths; onChange: (side: Side, px: number) => void };

export function Splitter({ side, w, onChange }: Props) {
  const value = w[side];
  const other = side === "explorer" ? w.chat : w.explorer;

  function down(e: RPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const host = e.currentTarget.parentElement!.getBoundingClientRect();
    const el = e.currentTarget;
    document.body.classList.add("resizing");
    el.classList.add("drag");
    const move = (ev: PointerEvent) => {
      let px = side === "explorer" ? ev.clientX - host.left : host.right - ev.clientX;
      const max = Math.min(MAX[side], host.width - other - STAGE_MIN);
      if (side === "explorer" && px < MIN.explorer * 0.6) px = 0; // drag far enough left → collapse
      else px = Math.max(MIN[side], Math.min(px, max));
      onChange(side, Math.round(px));
    };
    const up = () => {
      document.body.classList.remove("resizing");
      el.classList.remove("drag");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    e.preventDefault();
  }

  function key(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 64 : 16;
    const grow = side === "explorer" ? "ArrowRight" : "ArrowLeft";
    const shrink = side === "explorer" ? "ArrowLeft" : "ArrowRight";
    if (e.key !== grow && e.key !== shrink) return;
    e.preventDefault();
    const px = value + (e.key === grow ? step : -step);
    onChange(side, Math.max(side === "explorer" && px < MIN.explorer ? 0 : MIN[side], Math.min(px, MAX[side])));
  }

  const collapsed = side === "explorer" && value === 0;
  return (
    <div
      className={`splitter sp-${side} ${collapsed ? "collapsed" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={side === "explorer" ? "Resize drawings list" : "Resize chat"}
      aria-valuenow={value}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={down}
      onDoubleClick={() => onChange(side, DEF[side])}
      onKeyDown={key}
    >
      {collapsed && (
        <button className="splitter-open" onClick={() => onChange("explorer", DEF.explorer)} title="Show drawings">
          ›
        </button>
      )}
    </div>
  );
}
