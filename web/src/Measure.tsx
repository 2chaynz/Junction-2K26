import { useEffect, useMemo, useState } from "react";
import { addTakeoff, calibrate, chooseScale, delTakeoff, getMeasure } from "./api";
import type { Known, MeasureState, Ref, Shape, Takeoff, Tool } from "./types";

const SOURCE: Record<string, string> = {
  dxf: "DXF geometry",
  sibling: "same drawing, other file",
  note: "scale note on the sheet",
  bar: "scale bar on the scan",
  sheet_size: "project sheet size",
  manual: "your calibration",
  stored: "stored",
};
const REF_KIND: Record<string, string> = {
  dxf: "DXF",
  note: "Note",
  bar: "Bar",
  sibling: "Sibling",
  label: "Label",
  schedule: "Schedule",
  project: "Project",
  manual: "Drawn",
};
const TOOLS: { t: Tool; label: string }[] = [
  { t: "length", label: "Length" },
  { t: "area", label: "Area" },
  { t: "count", label: "Count" },
  { t: "calibrate", label: "Calibrate" },
];

const fileName = (f: string) => f.split("/").pop() ?? f;
const sum = (xs: Takeoff[]) => xs.reduce((a, x) => a + x.value, 0);

type Props = {
  path: string; // the file shown (bbox coords)
  tool: Tool | null;
  setTool: (t: Tool | null) => void;
  drawn: number[][] | null; // last shape finished in the Viewer
  clearDrawn: () => void;
  hot: string | null;
  setHot: (id: string | null) => void;
  onShapes: (s: Shape[], mpu: number | null) => void;
  onZoom: (bbox: number[]) => void;
  onOpen: (file: string) => boolean; // open another sheet; false if it isn't in the explorer
};

