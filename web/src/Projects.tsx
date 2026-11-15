import { useEffect, useMemo, useRef, useState } from "react";
import { fileUrl, isImage } from "./api";
import NewProject, { type Picked, fromDrop } from "./NewProject";
import type { Drawing } from "./types";
import { KIND_LABEL, type Kind, type Overview, type Proj, type Recent, ago, sheetName, thumbOf } from "./workspace";

type Props = {
  projects: Proj[];
  overview: Overview;
  recent: Recent;
  current: string | null;
  onOpen: (key: string, path?: string) => void;
  onCreated: (key: string) => Promise<void> | void;
};

const FILTERS: { label: string; kind: Kind | null }[] = [
  { label: "All", kind: null },
  { label: "BIM models", kind: "BIM" },
  { label: "Sheet sets", kind: "Sheet set" },
  { label: "Portfolios", kind: "Portfolio" },
  { label: "Archives", kind: "Archive" },
];

const ModelGlyph = () => (
  <svg viewBox="0 0 64 48" className="pglyph" aria-hidden>
    <path d="M32 6 54 16v18L32 44 10 34V16z M10 16l22 10 22-10 M32 26v18" />
  </svg>
);

// BIM projects: a clay turntable of the model, pre-rendered by scripts/render_turntables.py.
// Full-dataset BIM projects list their plan PDFs, which name the model in `model`, not the .ifc itself.
// Prefer the architectural or as-built ("project") model: the other disciplines render as bare pipes and ducts.
const spinOf = (p: Proj) => {
  if (p.kind !== "BIM" || p.created) return null;
  const ifc = (d: Drawing & { model?: string | null }) => (d.path.toLowerCase().endsWith(".ifc") ? d.path : d.model ?? null);
  const models = [...new Set(p.items.map(ifc).filter((m): m is string => !!m))];
  const m = models.find((x) => /architect|[-_]ar[-_c]|project/i.test(x.split("/").pop() ?? "")) ?? models[0];
  return m ? `/turntables/${(m.split("/").pop() ?? "").replace(/\.ifc$/i, "")}` : null;
};

function Still({ p, scale }: { p: Proj; scale: number }) {
  const v = thumbOf(p.cover);
  return v ? <img src={fileUrl(v, isImage(v) ? scale * 0.6 : scale)} loading="lazy" alt="" /> : <ModelGlyph />;
}

// The turntable only spins while its card is hovered: eight videos decoding at once halved the frame
// rate (30 vs 52 fps) and made the intro and every animation stutter. The video loads on first hover.
function Spin({ p }: { p: Proj }) {
  const base = spinOf(p);
  const [ok, setOk] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    const card = v?.closest(".pcard");
    if (!v || !card) return;
    const play = () => { v.play().catch(() => {}); };
    const stop = () => v.pause();
    card.addEventListener("mouseenter", play);
    card.addEventListener("mouseleave", stop);
    card.addEventListener("focus", play);
    card.addEventListener("blur", stop);
    return () => {
      card.removeEventListener("mouseenter", play);
      card.removeEventListener("mouseleave", stop);
      card.removeEventListener("focus", play);
      card.removeEventListener("blur", stop);
    };
  }, [base, ok]);
  if (!base || !ok) return <Still p={p} scale={0.2} />;
  return (
    <video ref={video} className="pspin" src={`${base}.webm`} poster={`${base}.jpg`} muted loop playsInline
      preload="none" onError={() => setOk(false)} aria-label={`${p.name}, 3D model`} />
  );
}

function Mini({ p }: { p: Proj }) {
  const base = spinOf(p);
  const [ok, setOk] = useState(true);
  if (!base || !ok) return <Still p={p} scale={0.08} />;
  return <img className="pspin" src={`${base}.jpg`} alt="" loading="lazy" onError={() => setOk(false)} />;
}

function Thumb({ p }: { p: Proj }) {
  return (
    <span className="pthumb">
      <Spin p={p} />
      <span className="pkind mono">{p.kind === "BIM" ? "BIM" : p.kind === "Sheet set" ? "SET" : p.kind === "Portfolio" ? "PORT" : "ARCH"}</span>
    </span>
  );
}

function counts(p: Proj) {
  const out: string[] = [];
  if (p.plans) out.push(`${p.plans.toLocaleString("en")} sheet${p.plans === 1 ? "" : "s"}`);
  if (p.models) out.push(`${p.models} model${p.models === 1 ? "" : "s"}`);
  if (p.questions || !p.created) out.push(`${p.questions.toLocaleString("en")} Q`);
  return out.join(" · ");
}

function Card({ p, o, hits, current, onOpen }: {
  p: Proj; o?: Overview[string]; hits: number | null; current: boolean; onOpen: Props["onOpen"];
}) {
  return (
    <button className={`pcard ${current ? "on" : ""}`} onClick={() => onOpen(p.key)}>
      <Thumb p={p} />
      <span className="pbody">
        <span className="pname ellipsis" title={p.name}>{p.name}</span>
        <span className="porg dim ellipsis">{KIND_LABEL[p.kind]} · {p.org}</span>
        <span className="pcount mono dim">{counts(p)}</span>
        <span className="pfoot">
          <span className="pcodes">
            {[...new Set(p.folders.map((f) => f.code))].slice(0, 7).map((c) => (
              <span key={c} className="pcode mono" title={p.folders.filter((f) => f.code === c).map((f) => f.label).join(", ")}>{c}</span>
            ))}
          </span>
          <span className="psess small">
            {hits !== null ? (
              <span className="red">{hits} match{hits === 1 ? "" : "es"}</span>
            ) : o?.sessions ? (
              <>{o.sessions} session{o.sessions === 1 ? "" : "s"} · {ago(o.updated)}</>
            ) : (
              <span className="dim">no sessions yet</span>
            )}
          </span>
        </span>
      </span>
    </button>
  );
}

