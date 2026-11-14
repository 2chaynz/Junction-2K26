import { useEffect, useMemo, useRef, useState } from "react";
import { fileUrl, isImage } from "./api";
import { DEMO, GROUPS, TYPE, shortName } from "./format";
import type { Drawing } from "./types";

type Props = { drawings: Drawing[]; selected: string; onSelect: (path: string) => void };

const MAX_PER_GROUP = 60;

function Row({ d, on, active, pick }: { d: Drawing; on: boolean; active: boolean; pick: () => void }) {
  const thumb = d.view.endsWith(".ifc") ? null : fileUrl(d.view, isImage(d.view) ? 0.08 : 0.12);
  return (
    <li
      className={`row ${on ? "on" : ""} ${active ? "active" : ""}`}
      onMouseDown={(e) => {
        e.preventDefault();
        pick();
      }}
    >
      <span className="thumb">{thumb ? <img src={thumb} loading="lazy" alt="" /> : <span className="mono">3D</span>}</span>
      <span className="name ellipsis">{shortName(d.path)}</span>
      <span className="mono dim">{TYPE[d.source] ?? ""}</span>
      <span className="mono dim qn">{d.questions.length} Q</span>
    </li>
  );
}

export default function Picker({ drawings, selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && t.tagName !== "INPUT" && t.tagName !== "TEXTAREA") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sections = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (d: Drawing) => words.every((w) => d.path.toLowerCase().includes(w));
    const demo = DEMO.map((p) => drawings.find((d) => d.path === p)).filter((d): d is Drawing => !!d && hit(d));
    const out = words.length ? [] : [{ label: "Demo", items: demo, total: demo.length }];
    for (const g of GROUPS) {
      const all = drawings.filter((d) => g.source.includes(d.source) && hit(d));
      if (all.length) out.push({ label: g.label, items: all.slice(0, MAX_PER_GROUP), total: all.length });
    }
    return out.filter((s) => s.items.length);
  }, [drawings, q]);

  const flat = sections.flatMap((s) => s.items);

  function pick(d: Drawing) {
    onSelect(d.path);
    setOpen(false);
    setQ("");
    input.current?.blur();
  }

  let k = -1;
  return (
    <div className="picker">
      <input
        ref={input}
        value={open ? q : shortName(selected)}
        placeholder="Search drawings"
        onFocus={() => (setOpen(true), setCursor(0))}
        onBlur={() => setOpen(false)}
        onChange={(e) => (setQ(e.target.value), setCursor(0))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setCursor((c) => Math.min(c + 1, flat.length - 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setCursor((c) => Math.max(c - 1, 0)));
          else if (e.key === "Enter" && flat[cursor]) pick(flat[cursor]);
          else if (e.key === "Escape") input.current?.blur();
        }}
      />
      <kbd className="slash">/</kbd>
      {open && (
        <div className="menu">
          {sections.length === 0 && <div className="none dim">No drawing matches "{q}"</div>}
          {sections.map((s) => (
            <section key={s.label}>
              <h4>
                {s.label} <span className="dim">{s.total}</span>
              </h4>
              <ul>
                {s.items.map((d) => {
                  k++;
                  return <Row key={s.label + d.path} d={d} on={d.path === selected} active={k === cursor} pick={() => pick(d)} />;
                })}
                {s.total > s.items.length && <li className="more dim">{s.total - s.items.length} more, type to filter</li>}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
