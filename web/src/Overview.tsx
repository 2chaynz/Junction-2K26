import { useMemo } from "react";
import { fileUrl, isImage } from "./api";
import { fmtValue, isEnglishQuestion } from "./format";
import { KIND_LABEL, type Proj, type SessionSummary, ago, sheetName, thumbOf } from "./workspace";
import type { Drawing } from "./types";

type Props = {
  project: Proj;
  sessions: SessionSummary[];
  lastPath: string | null; // sheet open last time in this project
  onOpen: (path: string) => void;
  onAsk: (path: string, question: string) => void;
  onSession: (id: string) => void;
  onTakeoff: () => void;
};

const thumb = (d: Drawing, s = 0.1) => {
  const v = thumbOf(d);
  return v ? <img src={fileUrl(v, isImage(v) ? s : s * 1.5)} loading="lazy" alt="" /> : <span className="mono dim">IFC</span>;
};

const label = (t: string) => t.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default function Overview({ project: p, sessions, lastPath, onOpen, onAsk, onSession, onTakeoff }: Props) {
  const last = p.items.find((d) => d.path === lastPath) ?? null;
  const start = last ?? p.cover ?? p.items[0];

  const mix = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of p.items) for (const q of d.questions) m.set(q.type, (m.get(q.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [p]);
  const formats = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of p.items) {
      const ext = d.path.split(".").pop()!.toUpperCase();
      m.set(ext, (m.get(ext) ?? 0) + 1);
    }
    return [...m.entries()];
  }, [p]);
  // One starter question per question type, so the list shows what the project can answer.
  const starters = useMemo(() => {
    const out: { d: Drawing; q: string; type: string }[] = [];
    const seen = new Set<string>();
    const pool = p.cover ? [p.cover, ...p.items.filter((d) => d !== p.cover)] : p.items;
    for (const d of pool.slice(0, 400)) {
      for (const q of d.questions) {
        if (out.length >= 5) break;
        if (seen.has(q.type) || !isEnglishQuestion(q.question)) continue;
        seen.add(q.type);
        out.push({ d, q: q.question, type: q.type });
      }
    }
    return out;
  }, [p]);
  const top = mix[0]?.[1] ?? 1;

  return (
    <div className="page overview">
      <div className="ov-hero">
        <button className="ov-cover" onClick={() => start && onOpen(start.path)} title="Open in Drawings">
          {start ? thumb(start, 0.25) : null}
        </button>
        <div className="ov-head">
          <span className="ov-kind mono">{KIND_LABEL[p.kind]}</span>
          <h1>{p.name}</h1>
          <p className="lede">{p.org}</p>
          <div className="ov-stats">
            {p.plans > 0 && <Stat n={p.plans} k={p.plans === 1 ? "sheet" : "sheets"} />}
            {p.models > 0 && <Stat n={p.models} k={p.models === 1 ? "model" : "models"} />}
            <Stat n={p.folders.length} k={p.folders.length === 1 ? "folder" : "folders"} />
            <Stat n={p.questions} k="Stoa questions" />
            <Stat n={sessions.length} k={sessions.length === 1 ? "session" : "sessions"} />
          </div>
          <div className="ov-actions">
            {start && (
              <button className="btn primary" onClick={() => onOpen(start.path)}>
                {last ? "Continue on " : "Open "}<span className="ellipsis">{sheetName(start)}</span>
              </button>
            )}
            <button className="btn" onClick={onTakeoff}>Takeoff list</button>
          </div>
        </div>
      </div>

      <div className="ov-cols">
        <section>
          <h2>Folders</h2>
          <div className="ov-folders">
            {p.folders.map((f) => (
              <button key={f.key} className="ov-folder" onClick={() => onOpen(f.items[0].path)} title={`Open ${f.label}`}>
                <span className="fcode mono">{f.code}</span>
                <span className="ov-fname ellipsis">{f.label}</span>
                <span className="ov-strip">
                  {f.items.slice(0, 4).map((d) => <span key={d.path} className="ov-mini">{thumb(d, 0.06)}</span>)}
                </span>
                <span className="mono dim">{f.items.length.toLocaleString()}</span>
              </button>
            ))}
          </div>

          {starters.length > 0 && (
            <>
              <h2>Try asking</h2>
              <ul className="ov-asks">
                {starters.map((s) => (
                  <li key={s.q}>
                    <button onClick={() => onAsk(s.d.path, s.q)}>
                      <span className="ov-q">{s.q}</span>
                      <span className="dim small ellipsis">{label(s.type)} · {sheetName(s.d)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <aside>
          <h2>Recent sessions</h2>
          {sessions.length ? (
            <ul className="ov-sess">
              {sessions.slice(0, 6).map((s) => {
                const v = s.last && s.last.value !== null && s.last.value !== undefined ? fmtValue(s.last.value, s.last.unit) : null;
                return (
                  <li key={s.id}>
                    <button onClick={() => onSession(s.id)} title={s.title}>
                      <span className="ellipsis">{s.title}</span>
                      <span className="dim small">
                        {v && <span className="sval mono">{v.length > 18 ? v.slice(0, 18) + "…" : v} · </span>}
                        {s.questions} Q · {ago(s.updated)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dim small">No questions asked here yet. Open a sheet and ask; the conversation is saved to this project.</p>
          )}

          {mix.length > 0 && (
            <>
              <h2>Question types</h2>
              <ul className="ov-mix">
                {mix.slice(0, 8).map(([t, n]) => (
                  <li key={t}>
                    <span className="small">{label(t)}</span>
                    <span className="ov-bar"><span style={{ width: `${(n / top) * 100}%` }} /></span>
                    <span className="mono dim">{n.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2>Files</h2>
          <p className="small dim">
            {formats.map(([f, n]) => `${n.toLocaleString()} ${f}`).join(" · ")}
          </p>
        </aside>
      </div>
    </div>
  );
}

const Stat = ({ n, k }: { n: number; k: string }) => (
  <span className="ov-stat">
    <span className="mono">{n.toLocaleString()}</span>
    <span className="dim">{k}</span>
  </span>
);
