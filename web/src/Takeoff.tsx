import { useEffect, useMemo, useRef, useState } from "react";
import type { Evidence } from "./types";

export type Row = {
  category: string;
  type: string;
  size: string;
  count: number;
  levels: string[];
  by_level: Record<string, number>;
  length_m: number;
  area_m2: number;
  volume_m3: number;
  evidence: Evidence[];
  dimension_evidence?: Evidence[];
  specifications?: string[];
  reason?: string[];
};
type Data = { path: string; source: "ifc" | "schedule" | "drawing" | "detector" | "none"; rows: Row[]; notes: string[] };

const SOURCE: Record<Data["source"], string> = {
  ifc: "BIM model (IFC)",
  schedule: "door / window schedule on the sheet",
  drawing: "drawing and matching schedules",
  detector: "symbol detector on the scan",
  none: "",
};


// Kept here so the takeoff stays one file; uses the app's CSS variables.
const CSS = `
.takeoff h1 { font-size: 22px; margin: 0 0 4px; }
.tk-head { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 18px; }
.tk-head .btn { text-decoration: none; color: inherit; }
.tk-filter { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; margin: 0 0 20px; }
.tk-filter label { display: grid; gap: 4px; font-size: 13px; font-weight: 600; }
.tk-filter select { font: inherit; padding: 7px 10px; border: 1px solid var(--line-strong); border-radius: var(--r); background: var(--bg); }
.tk-filter output { color: var(--dim); padding-bottom: 7px; }
.tk-name { text-align: left; text-decoration: underline; text-underline-offset: 3px; font-weight: 600; }
.tk-table-wrap { overflow-x: auto; overflow-y: hidden; }
.tk-table { min-width: 520px; }
.tk-detail { padding: 14px; background: var(--canvas); }
.tk-detail summary { cursor: pointer; }
.tk-instances { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; margin-top: 10px; }
.tk-table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
.tk-table th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dim); padding: 6px 8px; border-bottom: 1px solid var(--line-strong); }
.tk-table th:nth-child(1) { width: 34%; }
.tk-table td { padding: 5px 8px; border-bottom: 1px solid var(--line); }
.tk-table .r { text-align: right; }
.tk-basis { display: block; white-space: normal; overflow-wrap: anywhere; margin-top: 4px; }
.tk-basis a { display: block; margin-top: 4px; }
.tk-basis summary { cursor: pointer; }
.tk-notes { margin-top: 18px; font-size: 12px; padding-left: 18px; }
.tk-filter { padding: 12px; background: var(--canvas); border: 1px solid var(--line); border-radius: var(--r); }
.tk-filter label { color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
.tk-filter select { color: var(--ink); font-size: 13px; text-transform: none; letter-spacing: 0; min-width: 130px; max-width: 240px; cursor: pointer; transition: border-color .2s, box-shadow .2s, background .2s; }
.tk-filter select:hover { border-color: var(--ink); }
.tk-filter select:focus-visible { outline: none; border-color: var(--red); box-shadow: 0 0 0 3px var(--red-soft); }
.tk-filter .on select { border-color: var(--red); background: var(--red-soft); }
.tk-reset { align-self: end; animation: tk-pop .25s ease-out; }
.tk-cards { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 18px; }
.tk-card { min-width: 120px; padding: 10px 14px; border: 1px solid var(--line); border-radius: var(--r); background: var(--bg); animation: tk-in .4s ease-out both; animation-delay: calc(var(--i, 0) * 60ms); transition: border-color .2s, transform .2s; }
.tk-card:hover { transform: translateY(-2px); border-color: var(--line-strong); }
.tk-card.on { border-color: var(--red); box-shadow: inset 3px 0 0 var(--red); }
.tk-card b { display: block; font: 600 22px var(--mono); }
.tk-card span { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.06em; }
.tk-table tbody { animation: tk-in .35s ease-out both; animation-delay: calc(min(var(--i, 0), 20) * 25ms); }
.tk-table tbody > tr:first-child { transition: background .15s; }
.tk-table tbody:hover > tr:first-child { background: var(--canvas); }
.tk-cat { display: block; font-size: 11px; color: var(--dim); font-weight: 400; }
.tk-q { position: relative; }
.tk-q i { position: absolute; left: 4px; right: 4px; bottom: 2px; height: 3px; background: var(--red); opacity: .55; border-radius: 2px; transform-origin: right; transform: scaleX(var(--s, 0)); animation: tk-grow .6s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(min(var(--i, 0), 20) * 25ms + 120ms); }
.tk-detail { animation: tk-open .3s ease-out both; transform-origin: top; }
.tk-name::after { content: "›"; display: inline-block; margin-left: 6px; text-decoration: none; transition: transform .2s; }
.tk-name[aria-expanded="true"]::after { transform: rotate(90deg); }
.tk-empty { padding: 24px; text-align: center; animation: tk-in .3s ease-out both; }
@keyframes tk-in { from { opacity: 0; transform: translateY(6px); } }
@keyframes tk-pop { from { opacity: 0; transform: scale(.9); } }
@keyframes tk-grow { from { transform: scaleX(0); } }
@keyframes tk-open { from { opacity: 0; transform: scaleY(.92); } }
@media (prefers-reduced-motion: reduce) {
  .takeoff *, .takeoff *::after { animation: none !important; transition: none !important; }
}
`;

