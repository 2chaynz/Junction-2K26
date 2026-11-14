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

/** Fades the direct children of `ref` up as each scrolls into view, once. */
export function useReveal<T extends HTMLElement>(ref: RefObject<T>) {
  useEffect(() => {
    const root = ref.current;
    if (!root || reduced() || typeof IntersectionObserver === "undefined") return;
    const kids = [...root.children] as HTMLElement[];
    root.classList.add("reveal");
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
      { rootMargin: "0px 0px -6% 0px" },
    );
    kids.forEach((k, i) => {
      k.style.transitionDelay = `${Math.min(i, 4) * 40}ms`;
      io.observe(k);
    });
    return () => io.disconnect();
  }, [ref]);
}

/** Counts from 0 to `to` once `run` is true; keeps the decimals of `to`. */
export function CountUp({ to, run = true, decimals, ms = 700 }: { to: number; run?: boolean; decimals?: number; ms?: number }) {
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