// Files dragged from the desktop (not text or a card dragged inside the page).
const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");

export default function Projects({ projects, overview, recent, current, onOpen, onCreated }: Props) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind | null>(null);
  const [dlg, setDlg] = useState<{ files: Picked[]; folder?: string } | null | false>(false);
  const [drag, setDrag] = useState(false);

  // Drop anywhere on Home starts a project (Drive / Dropbox pattern). The open dialog has its own drop zone.
  useEffect(() => {
    if (dlg !== false) return;
    let depth = 0;
    const enter = (e: DragEvent) => { if (hasFiles(e)) (depth++, setDrag(true)); };
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) (depth = 0, setDrag(false)); };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e) || !e.dataTransfer) return;
      e.preventDefault();
      depth = 0;
      setDrag(false);
      setDlg(await fromDrop(e.dataTransfer));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [dlg]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = useMemo(() => {
    const out: { p: Proj; hits: number | null; first?: string }[] = [];
    for (const p of projects) {
      if (kind && p.kind !== kind) continue;
      if (!words.length) { out.push({ p, hits: null }); continue; }
      const meta = `${p.name} ${p.org} ${KIND_LABEL[p.kind]}`.toLowerCase();
      if (words.every((w) => meta.includes(w))) { out.push({ p, hits: null }); continue; }
      // Searching a sheet number or file name finds the project that holds it.
      const sheets = p.items.filter((d) => words.every((w) => d.path.toLowerCase().includes(w)));
      if (sheets.length) out.push({ p, hits: sheets.length, first: sheets[0].path });
    }
    return out;
  }, [projects, kind, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastTouch = (k: string) => Math.max(recent[k]?.t ?? 0, (overview[k]?.updated ?? 0) * 1000);
  const recents = projects
    .filter((p) => lastTouch(p.key) > 0)
    .sort((a, b) => lastTouch(b.key) - lastTouch(a.key))
    .slice(0, 4);
  const n = (k: Kind | null) => (k ? projects.filter((p) => p.kind === k).length : projects.length);

  return (
    <div className="page projects">
      <div className="page-head phero">
        <div>
          <h1>Projects</h1>
          <p className="lede">Each project holds its sheets, models and the questions your team asked about them. Open one, or drop your own drawings anywhere here to start a new one.</p>
        </div>
        <div className="pactions">
          <div className="search psearch">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQ("")}
              placeholder="Find a project or sheet"
              autoFocus
            />
          </div>
          <button className="btn primary pnew" onClick={() => setDlg(null)}>
            <span aria-hidden>+</span> New project
          </button>
        </div>
      </div>

      {drag && (
        <div className="pdropall" aria-hidden>
          <div>
            <strong>Drop to create a project</strong>
            <span className="mono small">PDF · PNG · JPG · IFC · DXF · folders · ZIP</span>
          </div>
        </div>
      )}
      {dlg !== false && (
        <NewProject
          initial={dlg}
          onClose={() => setDlg(false)}
          onCreated={async (k) => {
            await onCreated(k);
            setDlg(false);
          }}
        />
      )}

      {!words.length && !kind && recents.length > 0 && (
        <>
          <h2>Continue where you left off</h2>
          <div className="precent">
            {recents.map((p) => {
              const r = recent[p.key];
              const o = overview[p.key];
              return (
                <button key={p.key} className={`prow ${p.key === current ? "on" : ""}`} onClick={() => onOpen(p.key, r?.path)}>
                  <span className="pmini">
                    <Mini p={p} />
                  </span>
                  <span className="pbody">
                    <span className="pname ellipsis">{p.name}</span>
                    <span className="dim small ellipsis">{r ? sheetName(p.items.find((d) => d.path === r.path) ?? p.items[0]) : KIND_LABEL[p.kind]}</span>
                    <span className="dim small">
                      {o?.sessions ? `${o.sessions} session${o.sessions === 1 ? "" : "s"} · ` : ""}
                      {ago(lastTouch(p.key))}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="pfilters">
        {FILTERS.filter((f) => n(f.kind)).map((f) => (
          <button key={f.label} className={`pfilter ${kind === f.kind ? "on" : ""}`} onClick={() => setKind(f.kind)}>
            {f.label} <span className="mono dim">{n(f.kind)}</span>
          </button>
        ))}
      </div>

      {shown.length ? (
        <div className="pgrid">
          {shown.map(({ p, hits, first }) => (
            <Card
              key={p.key}
              p={p}
              o={overview[p.key]}
              hits={hits}
              current={p.key === current}
              onOpen={(k) => onOpen(k, first)}
            />
          ))}
        </div>
      ) : (
        <p className="dim">No project or sheet matches “{q}”.</p>
      )}
    </div>
  );
}