type Quantity = "count" | "length_m" | "area_m2" | "volume_m3";
const QUANTITIES: { key: Quantity; label: string; unit: string }[] = [
  { key: "count", label: "Count", unit: "items" },
  { key: "length_m", label: "Length", unit: "m" },
  { key: "area_m2", label: "Area", unit: "m²" },
  { key: "volume_m3", label: "Volume", unit: "m³" },
];
const SORTS = { size: "Largest first", type: "Type A–Z", sizeName: "Size A–Z", none: "As listed" } as const;
type Sort = keyof typeof SORTS;
const ALL = "";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Eases from the last shown value so totals visibly react to each filter change.
function useCountUp(target: number, ms = 600) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reducedMotion()) { setShown(target); from.current = target; return; }
    const start = performance.now(), a = from.current;
    let frame = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms), v = a + (target - a) * (1 - (1 - k) ** 3);
      from.current = v;
      setShown(v);
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return shown;
}

function Card({ value, label, digits, i, on }: { value: number; label: string; digits: number; i: number; on: boolean }) {
  const v = useCountUp(value);
  return <div className={`tk-card${on ? " on" : ""}`} style={{ "--i": i } as React.CSSProperties}>
    <b>{v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}</b><span>{label}</span>
  </div>;
}

function Pick({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return <label className={value !== ALL ? "on" : ""}>{label}
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select>
  </label>;
}

const url = (path: string, csv = false) => `/api/takeoff?path=${encodeURIComponent(path)}${csv ? "&format=csv" : ""}`;
const evidenceUrl = (e: Evidence) => "/api/file?" + new URLSearchParams({
  path: e.file, page: String(e.page), clip: e.bbox.join(","), pad: ".5", scale: "2",
});
const num = (v: number, d = 1) => (v ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : "");

const PROJECT_LANGUAGES: Record<string, string> = { "bsc-esplanades": "et" };

export function projectLanguage(path: string, fallback = document.documentElement.lang || "en") {
  const project = Object.keys(PROJECT_LANGUAGES).find((name) => path.split("/").pop()?.startsWith(name + "_"));
  return project ? PROJECT_LANGUAGES[project] : fallback;
}

export function levelLabel(name: string, language: string) {
  const locale = language.split("-")[0];
  const labels: Record<string, string[]> = {
    en: ["Floor", "Roof", "Foundation"], et: ["Korrus", "Katus", "Vundament"],
    fi: ["Kerros", "Katto", "Perustus"], de: ["Geschoss", "Dach", "Fundament"],
    fr: ["Étage", "Toit", "Fondation"], da: ["Etage", "Tag", "Fundament"],
    uk: ["Поверх", "Дах", "Фундамент"],
  };
  const [floor, roof, foundation] = labels[locale] ?? labels.en;
  const n = name.match(/^(?:floor|level)\s+(\d+)$/i) ?? name.match(/^(\d+)\.\s*korrus$/i);
  if (n) return locale === "et" ? `${n[1]}. korrus` : `${floor} ${n[1]}`;
  if (/^(roof|katus)$/i.test(name)) return roof;
  if (/^(foundation|vundament)$/i.test(name)) return foundation;
  return name;
}

function ItemDetails({ row, language, onShow }: {
  row: Row; language: string; onShow: (r: Row, instance?: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const instances = row.evidence.map((item, i) => item.ifc_guid ? { item, i } : null).filter((item) => item !== null);

  return (
    <div className="tk-detail">
      <strong>{row.type}</strong>
      <p>{[row.size, `${row.count} items`, row.levels.map((name) => levelLabel(name, language)).join(", ")].filter(Boolean).join(" · ")}</p>
      <button className="btn" onClick={() => onShow(row)}>{instances.length ? "Show group in BIM" : "Show on drawing"}</button>
      {instances.length > 0 && <div className="tk-instances">
        <label>Element <select value={index} onChange={(e) => setIndex(Number(e.target.value))}>
          {instances.map(({ item, i }, n) => <option key={item.ifc_guid} value={n}>{n + 1}. {item.label}</option>)}
        </select></label>
        <button className="btn" onClick={() => onShow(row, instances[index].i)}>Open in BIM</button>
      </div>}
    </div>
  );
}

export default function Takeoff({ path, name, language, onShow }: {
  path: string; name: string; language: string; onShow: (r: Row, instance?: number) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [size, setSize] = useState(ALL);
  const [level, setLevel] = useState(ALL);
  const [quantity, setQuantity] = useState<Quantity>("count");
  const [sort, setSort] = useState<Sort>("size");
  const [detail, setDetail] = useState<number | null>(null);

  const reset = () => { setCategory(ALL); setType(ALL); setSize(ALL); setLevel(ALL); setQuantity("count"); setSort("size"); setDetail(null); };

  useEffect(() => {
    setData(null);
    setError("");
    reset();
    if (!path) return;
    const controller = new AbortController();
    fetch(url(path), { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`takeoff: ${r.status}`))))
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((e) => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [path]);

  const all = data?.rows ?? [];
  const label = (n: string) => levelLabel(n, language);
  // Count on the picked level when the row knows its split; lengths, areas and volumes stay whole-group.
  const countOf = (r: Row) => (level !== ALL && r.by_level?.[level] !== undefined ? r.by_level[level] : r.count);

  // Each dropdown lists only what the other active filters leave, with live counts.
  const match = (r: Row, skip: string) =>
    (skip === "category" || category === ALL || r.category === category) &&
    (skip === "type" || type === ALL || r.type === type) &&
    (skip === "size" || size === ALL || (r.size || "Unknown") === size) &&
    (skip === "level" || level === ALL || r.levels.includes(level) || level in (r.by_level ?? {}));
  const options = (skip: string, keys: (r: Row) => string[], allText: string, show = (k: string) => k): [string, string][] => {
    const m = new Map<string, number>();
    for (const r of all) if (match(r, skip)) for (const k of keys(r)) m.set(k, (m.get(k) ?? 0) + (skip === "level" ? (r.by_level?.[k] ?? r.count) : countOf(r)));
    return [[ALL, allText], ...[...m].map(([k, n]): [string, string] => [k, `${show(k)} (${n.toLocaleString(language)})`])];
  };

  const categories = useMemo(() => new Set(all.map((r) => r.category)), [all]);
  const rows = all.filter((r) => match(r, ""));
  const available = QUANTITIES.filter(({ key }) => key === "count" || all.some((r) => r[key]));
  const shown = available.filter(({ key }) => key !== "count" && rows.some((r) => r[key]));
  const q = available.some((a) => a.key === quantity) ? quantity : "count";
  const value = (r: Row) => (q === "count" ? countOf(r) : r[q]);
  const sorted = [...rows].sort((a, b) =>
    sort === "size" ? value(b) - value(a) :
    sort === "type" ? a.type.localeCompare(b.type) :
    sort === "sizeName" ? (a.size || "~").localeCompare(b.size || "~", undefined, { numeric: true }) : 0);
  const max = Math.max(0, ...sorted.map(value));
  const sum = (k: Quantity) => rows.reduce((s, r) => s + (k === "count" ? countOf(r) : r[k]), 0);
  const filtered = category !== ALL || type !== ALL || size !== ALL || level !== ALL;
  const view = [category, type, size, level, q, sort].join("|");
  const set = (f: (v: string) => void) => (v: string) => { f(v); setDetail(null); };

  return (
    <div className="page takeoff">
      <style>{CSS}</style>
      <div className="tk-head">
        <div><h1>Takeoff</h1><div className="dim">{data?.source && data.source !== "none" ? SOURCE[data.source] : name}</div></div>
        <span className="spacer" />
        {all.length > 0 && <a className="btn" href={url(path, true)} download>Download full CSV</a>}
      </div>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p className="dim">{path ? "Reading the drawing…" : "Open a drawing or model to see its takeoff."}</p>}
      {data && !all.length && <p className="dim">{data.notes.join(" ")}</p>}
      {all.length > 0 && <>
        <div className="tk-filter">
          <Pick label="Item category" value={category} onChange={set((v) => { setCategory(v); setType(ALL); setSize(ALL); })}
            options={options("category", (r) => [r.category], `All categories (${categories.size})`)} />
          <Pick label="Type" value={type} onChange={set((v) => { setType(v); setSize(ALL); })}
            options={options("type", (r) => [r.type], "All types")} />
          <Pick label="Size" value={size} onChange={set(setSize)}
            options={options("size", (r) => [r.size || "Unknown"], "All sizes")} />
          <Pick label="Level" value={level} onChange={set(setLevel)}
            options={options("level", (r) => [...new Set([...r.levels, ...Object.keys(r.by_level ?? {})])], "All levels", label)} />
          <label>Quantity
            <select value={q} onChange={(e) => setQuantity(e.target.value as Quantity)}>
              {available.map(({ key, label: l, unit }) => <option key={key} value={key}>{l} ({unit})</option>)}
            </select>
          </label>
          <label>Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          {filtered && <button className="btn tk-reset" onClick={reset}>Clear filters</button>}
        </div>
        <div className="tk-cards">
          <Card i={0} value={sum("count")} label={level !== ALL ? `items on ${label(level)}` : "items"} digits={0} on={q === "count"} />
          <Card i={1} value={rows.length} label={rows.length === 1 ? "group" : "groups"} digits={0} on={false} />
          {shown.map(({ key, label: l, unit }, i) => <Card key={key} i={i + 2} value={sum(key)} label={`${l} (${unit})`} digits={1} on={q === key} />)}
        </div>
        {!sorted.length ? <p className="dim tk-empty">Nothing matches these filters. <button className="btn" onClick={reset}>Clear filters</button></p> :
        <div className="tk-table-wrap"><table className="tk-table">
          <thead><tr><th>Type</th><th>Size</th><th className="r">Count</th><th>Levels</th>
            {shown.map(({ key, label: l, unit }) => <th key={key} className="r">{l} ({unit})</th>)}
          </tr></thead>
          {sorted.map((r, index) => {
            const levels = Object.entries(r.by_level ?? {});
            const bar = (k: Quantity) => (k === q && max > 0 ? <i style={{ "--s": value(r) / max } as React.CSSProperties} /> : null);
            return <tbody key={`${view}|${r.category}|${r.type}|${r.size}|${index}`} style={{ "--i": index } as React.CSSProperties}>
              <tr>
                <td>{r.evidence.some((e) => e.ifc_guid || e.bbox.length === 4) ?
                  <button className="tk-name" aria-expanded={detail === index} onClick={() => setDetail(detail === index ? null : index)}>{r.type}</button> : r.type}
                  {category === ALL && categories.size > 1 && <span className="tk-cat">{r.category}</span>}</td>
                <td>
                  <span className="mono">{r.size || <span className="dim">Unknown</span>}</span>
                  {!!(r.reason?.length || r.specifications?.length || r.dimension_evidence?.length) && (
                    <details className="tk-basis">
                      <summary>Why this size?</summary>
                      {r.reason?.map((line) => <p key={line}>{line}</p>)}
                      {r.specifications?.map((spec) => <p key={spec}>{spec}</p>)}
                      {r.dimension_evidence?.filter((e) => e.bbox.length === 4).map((e, i) => (
                        <a key={i} target="_blank" rel="noreferrer" href={evidenceUrl(e)}
                          title={`${e.file}, page ${e.page + 1}`}>
                          {e.label} &middot; {e.file.split("/").pop()} p.{e.page + 1}
                        </a>
                      ))}
                    </details>
                  )}
                </td>
                <td className="r mono tk-q">{countOf(r)}{bar("count")}</td>
                <td className="dim">{levels.length > 1 ? levels.map(([n, c]) => `${label(n)} (${c})`).join(" · ") : r.levels.map(label).join(", ") || "—"}</td>
                {shown.map(({ key }) => <td key={key} className="r mono tk-q">{num(r[key], 2) || "—"}{bar(key)}</td>)}
              </tr>
              {detail === index && <tr><td colSpan={4 + shown.length}><ItemDetails row={r} language={language} onShow={onShow} /></td></tr>}
            </tbody>;
          })}
        </table></div>}
        {level !== ALL && shown.length > 0 && <p className="dim tk-notes">Count is for {label(level)}; length, area and volume are for the whole group.</p>}
        {data && data.notes.length > 0 && <details className="tk-notes"><summary>Measurement notes</summary><ul>{data.notes.map((note) => <li key={note}>{note}</li>)}</ul></details>}
      </>}
    </div>
  );
}
