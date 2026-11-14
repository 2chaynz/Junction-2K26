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
};
type Data = { path: string; source: "ifc" | "schedule" | "detector" | "none"; rows: Row[]; notes: string[] };

const SOURCE: Record<Data["source"], string> = {
  ifc: "BIM model (IFC)",
  schedule: "door / window schedule on the sheet",
  detector: "symbol detector on the scan",
  none: "",
};


// Kept here so the takeoff stays one file; uses the app's CSS variables.
const CSS = `
.takeoff h1 { font-size: 22px; margin: 0 0 4px; }
.tk-head { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 18px; }
.tk-head .btn { text-decoration: none; color: inherit; }
.tk-sum { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.tk-stat { display: flex; flex-direction: column; padding: 8px 14px; border: 1px solid var(--line); border-radius: var(--r); min-width: 92px; }
.tk-stat .mono { font-size: 20px; }
.tk-stat .dim { font-size: 12px; }
.tk-table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
.tk-table th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dim); padding: 6px 8px; border-bottom: 1px solid var(--line-strong); }
.tk-table th:nth-child(1) { width: 34%; }
.tk-table td { padding: 5px 8px; border-bottom: 1px solid var(--line); }
.tk-table .r { text-align: right; }
.tk-cat td { padding-top: 16px; font-weight: 600; border-bottom: 1px solid var(--line-strong); }
.tk-row { cursor: pointer; }
.tk-row:hover { background: var(--canvas); }
.tk-go { color: var(--red); font-size: 12px; text-align: right; opacity: 0; width: 64px; }
.tk-row:hover .tk-go { opacity: 1; }
.tk-notes { margin-top: 18px; font-size: 12px; padding-left: 18px; }
`;

const url = (path: string, csv = false) => `/api/takeoff?path=${encodeURIComponent(path)}${csv ? "&format=csv" : ""}`;
const num = (v: number, d = 1) => (v ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : "");

export default function Takeoff({ path, name, onShow }: { path: string; name: string; onShow: (r: Row) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!path) return;
    setData(null);
    setError("");
    fetch(url(path))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`takeoff: ${r.status}`))))
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [path]);

  const cats = data ? [...new Set(data.rows.map((r) => r.category))] : [];
  const showQty = !!data?.rows.some((r) => r.length_m || r.area_m2 || r.volume_m3);

  return (
    <div className="page takeoff">
      <style>{CSS}</style>
      <div className="tk-head">
        <div>
          <h1>Takeoff</h1>
          <div className="dim">
            <span className="mono">{name}</span>
            {data && data.source !== "none" && <> · from the {SOURCE[data.source]} · €0</>}
          </div>
        </div>
        <span className="spacer" />
        {data && data.rows.length > 0 && (
          <a className="btn" href={url(path, true)} download>
            Download CSV
          </a>
        )}
      </div>
      {error && <p>{error}</p>}
      {!data && !error && <p className="dim">Reading the drawing…</p>}
      {data && data.rows.length === 0 && <p className="dim">{data.notes.join(" ")}</p>}
      {data && data.rows.length > 0 && (
        <>
          <div className="tk-sum">
            {cats.map((c) => (
              <div key={c} className="tk-stat">
                <span className="mono">{data.rows.filter((r) => r.category === c).reduce((a, r) => a + r.count, 0)}</span>
                <span className="dim">{c.toLowerCase()}</span>
              </div>
            ))}
          </div>
          <table className="tk-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Size</th>
                <th className="r">Count</th>
                <th>Levels</th>
                {showQty && <th className="r">Length m</th>}
                {showQty && <th className="r">Area m²</th>}
                {showQty && <th className="r">Volume m³</th>}
                <th />
              </tr>
            </thead>
            {cats.map((c) => (
              <tbody key={c}>
                <tr className="tk-cat">
                  <td colSpan={showQty ? 8 : 5}>{c}</td>
                </tr>
                {data.rows
                  .filter((r) => r.category === c)
                  .map((r, k) => (
                    <tr key={k} className="tk-row" onClick={() => onShow(r)} title="Show these on the drawing">
                      <td className="ellipsis" title={r.type}>{r.type}</td>
                      <td className="mono">{r.size || <span className="dim">–</span>}</td>
                      <td className="r mono">{r.count}</td>
                      <td className="dim ellipsis" title={r.levels.join(", ")}>
                        {Object.keys(r.by_level ?? {}).length > 1
                          ? Object.entries(r.by_level).map(([l, n]) => `${l} ${n}`).join(" · ")
                          : r.levels.join(", ")}
                      </td>
                      {showQty && <td className="r mono">{num(r.length_m)}</td>}
                      {showQty && <td className="r mono">{num(r.area_m2)}</td>}
                      {showQty && <td className="r mono">{num(r.volume_m3, 2)}</td>}
                      <td className="tk-go">show ›</td>
                    </tr>
                  ))}
              </tbody>
            ))}
          </table>
          <ul className="tk-notes dim">
            {data.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