export default function Measure({ path, tool, setTool, drawn, clearDrawn, hot, setHot, onShapes, onZoom, onOpen }: Props) {
  const [st, setSt] = useState<MeasureState | null>(null);
  const [err, setErr] = useState("");
  const [label, setLabel] = useState("");
  const [known, setKnown] = useState<Known | null>(null);
  const [calLen, setCalLen] = useState("");
  const [pending, setPending] = useState<number[][] | null>(null); // calibration shape waiting for a length
  const [showRefs, setShowRefs] = useState<Ref[] | null>(null);
  const [allAuto, setAllAuto] = useState(false);
  const [pick, setPick] = useState(false);

  const load = () =>
    getMeasure(path)
      .then((s) => (setSt(s), setErr("")))
      .catch((e) => setErr(String(e.message ?? e)));

  useEffect(() => {
    setSt(null);
    setPending(null);
    setKnown(null);
    setShowRefs(null);
    load();
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  // A finished shape: calibration waits for a length, takeoffs go straight to the server.
  useEffect(() => {
    if (!drawn || !tool) return;
    clearDrawn();
    if (tool === "calibrate" || tool === "calarea") {
      setPending(drawn);
      if (known) setCalLen(known.unit === "m2" ? `${known.value.toFixed(2)} m2` : `${known.value.toFixed(3)} m`);
      setTool(null);
      return;
    }
    addTakeoff(path, tool, drawn, label)
      .then(() => (setLabel(""), load()))
      .catch((e) => setErr(String(e.message ?? e)));
  }, [drawn]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => st?.auto.items ?? [], [st]);
  const manual = st?.measurements ?? [];

  useEffect(() => {
    const shapes: Shape[] = [
      ...items.map((i) => ({ id: i.id, points: i.points, closed: i.kind === "area" || !!i.closed, label: i.kind === "area" ? `${i.value.toFixed(1)}` : "", tone: "auto" as const })),
      ...manual.map((m) => ({
        id: m.id, points: m.points, closed: m.kind === "area", tone: m.kind === "count" ? ("count" as const) : ("manual" as const),
        label: `${m.label ? m.label + " " : ""}${m.kind === "count" ? m.value : m.text.split(" (")[0]}`,
      })),
      ...(showRefs ?? []).filter((r) => r.file === path && r.bbox.length === 4).map((r, k) => {
        const [x0, y0, x1, y1] = r.bbox;
        return { id: `ref:${k}`, points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true, label: REF_KIND[r.kind] ?? r.kind, tone: "ref" as const };
      }),
      ...(pending ? [{ id: "pending", points: pending, closed: pending.length > 2, label: "?", tone: "ref" as const }] : []),
    ];
    onShapes(shapes, st?.scale?.m_per_unit ?? null);
  }, [items, manual, showRefs, pending, st]); // eslint-disable-line react-hooks/exhaustive-deps

  function act(p: Promise<unknown>) {
    p.then(() => load()).catch((e) => setErr(String(e.message ?? e)));
  }

  function submitCal() {
    if (!pending) return;
    act(calibrate(path, pending, calLen, known?.id, label).then(() => (setPending(null), setKnown(null), setCalLen(""))));
  }

  function startKnown(k: Known) {
    setKnown(k);
    setTool(k.unit === "m2" ? "calarea" : "calibrate");
  }

  function showRef(refs: Ref[]) {
    setShowRefs(refs);
    const here = refs.filter((r) => r.file === path && r.bbox.length === 4);
    if (here.length) {
      const b = here.map((r) => r.bbox);
      onZoom([Math.min(...b.map((x) => x[0])), Math.min(...b.map((x) => x[1])), Math.max(...b.map((x) => x[2])), Math.max(...b.map((x) => x[3]))]);
    }
  }

  if (!st) return <aside className="changes measure"><div className="ch-empty dim">{err || "Reading the scale…"}</div></aside>;

  const s = st.scale;
  const rooms = items.filter((i) => i.kind === "area");
  const walls = items.filter((i) => i.group === "wall");
  const lens = manual.filter((m) => m.kind === "length");
  const areas = manual.filter((m) => m.kind === "area");
  const counts = manual.filter((m) => m.kind === "count");
  // every reference behind the current scale and every calibration ever stored for this sheet
  const refs: { r: Ref; why: string }[] = [
    ...(s?.refs ?? []).map((r) => ({ r, why: "current scale" })),
    ...st.candidates.filter((c) => c.id !== s?.id).flatMap((c) => c.refs.map((r) => ({ r, why: `candidate ${c.ratio}` }))),
    ...st.calibrations.filter((c) => !(s && c.id === s.id && c.active)).flatMap((c) =>
      c.refs.map((r) => ({ r, why: `${c.active ? "active" : "earlier"} calibration, ${c.created}` }))),
  ];

  return (
    <aside className="changes measure" onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div className="ch-head">
        <div className="ch-title">Measure</div>
        <div className="ch-vs dim ellipsis" title={path}>{fileName(path)}</div>
      </div>
      <div className="ch-body">
        {err && <div className="ms-err">{err}</div>}

        <section className="ms-scale">
          {s ? (
            <>
              <div className="ms-ratio">
                <span className="mono">{s.ratio}</span>
                <span className="dim"> · {SOURCE[s.source] ?? s.source} · {(s.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="ms-text">{s.text}</div>
              {s.agree && <div className="ms-agree">✓ {s.agree}</div>}
              <div className="ms-row">
                <button className="link" onClick={() => showRef(s.refs)}>Show where</button>
                {(st.candidates.length > 1 || st.project.length > 0) && <button className="link" onClick={() => setPick((v) => !v)}>Change</button>}
                <button className="link" onClick={() => (setKnown(null), setTool("calibrate"))}>Recalibrate</button>
                {st.calibrations.some((c) => c.active) && <button className="link" onClick={() => act(chooseScale(path, null))}>Reset</button>}
              </div>
            </>
          ) : (
            <div className="ms-ask">
              <div>{st.ask}</div>
              {st.options.map((o) => (
                <button key={o.id} className="ms-opt" onClick={() => act(chooseScale(path, o.id))} onMouseEnter={() => showRef(o.refs)}>
                  <span className="mono">{o.ratio}</span> <span>{o.text}</span>
                </button>
              ))}
              <button className="ms-opt" onClick={() => (setKnown(null), setTool("calibrate"))}>
                Draw a line over a dimension I know
              </button>
            </div>
          )}
          {pick && (
            <div className="ms-pick">
              {[...st.candidates, ...st.project.filter((p) => p.applies === null && st.image === false)].map((c) => (
                <button key={c.id + c.refs[0]?.file} className={`ms-opt ${c.id === s?.id ? "on" : ""}`} onClick={() => (setPick(false), act(chooseScale(path, c.id)))} onMouseEnter={() => showRef(c.refs)}>
                  <span className="mono">{c.ratio}</span> <span>{c.text}</span>
                  {c.refs[0] && c.refs[0].file !== path && <span className="dim"> · {fileName(c.refs[0].file)}</span>}
                </button>
              ))}
            </div>
          )}
        </section>

        {pending && (
          <section className="ms-cal">
            <div>{pending.length > 2 ? "Real area of the shape you drew:" : "Real length of the line you drew:"}</div>
            {known?.text && <div className="dim">from {known.text}</div>}
            <div className="ms-row">
              <input autoFocus value={calLen} placeholder={pending.length > 2 ? "15.9 m2 or 171 sf" : `12'-6" or 3.5 m`}
                onChange={(e) => setCalLen(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitCal()} />
              <button className="btn" onClick={submitCal}>Set scale</button>
              <button className="link" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </section>
        )}

        <section className="ms-tools">
          {TOOLS.map(({ t, label: l }) => (
            <button key={t} className={tool === t || (t === "calibrate" && tool === "calarea") ? "on" : ""}
              disabled={!s && t !== "calibrate" && t !== "count"}
              onClick={() => (setKnown(null), setTool(tool === t ? null : t))}>
              {l}
            </button>
          ))}
          <input className="ms-label" value={label} placeholder="label (optional)" onChange={(e) => setLabel(e.target.value)} />
        </section>

        <section className="ms-sum">
          {st.auto.lines.map((l, k) => <p key={k}>{l}</p>)}
          {(lens.length > 0 || areas.length > 0 || counts.length > 0) && (
            <p>
              Your takeoffs:{" "}
              {[areas.length && `${areas.length} area${areas.length > 1 ? "s" : ""}, ${sum(areas).toFixed(2)} m²`,
                lens.length && `${lens.length} length${lens.length > 1 ? "s" : ""}, ${sum(lens).toFixed(2)} m`,
                counts.length && `${sum(counts)} counted`].filter(Boolean).join("; ")}.
            </p>
          )}
        </section>

        {manual.length > 0 && (
          <section>
            <h4>Manual takeoffs <span className="dim mono">{manual.length}</span></h4>
            {manual.map((m) => (
              <div key={m.id} className={`ch-row ms-item ${hot === m.id ? "hot" : ""}`} onMouseEnter={() => setHot(m.id)} onMouseLeave={() => setHot(null)}>
                <span className="mono dim">{m.kind[0].toUpperCase()}</span>
                <button className="ellipsis" title={`${m.text}\nscale: ${m.scale?.text ?? "none"}`} onClick={() => onZoom(m.bbox)}>
                  {m.label || m.kind} · {m.kind === "count" ? m.value : m.text}
                </button>
                <button className="x" title="Delete" onClick={() => act(delTakeoff(path, m.id))}>×</button>
              </div>
            ))}
          </section>
        )}

        {rooms.length > 0 && (
          <section>
            <h4>Rooms <span className="dim mono">{rooms.length} · {sum(rooms).toFixed(2)} m²</span></h4>
            {(allAuto ? rooms : rooms.slice(0, 8)).map((r) => (
              <button key={r.id} className={`ch-row ms-auto ${hot === r.id ? "hot" : ""}`} onMouseEnter={() => setHot(r.id)} onMouseLeave={() => setHot(null)} onClick={() => onZoom(r.bbox)}
                title={`perimeter ${r.perimeter_m?.toFixed(2)} m${r.printed != null ? `\nprinted label ${r.printed} m²` : ""}`}>
                <span className="ellipsis">{r.label || "room"}</span>
                <span className="mono">{r.value.toFixed(2)} m²</span>
              </button>
            ))}
            {rooms.length > 8 && <button className="link ms-more" onClick={() => setAllAuto((v) => !v)}>{allAuto ? "Show fewer" : `Show all ${rooms.length}`}</button>}
          </section>
        )}
        {walls.length > 0 && (
          <section>
            <h4>Walls <span className="dim mono">{walls.length} · ≈{sum(walls).toFixed(1)} m</span></h4>
            {Object.entries(
              walls.reduce<Record<string, Takeoff[]>>((a, w) => {
                const k = `${Math.round((w as Takeoff & { thickness_m: number }).thickness_m * 100)} cm`;
                (a[k] ??= []).push(w);
                return a;
              }, {}),
            ).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([k, ws]) => (
              <button key={k} className="ch-row ms-auto" onMouseEnter={() => setShowRefs(null)} onClick={() => onZoom(ws[0].bbox)}>
                <span>{k} thick · {ws.length}×</span>
                <span className="mono">≈{sum(ws).toFixed(1)} m</span>
              </button>
            ))}
          </section>
        )}

        {st.known.length > 0 && (
          <section>
            <h4>Known dimensions <span className="dim mono">{st.known.length}</span></h4>
            <div className="ms-hint dim">Pick one, then draw over it on this sheet to set the scale.</div>
            {st.known.slice(0, 12).map((k) => (
              <button key={k.id} className={`ch-row ms-auto ${known?.id === k.id ? "on" : ""}`} onClick={() => startKnown(k)} onMouseEnter={() => showRef([k.ref])}
                title={k.ref.text}>
                <span className="ellipsis">{k.text}</span>
                <span className="dim ellipsis">{k.ref.file === path ? "this sheet" : fileName(k.ref.file)}</span>
              </button>
            ))}
          </section>
        )}

        <section>
          <h4>References <span className="dim mono">{refs.length}</span></h4>
          <div className="ms-hint dim">Where every scale on this sheet was read. Stored with the drawing.</div>
          {refs.map(({ r, why }, k) => (
            <button key={k} className="ch-row ms-ref" title={r.text} onClick={() => (r.file === path ? showRef([r]) : onOpen(r.file) || showRef([r]))}>
              <span className="ms-tag">{REF_KIND[r.kind] ?? r.kind}</span>
              <span className="ellipsis">{r.text}</span>
              <span className="dim ellipsis">{why}{r.file !== path ? ` · ${fileName(r.file)}` : ""}</span>
            </button>
          ))}
          {showRefs && <button className="link ms-more" onClick={() => setShowRefs(null)}>Hide reference marks</button>}
        </section>
      </div>
    </aside>
  );
}
