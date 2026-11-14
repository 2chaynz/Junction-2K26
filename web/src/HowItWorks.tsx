const PATHS = [
  {
    n: "01", name: "BIM model", reads: "IFC files", tool: "ifcopenshell: spaces, walls, slabs, property sets",
    cost: "€0", note: "Exact quantities straight from the model. No AI.",
  },
  {
    n: "02", name: "Vector drawing", reads: "CAD-exported PDF, DXF", tool: "PyMuPDF + geometry rules: words, polylines, layers",
    cost: "€0", note: "Room labels and outlines are text and lines, so we read them like a database.",
  },
  {
    n: "03", name: "Schedules", reads: "door and finish tables on sheets", tool: "table extraction, Gemini over the extracted table",
    cost: "€0 + LLM call", note: "Counts and marks come from the schedule rows, cited cell by cell.",
  },
  {
    n: "04", name: "Symbol detector", reads: "scanned plans, PNG/JPG", tool: "YOLO11l fine-tuned on CubiCasa5K, runs on a laptop CPU",
    cost: "€0.00001", note: "Every door, window, WC is a box on the plan you can check.",
  },
  {
    n: "05", name: "Facts", reads: "free-form questions", tool: "LLM over facts the parsers already extracted, no image",
    cost: "≈ €0.002", note: "'Is there a balcony?' gets an answer that cites the extracted rooms.",
  },
  {
    n: "06", name: "Vision model", reads: "anything left", tool: "Gemini on the sheet, last resort",
    cost: "≈ €0.001–0.014", note: "Lowest confidence, flagged 'please check'.",
  },
];

const CRITERIA = [
  { n: "01", t: "Accurate", d: "89.3% on 25,295 dev questions. 80.4% on the CubiCasa5K official test plans." },
  { n: "02", t: "Verifiable", d: "Every answer marks its evidence on the drawing and lists its steps. Stoa's answer shown next to ours." },
  { n: "03", t: "Cheap", d: "€0.00001 per answer on average. Exact readers first, models only when nothing else can answer." },
  { n: "04", t: "Any language", d: "Ask in English, Finnish, German or Estonian. The router reads the drawing, not the wording." },
];

export default function HowItWorks() {
  return (
    <div className="page">
      <header className="page-head">
        <h1>How it works</h1>
        <p className="lede">
          A question and a drawing go to a router. It tries the cheapest exact reader first and stops at the first one
          that answers. Each answer carries its value, the regions it came from, the steps, and what it cost.
        </p>
      </header>

      <figure className="diagram">
        <img src="/architecture.svg" alt="SiteLens architecture: question and drawing go through a cheapest-first router over the paths below" />
      </figure>

      <h2>The readers, in the order the router tries them</h2>
      <ol className="paths">
        {PATHS.map((p) => (
          <li key={p.n}>
            <span className="num mono">{p.n}</span>
            <div>
              <div className="pname">
                {p.name} <span className="dim">· {p.reads}</span>
              </div>
              <div className="dim small">{p.tool}</div>
              <div className="small">{p.note}</div>
            </div>
            <span className="mono pcost">{p.cost}</span>
          </li>
        ))}
      </ol>

      <h2>Why not just ask a big model?</h2>
      <div className="two">
        <div className="col">
          <h3>Whole sheet to a frontier model</h3>
          <ul>
            <li>Guesses counts from pixels; no way to see what it counted.</li>
            <li>$0.03–0.22 per plan on AECV-Bench (Gemini 3.5 Flash to GPT-5.5), seconds to a minute each.</li>
            <li>Same answer quality next year only if you pay for next year's model.</li>
          </ul>
        </div>
        <div className="col us">
          <h3>SiteLens</h3>
          <ul>
            <li>Reads the drawing's own data: model elements, text, lines, symbols.</li>
            <li>Every hit is marked on the plan. A wrong answer is visible in one glance.</li>
            <li>Models are the last resort, on what's left. Better models only make that part better.</li>
          </ul>
        </div>
      </div>

      <h2>What we optimise for</h2>
      <div className="criteria">
        {CRITERIA.map((c) => (
          <div key={c.n} className="crit">
            <span className="num mono">{c.n}</span>
            <div className="ctitle">{c.t}</div>
            <p className="small">{c.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
