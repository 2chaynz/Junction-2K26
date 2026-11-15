import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { T } from "./introTime";
import "./intro.css";

const Scene = lazy(() => import("./IntroScene"));

const DOORS = 6;

// No WebGL or a failed chunk must cost only the animation, never the app.
class Quiet extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function show() {
  const q = new URLSearchParams(location.search);
  if (q.has("intro")) return true;
  // Scripted browsers (video capture, tests) would be blocked by the overlay.
  if (q.has("nointro") || navigator.webdriver) return false;
  // plays on every page load: it is the loading screen, not a one-time tour
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Intro() {
  const [open, setOpen] = useState(show);
  const [leaving, setLeaving] = useState(false);
  const [start, setStart] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const bar = useRef<HTMLSpanElement>(null);
  const count = useRef<HTMLDivElement>(null);
  const num = useRef<HTMLSpanElement>(null);

  const ready = useCallback(() => setStart(performance.now()), []);
  // Don't wait forever for the 3D chunk.
  useEffect(() => {
    const id = setTimeout(() => setStart((s) => s ?? performance.now()), 1200);
    const safe = setTimeout(() => setDone(true), 4000); // title shows even if the scene never runs
    return () => (clearTimeout(id), clearTimeout(safe));
  }, []);

  // Called by the scene every frame: overlay follows the animation exactly, no React re-render.
  const frame = useCallback((t: number) => {
    if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, t / T.end)})`;
    const found = Math.round(Math.min(1, Math.max(0, (t - T.marks[0]) / (T.marks[1] - T.marks[0] - 0.1))) * DOORS);
    if (num.current && num.current.textContent !== String(found)) num.current.textContent = String(found);
    count.current?.classList.toggle("on", found > 0);
    if (t >= T.end) setDone(true);
  }, []);

  const enter = useCallback(() => {
    setLeaving(true);
    setTimeout(() => setOpen(false), 450);
  }, []);
  // a loading screen moves on by itself; click or a key still skips it sooner
  useEffect(() => {
    if (!done || !open) return;
    const id = setTimeout(enter, 1800);
    return () => clearTimeout(id);
  }, [done, open, enter]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => ["Enter", "Escape", " "].includes(e.key) && (e.preventDefault(), enter());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, enter]);

  if (!open) return null;
  return (
    <div className={`intro ${done ? "done" : ""} ${leaving ? "leaving" : ""}`} role="dialog" aria-label="Sindri intro">
      <Quiet onError={() => setDone(true)}>
        <Suspense fallback={null}>
          <Scene start={start} onReady={ready} onFrame={frame} />
        </Suspense>
      </Quiet>

      <div className="intro-progress"><span ref={bar} /></div>
      <button className="intro-skip" onClick={enter}>Skip</button>

      {/* Live counter, written like the answer line in the app */}
      <div ref={count} className="intro-count">
        <span ref={num} className="n">0</span> doors found
      </div>

      <div className="intro-hero">
        <h1 className="wordmark">Sindri</h1>
        <p>Ask your drawings. See the answer on the plan.</p>
        <button className="intro-enter" onClick={enter} tabIndex={done ? 0 : -1}>
          Open <span className="wordmark">Sindri</span> <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}
