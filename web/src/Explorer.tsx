import { forwardRef, useEffect, useMemo, useState } from "react";
import { fileUrl, isImage } from "./api";
import { TYPE, fmtValue } from "./format";
import { KIND_LABEL, type Proj, type SessionSummary, ago, bucket, projectKeyOf, sheetName } from "./workspace";
import type { Drawing } from "./types";
import "./projects.css";

type Props = {
  drawings: Drawing[];
  projects: Proj[];
  project: Proj | null;
  selected: string;
  onSelect: (path: string) => void;
  onProjects: () => void;
  sessions: SessionSummary[];
  session: string; // id of the session open in the chat
  onSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
};

const PAGE = 48;

export const FolderIcon = ({ open }: { open: boolean }) => (
  <svg className="ficon" viewBox="0 0 16 16" aria-hidden>
    {open ? (
      <path d="M1.5 3.5h4l1.5 1.5h7.5v1.5H4L1.5 13z M4 6.5h11.5L13 13H1.5z" />
    ) : (
      <path d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z" />
    )}
  </svg>
);

function Tile({ d, on, pick, sub }: { d: Drawing; on: boolean; pick: () => void; sub?: string }) {
  const thumb = d.view.endsWith(".ifc") ? null : fileUrl(d.view, isImage(d.view) ? 0.1 : 0.15);
  return (
    <button className={`tile ${on ? "on" : ""}`} onClick={pick} title={d.path}>
      <span className="tthumb">
        {thumb ? <img src={thumb} loading="lazy" alt="" /> : <span className="mono dim">IFC</span>}
      </span>
      <span className="tname ellipsis">{sheetName(d)}</span>
      <span className="tmeta mono dim ellipsis">
        {sub ?? `${TYPE[d.source]} · ${d.questions.length} Q`}
      </span>
    </button>
  );
}

function Grid({ items, selected, onSelect, sub }: {
  items: Drawing[]; selected: string; onSelect: (p: string) => void; sub?: (d: Drawing) => string;
}) {
  const [n, setN] = useState(PAGE);
  // Keep the open sheet visible even when it sits past the first page.
  const at = items.findIndex((d) => d.path === selected);
  const shown = Math.max(n, at + 1);
  return (
    <div className="grid">
      {items.slice(0, shown).map((d) => (
        <Tile key={d.path} d={d} on={d.path === selected} pick={() => onSelect(d.path)} sub={sub?.(d)} />
      ))}
      {items.length > shown && (
        <button className="tile more" onClick={() => setN(shown + PAGE)}>
          Show {Math.min(PAGE, items.length - shown)} more
          <span className="dim">{items.length - shown} left</span>
        </button>
      )}
    </div>
  );
}

