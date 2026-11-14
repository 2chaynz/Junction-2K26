import { useRef, useState } from "react";
import { fileUrl, isImage } from "./api";
import { projectOf, shortName } from "./format";
import type { Drawing } from "./types";

type Props = { floors: Drawing[]; selected: string; onPick: (path: string) => void };

const thumb = (d: Drawing) => fileUrl(d.view, isImage(d.view) ? 0.5 : 0.75);
const floorName = (d: Drawing, i: number) => `L${i + 1} · floor ${projectOf(d)?.floor ?? shortName(d.path)}`;

/** 2D floor plans of one building, put back together: an exploded stack like a BIM model, or stitched side by side. */
export default function Stack({ floors, selected, onPick }: Props) {
  const [layout, setLayout] = useState<"stack" | "strip">("stack");
  const [spread, setSpread] = useState(70);
  const [turn, setTurn] = useState(-35);
  const [tilt, setTilt] = useState(58);
  const [hover, setHover] = useState<string | null>(null);
  const [aspect, setAspect] = useState(1.4);
  const drag = useRef<{ x: number; y: number; turn: number; tilt: number; moved: boolean } | null>(null);
  const label = projectOf(floors[0])?.label ?? "";

  const onDown = (e: React.PointerEvent) => {
    if (layout !== "stack") return;
    drag.current = { x: e.clientX, y: e.clientY, turn, tilt, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) {
      // Capture only once it's a drag: capturing on pointerdown would retarget the click away from the floor.
      d.moved = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (!d.moved) return;
    setTurn(d.turn + dx * 0.4);
    setTilt(Math.max(0, Math.min(80, d.tilt - dy * 0.3)));
  };
  const onUp = () => setTimeout(() => (drag.current = null));
  const pick = (p: string) => !drag.current?.moved && onPick(p);

  // Fit the stack: plate width shrinks as floors and spread grow so the top floor stays on screen.
  const plateW = Math.max(220, Math.min(520, 900 / (1 + (floors.length * spread) / 400)));

  return (
    <div className="stackview">
      <div className="stackbar">
        <span className="mono dim">{label}</span>
        <span className="dim">· {floors.length} floors</span>
        <span className="spacer" />
        <div className="seg">
          <button className={layout === "stack" ? "on" : ""} onClick={() => setLayout("stack")}>Stacked</button>
          <button className={layout === "strip" ? "on" : ""} onClick={() => setLayout("strip")}>Side by side</button>
        </div>
        {layout === "stack" && (
          <label className="spread dim">
            spread
            <input type="range" min={20} max={160} value={spread} onChange={(e) => setSpread(+e.target.value)} />
          </label>
        )}
      </div>

      {layout === "stack" ? (
        <div className="stage3d" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div
            className="stack3d"
            style={{
              width: plateW,
              height: plateW / aspect,
              transform: `translateY(${(floors.length * spread) / 2.5}px) rotateX(${tilt}deg) rotateZ(${turn}deg)`,
            }}
          >
            {floors.map((d, i) => {
              const on = d.path === selected, hot = d.path === hover;
              return (
                <button
                  key={d.path}
                  className={`plate ${on ? "on" : ""} ${hot ? "hot" : ""}`}
                  style={{ transform: `translateZ(${i * spread + (hot ? 14 : 0)}px)` }}
                  onClick={() => pick(d.path)}
                  onPointerEnter={() => setHover(d.path)}
                  onPointerLeave={() => setHover(null)}
                  title={`${d.path}\nclick to open this floor`}
                >
                  <img
                    src={thumb(d)}
                    alt=""
                    draggable={false}
                    onLoad={(e) => i === 0 && setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || 1.4)}
                  />
                  <span className="plabel mono">{floorName(d, i)}</span>
                </button>
              );
            })}
          </div>
          <p className="stackhint dim">drag to orbit · click a floor to open it</p>
        </div>
      ) : (
        <div className="strip">
          {floors.map((d, i) => (
            <button key={d.path} className={`sheet ${d.path === selected ? "on" : ""}`} onClick={() => onPick(d.path)} title={d.path}>
              <img src={thumb(d)} alt="" loading="lazy" />
              <span className="plabel mono">{floorName(d, i)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
