import { forwardRef, useEffect, useMemo, useState } from "react";
import { fileUrl, isImage } from "./api";
import { DEMO, GROUPS, TYPE, shortName } from "./format";
import type { Drawing } from "./types";

type Props = { drawings: Drawing[]; selected: string; onSelect: (path: string) => void };

const PAGE = 48;

const FolderIcon = ({ open }: { open: boolean }) => (
  <svg className="ficon" viewBox="0 0 16 16" aria-hidden>
    {open ? (
      <path d="M1.5 3.5h4l1.5 1.5h7.5v1.5H4L1.5 13z M4 6.5h11.5L13 13H1.5z" />
    ) : (
      <path d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z" />
    )}
  </svg>
);

function Tile({ d, on, pick }: { d: Drawing; on: boolean; pick: () => void }) {
  const thumb = d.view.endsWith(".ifc") ? null : fileUrl(d.view, isImage(d.view) ? 0.1 : 0.15);
  return (
    <button className={`tile ${on ? "on" : ""}`} onClick={pick} title={d.path}>
      <span className="tthumb">
        {thumb ? <img src={thumb} loading="lazy" alt="" /> : <span className="mono dim">IFC</span>}
      </span>
      <span className="tname ellipsis">{shortName(d.path)}</span>
      <span className="tmeta mono dim">
        {TYPE[d.source]} · {d.questions.length} Q
      </span>
    </button>
  );
}

function Grid({ items, selected, onSelect }: { items: Drawing[]; selected: string; onSelect: (p: string) => void }) {
  const [n, setN] = useState(PAGE);
  return (
    <div className="grid">
      {items.slice(0, n).map((d) => (
        <Tile key={d.path} d={d} on={d.path === selected} pick={() => onSelect(d.path)} />
      ))}
      {items.length > n && (
        <button className="tile more" onClick={() => setN(n + PAGE)}>
          Show {Math.min(PAGE, items.length - n)} more
          <span className="dim">{items.length - n} left</span>
        </button>
      )}
    </div>
  );
}

const Explorer = forwardRef<HTMLInputElement, Props>(function Explorer({ drawings, selected, onSelect }, ref) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set(["Demo"]));

  const folders = useMemo(() => {
    const demo = DEMO.map((p) => drawings.find((d) => d.path === p)).filter((d): d is Drawing => !!d);
    return [
      { label: "Demo", items: demo },
      ...GROUPS.map((g) => ({ label: g.label, items: drawings.filter((d) => g.source.includes(d.source)) })),
    ].filter((f) => f.items.length);
  }, [drawings]);

  // The folder holding the open drawing, for the path bar. Demo wins when it's there.
  const here = folders.find((f) => f.items.some((d) => d.path === selected))?.label;
  useEffect(() => {
    if (here) setOpen((o) => (o.has(here) ? o : new Set(o).add(here)));
  }, [here]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length
    ? drawings.filter((d) => words.every((w) => d.path.toLowerCase().includes(w)))
    : null;

  const toggle = (l: string) =>
    setOpen((o) => {
      const n = new Set(o);
      n.has(l) ? n.delete(l) : n.add(l);
      return n;
    });

  return (
    <nav className="explorer">
      <div className="crumbs">
        <span>Drawings</span>
        {here && <span className="sep">›</span>}
        {here && <span>{here}</span>}
        {selected && <span className="sep">›</span>}
        {selected && <span className="ellipsis cur">{shortName(selected)}</span>}
      </div>
      <div className="search">
        <input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder="Search drawings"
        />
        <kbd>/</kbd>
      </div>
      <div className="tree">
        {hits ? (
          <>
            <div className="fhead static">
              {hits.length} result{hits.length === 1 ? "" : "s"}
            </div>
            {hits.length ? <Grid items={hits} selected={selected} onSelect={onSelect} /> : <p className="dim pad">Nothing matches.</p>}
          </>
        ) : (
          folders.map((f) => {
            const isOpen = open.has(f.label);
            return (
              <section key={f.label}>
                <button className={`fhead ${isOpen ? "open" : ""}`} onClick={() => toggle(f.label)}>
                  <span className="chev">{isOpen ? "▾" : "▸"}</span>
                  <FolderIcon open={isOpen} />
                  <span className="fname">{f.label}</span>
                  <span className="dim mono">{f.items.length}</span>
                </button>
                {isOpen && <Grid items={f.items} selected={selected} onSelect={onSelect} />}
              </section>
            );
          })
        )}
      </div>
    </nav>
  );
});

export default Explorer;