function Sheets({ project, selected, onSelect }: { project: Proj; selected: string; onSelect: (p: string) => void }) {
  const here = project.folders.find((f) => f.items.some((d) => d.path === selected))?.key;
  const [open, setOpen] = useState<Set<string>>(() => new Set(project.folders.length <= 2 ? project.folders.map((f) => f.key) : []));
  useEffect(() => {
    if (here) setOpen((o) => (o.has(here) ? o : new Set(o).add(here)));
  }, [here]);
  const toggle = (k: string) =>
    setOpen((o) => {
      const n = new Set(o);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  return (
    <>
      {project.folders.map((f) => {
        const isOpen = open.has(f.key);
        return (
          <section key={f.key}>
            <button className={`fhead sub ${isOpen ? "open" : ""}`} onClick={() => toggle(f.key)}>
              <span className="chev">{isOpen ? "▾" : "▸"}</span>
              <FolderIcon open={isOpen} />
              <span className="fname ellipsis">{f.label}</span>
              <span className="fcode mono">{f.code}</span>
              <span className="dim mono">{f.items.length}</span>
            </button>
            {isOpen && <Grid items={f.items} selected={selected} onSelect={onSelect} />}
          </section>
        );
      })}
    </>
  );
}

function Sessions({ sessions, session, onSession, onNew, onDelete, empty }: {
  sessions: SessionSummary[]; session: string; empty: boolean;
  onSession: (id: string) => void; onNew: () => void; onDelete: (id: string) => void;
}) {
  const [sure, setSure] = useState<string | null>(null);
  const groups = useMemo(() => {
    const g = new Map<string, SessionSummary[]>();
    for (const s of sessions) {
      const b = bucket(s.updated);
      g.set(b, [...(g.get(b) ?? []), s]);
    }
    return [...g.entries()];
  }, [sessions]);
  return (
    <div className="sessions">
      <button className={`snew ${empty ? "on" : ""}`} onClick={onNew} disabled={empty} title="Start a fresh conversation in this project">
        <span className="plus">+</span> New session
      </button>
      {!sessions.length && (
        <p className="dim pad small">
          Questions you ask in this project are saved here, so you and your team can pick a conversation up later.
        </p>
      )}
      {groups.map(([label, list]) => (
        <section key={label}>
          <div className="sgroup">{label}</div>
          {list.map((s) => {
            const on = s.id === session;
            const v = s.last && s.last.value !== null && s.last.value !== undefined ? fmtValue(s.last.value, s.last.unit) : null;
            return (
              <div key={s.id} className={`srow ${on ? "on" : ""}`}>
                <button className="sbody" onClick={() => onSession(s.id)} title={s.title}>
                  <span className="stitle ellipsis">{s.title}</span>
                  <span className="smeta dim ellipsis">
                    {v && <span className="sval mono">{v.length > 24 ? v.slice(0, 24) + "…" : v}</span>}
                    {s.questions} Q · {s.paths.length} sheet{s.paths.length === 1 ? "" : "s"} · {ago(s.updated)}
                  </span>
                </button>
                {sure === s.id ? (
                  <span className="sdel sure">
                    <button onClick={() => (onDelete(s.id), setSure(null))}>Delete</button>
                    <button className="dim" onClick={() => setSure(null)}>Keep</button>
                  </span>
                ) : (
                  <button className="sdel" onClick={() => setSure(s.id)} title="Delete session" aria-label="Delete session">×</button>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

const Explorer = forwardRef<HTMLInputElement, Props>(function Explorer(p, ref) {
  const { project, selected, onSelect } = p;
  const [q, setQ] = useState("");
  const [pane, setPane] = useState<"sheets" | "sessions">("sheets");
  useEffect(() => setQ(""), [project?.key]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (d: Drawing) => words.every((w) => d.path.toLowerCase().includes(w));
  const hits = words.length && project ? project.items.filter(match) : null;
  // Nothing here: point at other projects that have it, the way a document system searches the hub.
  const elsewhere = hits && !hits.length ? p.drawings.filter(match).slice(0, 40) : [];
  const names = useMemo(() => new Map(p.projects.map((x) => [x.key, x.name])), [p.projects]);
  const folder = project?.folders.find((f) => f.items.some((d) => d.path === selected));

  return (
    <nav className="explorer">
      <div className="crumbs">
        <button className="crumb" onClick={p.onProjects}>Projects</button>
        {project && <span className="sep">›</span>}
        {project && <span className="ellipsis">{project.name}</span>}
        {folder && <span className="sep">›</span>}
        {folder && <span className="ellipsis">{folder.label}</span>}
      </div>
      {project && (
        <div className="phead">
          <div className="ptitle ellipsis" title={project.name}>{project.name}</div>
          <div className="psub dim ellipsis">
            {KIND_LABEL[project.kind]} · {project.org}
          </div>
        </div>
      )}
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={pane === "sheets"} className={pane === "sheets" ? "on" : ""} onClick={() => setPane("sheets")}>
          Sheets <span className="mono dim">{project?.items.length ?? 0}</span>
        </button>
        <button role="tab" aria-selected={pane === "sessions"} className={pane === "sessions" ? "on" : ""} onClick={() => setPane("sessions")}>
          Sessions <span className="mono dim">{p.sessions.length}</span>
        </button>
      </div>
      {pane === "sheets" && (
        <div className="search">
          <input
            ref={ref}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            placeholder={project ? `Search ${project.name}` : "Search drawings"}
          />
          <kbd>/</kbd>
        </div>
      )}
      <div className="tree">
        {pane === "sessions" ? (
          <Sessions
            sessions={p.sessions}
            session={p.session}
            empty={!p.sessions.some((s) => s.id === p.session)}
            onSession={p.onSession}
            onNew={p.onNewSession}
            onDelete={p.onDeleteSession}
          />
        ) : !project ? (
          <p className="dim pad">Pick a project to see its sheets.</p>
        ) : hits ? (
          <>
            <div className="fhead static">
              {hits.length} result{hits.length === 1 ? "" : "s"} in {project.name}
            </div>
            {hits.length > 0 && <Grid items={hits} selected={selected} onSelect={onSelect} />}
            {elsewhere.length > 0 && (
              <>
                <div className="fhead static">In other projects</div>
                <Grid items={elsewhere} selected={selected} onSelect={onSelect} sub={(d) => names.get(projectKeyOf(d)) ?? ""} />
              </>
            )}
            {!hits.length && !elsewhere.length && <p className="dim pad">Nothing matches.</p>}
          </>
        ) : (
          <Sheets key={project.key} project={project} selected={selected} onSelect={onSelect} />
        )}
      </div>
    </nav>
  );
});

export default Explorer;
