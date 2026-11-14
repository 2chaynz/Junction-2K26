import { useRef } from "react";
import Flow from "./Flow";
import { useReveal } from "./motion";

const CRITERIA = [
  { n: "01", t: "Accurate", d: "91.9% on held-out drawings: 97.4% Swiss vector plans, 100% BIM, 94.1% schedules, 83.6% scanned plans the detector never saw." },
  { n: "02", t: "Verifiable", d: "Every answer marks its evidence on the drawing and lists its steps. Stoa's answer shown next to ours." },
  { n: "03", t: "Cheap", d: "€0.00001 per answer on average. Exact readers first, AI only when nothing else can answer." },
  { n: "04", t: "Any language", d: "Ask in English, Finnish, German or Estonian. The answer comes from the drawing, not the wording." },
];

export default function HowItWorks() {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  return (
    <div className="page how" ref={root}>
      <header className="page-head">
        <h1>How it works</h1>
        <p className="lede">
          You ask a question about a drawing. SiteLens hands it to the exact readers first, the ones that read the
          file's own data, and only uses AI when none of them can answer. Every answer shows where on the drawing it
          comes from, how it was found, and what it cost.
        </p>
      </header>

      <Flow />

      <h2>Why not just ask a big model?</h2>
      <div className="two">
        <div className="col">
          <h3>Whole sheet to a frontier model</h3>
          <ul>
            <li>Guesses counts from the picture. You can't see what it counted.</li>
            <li>$0.03–0.22 per plan in an independent benchmark, and seconds to a minute per answer.</li>
            <li>Getting better means paying for next year's model.</li>
          </ul>
        </div>
        <div className="col us">
          <h3>SiteLens</h3>
          <ul>
            <li>Reads the file's own data: model properties, text, lines, symbols.</li>
            <li>Every hit is marked on the drawing. A wrong answer shows at a glance.</li>
            <li>AI is the last resort, for what's left. Better AI only improves that part.</li>
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
