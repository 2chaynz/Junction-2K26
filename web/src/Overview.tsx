import { useEffect, useMemo, useState } from "react";
import { Loader } from "./motion";
import { fileUrl, isImage } from "./api";
import { PAIRS } from "./Changes";
import { fmtValue, sheetCode } from "./format";
import type { Row } from "./Takeoff";
import { KIND_LABEL, type Proj, type SessionSummary, ago, sheetName, thumbOf } from "./workspace";
import type { Drawing } from "./types";

// What a project team opens a project for: where they left off, the sheet register,
// what the team already asked, quantities and what changed between issues. Nothing benchmark-only.

type Props = {
  project: Proj;
  allPaths: string[];
  sessions: SessionSummary[];
  lastPath: string | null;
  onOpen: (path: string) => void;
  onModel: (path: string) => void; // open a sheet in 3D
  onChanges: (path: string) => void; // open a sheet with "What changed" on
  onSession: (id: string) => void;
  onTakeoff: (path: string) => void;
  onDelete?: () => Promise<void>; // imported projects only: dataset projects can't be deleted
};

type Linked = Drawing & { model?: string | null };
type Qty = { category: string; count: number; measure: string };

const PER_FOLDER = 8;
const isIfc = (p: string) => p.toLowerCase().endsWith(".ifc");

function Thumb({ d }: { d: Drawing }) {
  const v = thumbOf(d);
  return <span className="ov-mini">{v ? <img src={fileUrl(v, isImage(v) ? 0.06 : 0.09)} loading="lazy" alt="" /> : <span className="mono dim">IFC</span>}</span>;
}

const n = (v: number, unit: string) => `${v.toLocaleString("en", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${unit}`;

/** Category totals from takeoff rows: count, plus the one measure that category has. */
function totals(rows: Row[]): Qty[] {
  const m = new Map<string, { count: number; len: number; area: number; vol: number }>();
  for (const r of rows) {
    const t = m.get(r.category) ?? { count: 0, len: 0, area: 0, vol: 0 };
    t.count += r.count;
    t.len += r.length_m;
    t.area += r.area_m2;
    t.vol += r.volume_m3;
    m.set(r.category, t);
  }
  return [...m.entries()].map(([category, t]) => ({
    category,
    count: t.count,
    measure: t.area ? n(t.area, "m²") : t.len ? n(t.len, "m") : t.vol ? n(t.vol, "m³") : "",
  }));
}

