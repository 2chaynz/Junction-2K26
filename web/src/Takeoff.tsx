import { useEffect, useState } from "react";
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
.tk-table-wrap { overflow-x: auto; }
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
`;

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
  const [category, setCategory] = useState("");
  const [detail, setDetail] = useState<number | null>(null);

  useEffect(() => {
    setData(null);
    setError("");
    setCategory("");
    setDetail(null);
    if (!path) return;
    const controller = new AbortController();
    fetch(url(path), { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`takeoff: ${r.status}`))))
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((e) => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [path]);

  const counts = new Map<string, number>();
  for (const r of data?.rows ?? []) counts.set(r.category, (counts.get(r.category) ?? 0) + r.count);
  const selected = category || counts.keys().next().value || "";
  const rows = data?.rows.filter((r) => r.category === selected) ?? [];
  const total = counts.get(selected) ?? 0;
  const quantities = [
    { key: "length_m", label: "Length (m)" },
    { key: "area_m2", label: "Area (m\u00b2)" },
    { key: "volume_m3", label: "Volume (m\u00b3)" },
  ].filter(({ key }) => rows.some((r) => r[key as "length_m" | "area_m2" | "volume_m3"]));

  return (
    <div className="page takeoff">
      <style>{CSS}</style>
      <div className="tk-head">
        <div><h1>Takeoff</h1><div className="dim">{data?.source && data.source !== "none" ? SOURCE[data.source] : name}</div></div>
        <span className="spacer" />
        {counts.size > 0 && <a className="btn" href={url(path, true)} download>Download full CSV</a>}
      </div>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p className="dim">{path ? "Reading the drawing…" : "Open a drawing or model to see its takeoff."}</p>}
      {data && !counts.size && <p className="dim">{data.notes.join(" ")}</p>}
      {rows.length > 0 && <>
        <div className="tk-filter">
          <label>Item type
            <select value={selected} onChange={(e) => { setCategory(e.target.value); setDetail(null); }}>
              {[...counts].map(([label, count]) => <option key={label} value={label}>{label} ({count})</option>)}
            </select>
          </label>
          <output>{total.toLocaleString(language)} items across {rows.length} {rows.length === 1 ? "group" : "groups"}</output>
        </div>
        <div className="tk-table-wrap"><table className="tk-table">
          <thead><tr><th>Type</th><th>Size</th><th className="r">Count</th><th>Levels</th>
            {quantities.map(({ key, label }) => <th key={key} className="r">{label}</th>)}
          </tr></thead>
          {rows.map((r, index) => {
            const levels = Object.entries(r.by_level ?? {});
            const label = (name: string) => levelLabel(name, language);
            return <tbody key={`${r.type}|${r.size}|${index}`}>
              <tr>
                <td>{r.evidence.some((e) => e.ifc_guid || e.bbox.length === 4) ?
                  <button className="tk-name" aria-expanded={detail === index} onClick={() => setDetail(detail === index ? null : index)}>{r.type}</button> : r.type}</td>
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
                <td className="r mono">{r.count}</td>
                <td className="dim">{levels.length > 1 ? levels.map(([name, count]) => `${label(name)} (${count})`).join(" · ") : r.levels.map(label).join(", ") || "—"}</td>
                {quantities.map(({ key }) => <td key={key} className="r mono">{num(r[key as "length_m" | "area_m2" | "volume_m3"], 2) || "—"}</td>)}
              </tr>
              {detail === index && <tr><td colSpan={4 + quantities.length}><ItemDetails row={r} language={language} onShow={onShow} /></td></tr>}
            </tbody>;
          })}
        </table></div>
        {data && data.notes.length > 0 && <details className="tk-notes"><summary>Measurement notes</summary><ul>{data.notes.map((note) => <li key={note}>{note}</li>)}</ul></details>}
      </>}
    </div>
  );
}
