// Numbers from eval/report.md (T10) and eval/aecv_report.md (T17), Sat 14 Nov 2026. Static: no live run in the demo.

const BY_TYPE: [string, string, number, number][] = [
  ["Swiss vector plans", "count", 5158, 97.4],
  ["Swiss vector plans", "area", 2422, 96.8],
  ["BIM models (IFC)", "area", 382, 92.4],
  ["BIM models (IFC)", "volume", 36, 86.1],
  ["Scanned plans (CubiCasa)", "count", 16968, 85.9],
  ["BIM models (IFC)", "count", 124, 83.1],
  ["BIM models (IFC)", "length", 18, 77.8],
];

const CUBI: [string, number, number][] = [
  ["floors", 98.7, 97.3],
  ["WC rooms", 92.3, 94.5],
  ["kitchens", 91.8, 94.6],
  ["toilets", 89.5, 92.9],
  ["bedrooms", 88.7, 94.5],
  ["bathrooms", 87.9, 92.4],
  ["showers/baths", 80.3, 84.9],
  ["sinks", 79.3, 83.3],
  ["saunas", 78.8, 83.5],
  ["balconies", 69.6, 71.9],
  ["doors", 65.5, 75.5],
  ["windows", 49.4, 65.4],
];

type Row = { model: string; door: number; window: number; bedroom: number; toilet: number; cost: string; us?: boolean };
const AECV: Row[] = [
  { model: "SiteLens detector", door: 37, window: 41, bedroom: 53, toilet: 66, cost: "€0.006", us: true },
  { model: "Gemini 3.5 Flash", door: 43, window: 39, bedroom: 93, toilet: 82, cost: "$3.77" },
  { model: "Gemini 3.1 Pro", door: 34, window: 33, bedroom: 91, toilet: 82, cost: "n/a" },
  { model: "Claude Fable 5", door: 36, window: 29, bedroom: 93, toilet: 82, cost: "$9.22" },
  { model: "GPT-5.5", door: 30, window: 28, bedroom: 92, toilet: 77, cost: "$26.88" },
  { model: "Gemma 4 31B", door: 22, window: 13, bedroom: 80, toilet: 78, cost: "$0.02" },
];

function Bar({ v, us = true, label }: { v: number; us?: boolean; label: string }) {
  return (
    <span className="bar" title={label}>
      <span className={`fill ${us ? "us" : ""}`} style={{ width: `${v}%` }} />
    </span>
  );
}

export default function Benchmark() {
  const best = (k: keyof Row) => Math.max(...AECV.map((r) => r[k] as number));
  return (
    <div className="page">
      <header className="page-head">
        <h1>Benchmark</h1>
        <p className="lede">
          Scored against Stoa's answer key with their rules: exact counts, ±2% on areas, lengths and volumes. Dev split
          = drawings never used for training or tuning. No VLM in these runs; laptop CPU.
        </p>
      </header>

      <div className="tiles">
        <div className="stat">
          <div className="big mono">89.3%</div>
          <div>Full dataset, dev split</div>
          <div className="dim small">25,295 questions, all sources</div>
        </div>
        <div className="stat">
          <div className="big mono">80.4%</div>
          <div>CubiCasa5K official test plans</div>
          <div className="dim small">6,796 questions · best other team we know of: 78.7%</div>
        </div>
        <div className="stat">
          <div className="big mono">€0.00001</div>
          <div>Average cost per answer</div>
          <div className="dim small">Gemini 3.5 Flash on a whole plan: ≈ $0.03</div>
        </div>
      </div>

      <h2>Accuracy by drawing type</h2>
      <table className="bench">
        <thead>
          <tr><th>Drawings</th><th>Question</th><th className="r">Questions</th><th className="w">Accuracy</th><th className="r" /></tr>
        </thead>
        <tbody>
          {BY_TYPE.map(([src, t, n, acc]) => (
            <tr key={src + t}>
              <td>{src}</td>
              <td className="dim">{t}</td>
              <td className="r mono">{n.toLocaleString("en")}</td>
              <td><Bar v={acc} label={`${src} · ${t}: ${acc}% of ${n}`} /></td>
              <td className="r mono">{acc}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dim small">
        Schedule questions (opening_design) and text questions are not in these runs; the schedule reader landed after.
      </p>

      <h2>Outside benchmark: AECV-Bench, 120 plans we never trained on</h2>
      <p className="small">
        Object counting, exact match. Our detector only saw Finnish CubiCasa plans; these are mostly French. Bold = best in
        column.
      </p>
      <table className="bench">
        <thead>
          <tr><th>Model</th><th className="r">Doors</th><th className="r">Windows</th><th className="r">Bedrooms</th><th className="r">Toilets</th><th className="r">Cost, 120 plans</th></tr>
        </thead>
        <tbody>
          {AECV.map((r) => (
            <tr key={r.model} className={r.us ? "us" : ""}>
              <td>{r.model}</td>
              {(["door", "window", "bedroom", "toilet"] as const).map((k) => (
                <td key={k} className={`r mono ${r[k] === best(k) ? "best" : ""}`}>{r[k]}%</td>
              ))}
              <td className="r mono">{r.cost}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">
        Symbols (windows, doors): the detector matches or beats frontier models for 600–4,500x less. Labelled rooms
        (bedrooms, toilets): models win by reading the text, which is why room-label OCR and the facts reader exist.
      </p>

      <h2>Scanned plans, per question</h2>
      <table className="bench">
        <thead>
          <tr><th>Count of</th><th className="w">Official test plans</th><th className="r">Test</th><th className="r">Dev</th></tr>
        </thead>
        <tbody>
          {CUBI.map(([q, test, dev]) => (
            <tr key={q}>
              <td>{q}</td>
              <td><Bar v={test} label={`${q}: ${test}% on test, ${dev}% on dev`} /></td>
              <td className="r mono">{test}%</td>
              <td className="r mono dim">{dev}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dim small">Where we fail: windows and doors on scans, as for every team. Reproduce: python -m eval.score --split dev.</p>
    </div>
  );
}