export default function Overview(props: Props) {
  const { project: p, allPaths, sessions, lastPath, onOpen, onModel, onChanges, onSession, onTakeoff, onDelete } = props;
  const [confirm, setConfirm] = useState(false);
  const items = p.items as Linked[];
  const last = items.find((d) => d.path === lastPath) ?? null;
  const start = last ?? p.cover ?? items[0];
  const model = items.find((d) => d.model)?.model ?? items.find((d) => isIfc(d.path))?.path ?? null;
  const modelSheet = items.find((d) => d.model === model) ?? items.find((d) => d.path === model) ?? null;

  // Quantities only make sense where one source covers the project: its BIM model or its schedule sheet.
  const qtyPath = p.kind === "BIM" ? model
    : p.kind === "Sheet set" ? p.folders.find((f) => f.code === "SCH")?.items[0]?.path ?? null
    : null;
  const [qty, setQty] = useState<{ rows: Qty[]; source: string } | "loading" | null>(null);
  useEffect(() => {
    if (!qtyPath) return setQty(null);
    let stale = false;
    setQty("loading");
    fetch(`/api/takeoff?path=${encodeURIComponent(qtyPath)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !stale && setQty(d?.rows?.length ? { rows: totals(d.rows), source: d.source } : null))
      .catch(() => !stale && setQty(null));
    return () => void (stale = true);
  }, [qtyPath]);

  const revisions = useMemo(() => items.filter((d) => PAIRS.has(d.path)).map((d) => ({ d, note: PAIRS.get(d.path)!.note })), [items]);
  // How often the team already asked about each sheet: a sheet with questions is a sheet someone needed.
  const asked = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sessions) for (const x of s.paths) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  }, [sessions]);

  const facts = [
    p.plans ? `${p.plans.toLocaleString("en")} sheet${p.plans === 1 ? "" : "s"}` : "",
    model ? "BIM model linked" : "",
    `${p.folders.length} folder${p.folders.length === 1 ? "" : "s"}`,
    revisions.length ? `${revisions.length} revised` : "",
  ].filter(Boolean);

  return (
    <div className="page overview">
      <div className="ov-hero">
        <div className="ov-head">
          <span className="ov-kind mono">{KIND_LABEL[p.kind]} · {p.org}</span>
          <h1>{p.name}</h1>
          <p className="dim">{facts.join(" · ")}</p>
        </div>
        <div className="ov-actions">
          {start && (
            <button className="ov-resume" onClick={() => onOpen(start.path)}>
              <Thumb d={start} />
              <span className="ov-rbody">
                <span className="k">{last ? "Continue where you left off" : "Start here"}</span>
                <span className="ellipsis">{sheetName(start)}</span>
              </span>
              <span className="go">›</span>
            </button>
          )}
          {model && modelSheet && <button className="btn" onClick={() => onModel(modelSheet.path)}>Open 3D model</button>}
        </div>
      </div>

      <div className="ov-cols">
        <section>
          <h2>Sheet register</h2>
          <table className="ov-reg">
            <colgroup><col className="t" /><col className="code" /><col /><col className="r" /></colgroup>
            <tbody>
              {p.folders.map((f) => (
                <FolderRows key={f.key} label={f.label} code={f.code} items={f.items} allPaths={allPaths}
                  asked={asked} last={lastPath} onOpen={onOpen} />
              ))}
            </tbody>
          </table>
        </section>

        <aside>
          <h2>Team questions</h2>
          {sessions.length ? (
            <ul className="ov-sess">
              {sessions.slice(0, 5).map((s) => {
                const v = s.last && s.last.value !== null && s.last.value !== undefined ? fmtValue(s.last.value, s.last.unit) : null;
                return (
                  <li key={s.id}>
                    <button onClick={() => onSession(s.id)} title={s.title}>
                      <span className="ellipsis">{s.title}</span>
                      <span className="dim small ellipsis">
                        {v && <span className="sval mono">{v.length > 18 ? v.slice(0, 18) + "…" : v}</span>}
                        {v && " · "}{s.questions} Q · {ago(s.updated)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dim small">Nothing asked yet. Questions asked on any sheet are saved here for the whole team.</p>
          )}

          {revisions.length > 0 && (
            <>
              <h2>What changed</h2>
              <ul className="ov-rev">
                {revisions.map(({ d, note }) => (
                  <li key={d.path}>
                    <button onClick={() => onChanges(d.path)}>
                      <span className="ellipsis">{sheetName(d)}</span>
                      <span className="dim small">{note}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {qty && (
            <>
              <h2>Quantities</h2>
              {qty === "loading" ? (
                <Loader kind={p.kind === "BIM" ? "model" : "sheet"} text={`Counting from the ${p.kind === "BIM" ? "model" : "schedule"}…`} />
              ) : (
                <>
                  <table className="ov-qty">
                    <tbody>
                      {qty.rows.map((r) => (
                        <tr key={r.category}>
                          <td>{r.category}</td>
                          <td className="mono">{r.count.toLocaleString("en")}</td>
                          <td className="mono dim">{r.measure}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button className="ov-more" onClick={() => qtyPath && onTakeoff(qtyPath)}>
                    From the {qty.source === "ifc" ? "BIM model" : "schedule"} · full takeoff ›
                  </button>
                </>
              )}
            </>
          )}
        </aside>
      </div>

      {onDelete && (
        <section className="ov-danger">
          <div>
            <h2>Delete project</h2>
            <p className="dim small">
              Imported {p.created ? ago(p.created) : ""}. Removes its {p.items.length} file{p.items.length === 1 ? "" : "s"}, saved questions and measurements from this server.
            </p>
          </div>
          <button className="btn danger" onClick={() => setConfirm(true)}>Delete project…</button>
        </section>
      )}
      {confirm && onDelete && <ConfirmDelete p={p} sessions={sessions.length} onCancel={() => setConfirm(false)} onDelete={onDelete} />}
    </div>
  );
}

// Destructive and not undoable: a modal that names what goes, with Cancel focused so Enter is safe.
function ConfirmDelete({ p, sessions, onCancel, onDelete }: {
  p: Proj; sessions: number; onCancel: () => void; onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onCancel]);
  const what = [
    `${p.items.length} file${p.items.length === 1 ? "" : "s"}`,
    sessions ? `${sessions} saved session${sessions === 1 ? "" : "s"}` : "",
    "any measurements",
  ].filter(Boolean);
  return (
    <div className="npback" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="npdlg" role="alertdialog" aria-modal="true" aria-labelledby="del-title" aria-describedby="del-body">
        <div className="nphead">
          <h2 id="del-title">Delete “{p.name}”?</h2>
        </div>
        <p id="del-body" className="ov-delbody">
          This removes {what.slice(0, -1).join(", ")} and {what[what.length - 1]}. It can't be undone.
        </p>
        {err && <p className="nperr" role="alert">{err}</p>}
        <div className="npfoot">
          <span className="spacer" />
          <button className="btn" onClick={onCancel} disabled={busy} autoFocus>Cancel</button>
          <button
            className="btn danger solid"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr("");
              try {
                await onDelete();
              } catch (e) {
                setErr(String(e).replace(/^Error: /, ""));
                setBusy(false);
              }
            }}
          >
            {busy ? "Deleting…" : "Delete project"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FolderRows({ label, code, items, allPaths, asked, last, onOpen }: {
  label: string; code: string; items: Drawing[]; allPaths: string[];
  asked: Map<string, number>; last: string | null; onOpen: (p: string) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, PER_FOLDER);
  return (
    <>
      <tr className="ov-fold">
        <td colSpan={4}>
          <span className="fcode mono">{code}</span> {label} <span className="mono dim">{items.length.toLocaleString("en")}</span>
        </td>
      </tr>
      {shown.map((d) => (
        <tr key={d.path} className={`ov-sheet ${d.path === last ? "on" : ""}`} onClick={() => onOpen(d.path)}>
          <td className="t"><Thumb d={d} /></td>
          <td className="mono dim code">{sheetCode(allPaths, d.path, d.source)}</td>
          <td className="name">
            <div>
              <span className="ellipsis">{sheetName(d)}</span>
              {d.path === last && <span className="tag">last open</span>}
            </div>
          </td>
          <td className="r dim small">{asked.get(d.path) ? `asked in ${asked.get(d.path)}` : ""}</td>
        </tr>
      ))}
      {items.length > shown.length && (
        <tr className="ov-showmore">
          <td colSpan={4}>
            {items.length - shown.length > 200 ? (
              <span className="dim small">{(items.length - shown.length).toLocaleString("en")} more · search them from the Drawings sidebar</span>
            ) : (
              <button onClick={() => setAll(true)}>Show {items.length - shown.length} more</button>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
