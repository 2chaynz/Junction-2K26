import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import "./motion.css";

export const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True once the element has scrolled into view (stays true). */
export function useInView<T extends Element>(ref: RefObject<T>, margin = "0px 0px -10% 0px"): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (reduced() || typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen, margin]);
  return seen;
}

/** Fades the direct children of `ref` up as each scrolls into view, once. Children that mount later
 *  (data loaded after the page) are picked up too; untagged children are never hidden. */
export function useReveal<T extends HTMLElement>(ref: RefObject<T>) {
  useEffect(() => {
    const root = ref.current;
    if (!root || reduced() || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
      { rootMargin: "0px 0px -6% 0px" },
    );
    let n = 0;
    const tag = () =>
      ([...root.children] as HTMLElement[]).forEach((k) => {
        if (k.classList.contains("rv")) return;
        k.classList.add("rv");
        k.style.transitionDelay = `${Math.min(n++, 4) * 70}ms`;
        io.observe(k);
      });
    tag();
    const mo = new MutationObserver(tag);
    mo.observe(root, { childList: true });
    return () => (io.disconnect(), mo.disconnect());
  }, [ref]);
}

/** Counts from 0 to `to` once `run` is true; keeps the decimals of `to`. */
export function CountUp({ to, run = true, decimals, ms = 1000 }: { to: number; run?: boolean; decimals?: number; ms?: number }) {
  const d = decimals ?? (String(to).split(".")[1]?.length ?? 0);
  const [v, setV] = useState(reduced() ? to : 0);
  useEffect(() => {
    if (!run) return;
    if (reduced()) return setV(to);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - t0) / ms, 1);
      setV(to * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, run, ms]);
  return <>{v.toFixed(d)}</>;
}

/** "12 doors" / "15.90 m²": the leading number counts up, the rest stays. */
export function CountUpText({ text, ms = 600 }: { text: string; ms?: number }) {
  const m = text.match(/^(-?\d+(?:\.\d+)?)(.*)$/s);
  if (!m) return <>{text}</>;
  const decimals = m[1].split(".")[1]?.length ?? 0;
  // only numbers that print back exactly ("007", "011 Kitchen" and long digit strings stay as written)
  if (parseFloat(m[1]).toFixed(decimals) !== m[1]) return <>{text}</>;
  return (
    <>
      <CountUp to={parseFloat(m[1])} decimals={decimals} ms={ms} />
      {m[2]}
    </>
  );
}

/** A red underline that slides to the active tab ("button.on") of the element it sits in. */
export function TabInk({ dep }: { dep?: unknown }) {
  // its own ref, not the parent's: a child's layout effect runs before the parent's ref is attached
  const ink = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  const [glide, setGlide] = useState(false);
  useLayoutEffect(() => {
    const nav = ink.current?.parentElement;
    if (!nav) return;
    const place = () => {
      const el = nav.querySelector<HTMLElement>("button.on");
      const next = el ? { x: el.offsetLeft, w: el.offsetWidth } : null;
      setBox((b) => (b && next && b.x === next.x && b.w === next.w ? b : next));
    };
    place();
    // the tab list changes without a prop change (project opened, fonts loaded): re-measure on any change
    const mo = new MutationObserver(place);
    mo.observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    ro?.observe(nav);
    window.addEventListener("resize", place);
    return () => (mo.disconnect(), ro?.disconnect(), window.removeEventListener("resize", place));
  }, [dep]);
  useEffect(() => {
    if (box && !glide) requestAnimationFrame(() => setGlide(true)); // no slide on first placement
  }, [box, glide]);
  return (
    <span
      ref={ink}
      className={`tab-ink ${glide ? "glide" : ""}`}
      style={box ? { width: box.w, translate: `${box.x}px 0` } : { display: "none" }}
    />
  );
}

/** Wireframe building turning: models (IFC) and anything 3D. */
export function BuildingLoader({ text }: { text: string }) {
  return (
    <div className="loader bld-loader" role="status">
      <div className="bld">
        <div className="bld-spin">
          {[0, 1, 2].map((k) => (
            <div key={k} className="bld-floor"><i /><i /><i /><i /></div>
          ))}
        </div>
      </div>
      <span>{text}</span>
    </div>
  );
}

/** A red pen sketching a floor plan on a gridded sheet: drawings and schedules. */
export function SheetLoader({ text }: { text: string }) {
  return (
    <div className="loader sheet-loader" role="status">
      <svg viewBox="0 0 120 84" width="120" height="84" aria-hidden>
        <rect className="sl-paper" x="1" y="1" width="118" height="82" rx="2" />
        <path className="sl-grid" d="M1 21H119M1 42H119M1 63H119M30 1V83M60 1V83M90 1V83" />
        <path className="sl-pen" pathLength={1} d="M14 14H106V70H14Z M14 40H52 M52 14V54 M52 54H70 M78 40H106 M78 40V70 M30 70V58" />
      </svg>
      <span>{text}</span>
    </div>
  );
}

export function Loader({ kind, text }: { kind: "model" | "sheet"; text: string }) {
  return kind === "model" ? <BuildingLoader text={text} /> : <SheetLoader text={text} />;
}
