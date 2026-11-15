import { Wordmark } from "./Wordmark";
import { useEffect, useMemo, useRef, useState } from "react";
import { fileUrl, viewScale } from "./api";
import { BOARDS, HELD_OUT, MODELS, type Entry } from "./benchData";
import "./bench.css";
import ModelLogo from "./ModelLogo";
import { CountUp, useInView, useReveal } from "./motion";

type Side = { value: unknown; cost_eur: number; seconds: number; evidence: number[][]; correct: boolean; trace: string[] };
type VRow = { path: string; source: string; question: string; truth: unknown; unit: string; ours: Side; vlm: Side };
type Versus = { summary: { ours: { correct: number; n: number; eur: number }; vlm: { correct: number; n: number; eur: number } }; rows: VRow[] };

const SOURCE = { cubicasa5k: "Scan", swiss_dwellings: "Vector", opening_design: "Schedule" } as Record<string, string>;
const eur = (v: number) => (v === 0 ? "€0" : v < 0.001 ? `€${v.toFixed(5)}` : `€${v.toFixed(3)}`);
const HELD_N = HELD_OUT.reduce((s, r) => s + r.n, 0);
const HELD_ACC = HELD_OUT.reduce((s, r) => s + r.n * r.acc, 0) / HELD_N;

function Leaderboard() {
  const [boardId, setBoardId] = useState("vector");
  const [metricId, setMetricId] = useState("window");
  const [pick, setPick] = useState("sitelens");
  const board = BOARDS.find((b) => b.id === boardId)!;
  const metric = board.metrics?.find((m) => m.id === metricId) ?? board.metrics?.[0];
  const entries: Entry[] = metric ? metric.entries : board.entries ?? [];
  const picked = entries.find((e) => e.model === pick) ?? entries[0];
  const m = MODELS[picked.model];
  const us = entries.find((e) => e.model === "sitelens")!;
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box);
  // bars restart from 0 on every board/metric switch: the new rows mount at 0, grow two frames later
  const key = `${boardId}-${metric?.id ?? ""}`;
  const [grown, setGrown] = useState("");
  const grow = seen && grown === key;
  useEffect(() => {
    if (!seen) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => (r2 = requestAnimationFrame(() => setGrown(key))));
    return () => (cancelAnimationFrame(r1), cancelAnimationFrame(r2));
  }, [seen, key]);

  return (
    <div className="lb" ref={box}>
      <div className="lb-main">
        <div className="bseg" role="tablist">
          {BOARDS.map((b) => (
            <button key={b.id} role="tab" className={b.id === boardId ? "on" : ""} onClick={() => setBoardId(b.id)}>
              {b.tab}
            </button>
          ))}
        </div>
        <div className="lb-title">
          <strong>{board.title}</strong>
          <span className="dim small">{board.n}</span>
        </div>
        {board.metrics && (
          <div className="pills">
            {board.metrics.map((x) => (
              <button key={x.id} className={x.id === metric?.id ? "on" : ""} onClick={() => setMetricId(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
        )}
        <div className="rows" key={key}>
          {entries.map((e, i) => {
            const mo = MODELS[e.model];
            return (
              <button
                key={e.model}
                className={`row ${e.model === "sitelens" ? "us" : ""} ${e.model === picked.model ? "on" : ""}`}
                onClick={() => setPick(e.model)}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <span className="rank mono">{e.acc === null ? "" : i + 1}</span>
                <ModelLogo maker={mo.maker} />
                <span className="who">
                  <span className="name">{mo.maker === "sitelens" ? <Wordmark /> : mo.name}</span>
                  <span className="maker dim">{mo.makerName}</span>
                </span>
                <span className="track">
                  {e.acc !== null && <span className="fill" style={{ width: grow ? `${e.acc}%` : 0, transitionDelay: `${i * 70}ms` }} />}
                </span>
                <span className="acc mono">{e.acc === null ? "—" : <><CountUp to={e.acc} run={grow} />%</>}</span>
                <span className="cost mono dim">{e.cost}</span>
              </button>
            );
          })}
        </div>
        <div className="lb-legend dim small">
          <span>accuracy, Stoa's rules: exact counts, ±2% areas</span>
          <span>{board.id === "aecv" ? "cost for all 120 plans" : "cost per answer"}</span>
        </div>
      </div>

      <aside className="lb-panel">
        <div className="kicker">{board.tab}</div>
        <div className="panel-who">
          <ModelLogo maker={m.maker} size={30} />
          <div>
            <h3>{m.maker === "sitelens" ? <Wordmark /> : m.name}</h3>
            <div className="dim small">{m.makerName}</div>
          </div>
        </div>
        <dl className="facts">
          <dt>Accuracy</dt>
          <dd className="mono">{picked.acc === null ? "not run" : `${picked.acc}%`}</dd>
          <dt>Cost</dt>
          <dd className="mono">{picked.cost}</dd>
          {picked.model !== "sitelens" && picked.acc !== null && us.acc !== null && (
            <>
              <dt>vs <Wordmark /></dt>
              <dd>
                {picked.acc === us.acc
                  ? "tied"
                  : `${Math.abs(picked.acc - us.acc).toFixed(1).replace(/\.0$/, "")} points ${picked.acc > us.acc ? "ahead" : "behind"}`}
              </dd>
            </>
          )}
          {picked.note && (
            <>
              <dt>Note</dt>
              <dd>{picked.note}</dd>
            </>
          )}
        </dl>
        <p className="small">{m.reads}</p>
        <p className="takeaway">{board.takeaway}</p>
        <p className="dim tiny">Source: {board.source}</p>
      </aside>
    </div>
  );
}

function SideBySide() {
  const [v, setV] = useState<Versus | null>(null);
  const [i, setI] = useState(6); // Swiss doors: the one Gemini gets wrong (9 vs 12)
  const [size, setSize] = useState<[number, number] | null>(null);

  useEffect(() => {
    fetch("/versus.json").then((r) => r.json()).then(setV).catch(() => setV(null));
  }, []);
  const row = v?.rows[i];
  useEffect(() => setSize(null), [row?.path]);
  const scale = row ? viewScale(row.path) : 1;
  const boxes = useMemo(() => (row ? { ours: row.ours.evidence, vlm: row.vlm.evidence } : null), [row]);
  if (!v || !row || !boxes) return null;
  const sw = size ? Math.max(size[0], size[1]) / 400 : 1;

  return (
    <>
      <div className="vs-tiles">
        <div className="vs-score us">
          <ModelLogo maker="sitelens" size={26} />
          <span className="big mono">{v.summary.ours.correct}/{v.summary.ours.n}</span>
          <span className="dim small"><Wordmark /> · {eur(v.summary.ours.eur)} total</span>
        </div>
        <span className="vs-x dim">vs</span>
        <div className="vs-score">
          <ModelLogo maker="google" size={26} />
          <span className="big mono">{v.summary.vlm.correct}/{v.summary.vlm.n}</span>
          <span className="dim small">Gemini 3.8 Flash · {eur(v.summary.vlm.eur)} total</span>
        </div>
      </div>

      <div className="vs">
        <ol className="vs-list">
          {v.rows.map((r, k) => (
            <li key={k}>
              <button className={k === i ? "on" : ""} onClick={() => setI(k)}>
                <span className="src dim">{SOURCE[r.source] ?? r.source}</span>
                <span className="q">{r.question.replace(/^On sheet \S+ of the .*? drawings \([^)]*\), /, "")}</span>
                <span className={`mk ${r.ours.correct ? "ok" : "ko"}`} title="Sindri">{r.ours.correct ? "✓" : "✗"}</span>
                <span className={`mk g ${r.vlm.correct ? "ok" : "ko"}`} title="Gemini">{r.vlm.correct ? "✓" : "✗"}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="vs-detail">
          <p className="vs-q">{row.question}</p>
          <div className="vs-answers">
            <div className="ans truth">
              <span className="dim small">Stoa's answer</span>
              <span className="mono big2">{String(row.truth)}</span>
            </div>
            <div className={`ans us ${row.ours.correct ? "ok" : "ko"}`}>
              <span className="lbl"><ModelLogo maker="sitelens" size={16} /> <Wordmark /></span>
              <span className="mono big2">{String(row.ours.value)} {row.ours.correct ? "✓" : "✗"}</span>
              <span className="dim small mono">{eur(row.ours.cost_eur)} · {row.ours.seconds.toFixed(1)} s</span>
            </div>
            <div className={`ans g ${row.vlm.correct ? "ok" : "ko"}`}>
              <span className="lbl"><ModelLogo maker="google" size={16} /> Gemini 3.8 Flash</span>
              <span className="mono big2">{String(row.vlm.value)} {row.vlm.correct ? "✓" : "✗"}</span>
              <span className="dim small mono">{eur(row.vlm.cost_eur)} · {row.vlm.seconds.toFixed(1)} s</span>
            </div>
          </div>
          <div className="vs-sheet">
            <img
              key={row.path}
              src={fileUrl(row.path, scale)}
              alt=""
              onLoad={(e) => setSize([e.currentTarget.naturalWidth / scale, e.currentTarget.naturalHeight / scale])}
            />
            {size && (
              <svg viewBox={`0 0 ${size[0]} ${size[1]}`} preserveAspectRatio="xMidYMid meet">
                {boxes.vlm.map((b, k) => (
                  <rect key={`g${k}`} className="bx g" x={b[0]} y={b[1]} width={b[2] - b[0]} height={b[3] - b[1]} strokeWidth={1.6 * sw} />
                ))}
                {boxes.ours.map((b, k) => (
                  <rect key={`o${k}`} className="bx us" x={b[0]} y={b[1]} width={b[2] - b[0]} height={b[3] - b[1]} strokeWidth={1.6 * sw} />
                ))}
              </svg>
            )}
          </div>
          <div className="vs-legend small">
            <span><i className="sw us" /> <Wordmark /> marks ({boxes.ours.length})</span>
            <span><i className="sw g" /> Gemini marks ({boxes.vlm.length})</span>
            <span className="dim">Every mark can be checked against the drawing.</span>
          </div>
        </div>
      </div>
    </>
  );
}

function HeldOut() {
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box);
  return (
    <div className="held" ref={box}>
      {HELD_OUT.map((r, i) => (
        <div key={r.label} className="hrow">
          <span>{r.label}</span>
          <span className="track">
            <span className="fill" style={{ width: seen ? `${r.acc}%` : 0, transitionDelay: `${i * 60}ms` }} />
          </span>
          <span className="mono"><CountUp to={Math.round(r.acc * 10) / 10} run={seen} />%</span>
          <span className="mono dim small">{r.n.toLocaleString("en")} Qs</span>
        </div>
      ))}
    </div>
  );
}

function Headline() {
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box, "0px");
  return (
    <div className="headline" ref={box}>
      <div>
        <span className="big mono"><CountUp to={Math.round(HELD_ACC * 10) / 10} decimals={1} run={seen} />%</span>
        <span className="small"><Wordmark /> on {HELD_N.toLocaleString("en")} held-out questions</span>
      </div>
      <div>
        <span className="big mono"><CountUp to={100} run={seen} />% <span className="dim">vs</span> <CountUp to={60} run={seen} />%</span>
        <span className="small">vector plans, same 40 questions, <Wordmark /> vs Gemini 3.8 Flash</span>
      </div>
      <div>
        <span className="big mono"><CountUp to={24} run={seen} />×</span>
        <span className="small">cheaper than Gemini on the head-to-head below, with more right answers</span>
      </div>
    </div>
  );
}

export default function Benchmark() {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  return (
    <div className="page bench-page" ref={root}>
      <header className="page-head">
        <h1>Benchmark</h1>
        <p className="lede">
          Same drawings, same questions, Stoa's answer key. <Wordmark /> against today's frontier vision models: how often
          each is right, and what each answer costs.
        </p>
      </header>

      <Headline />

      <h2>Leaderboard</h2>
      <p className="small dim">Click a model to see how it reads a drawing.</p>
      <Leaderboard />

      <h2>Side by side, one drawing at a time</h2>
      <p className="small dim">
        11 held-out questions across scans, vector plans and schedules. Pick one to see both answers and both sets of
        marks.
      </p>
      <SideBySide />

      <h2><Wordmark /> by drawing type</h2>
      <HeldOut />
      <p className="dim tiny">
        Held-out = Stoa preview dev split: drawings never used to train the detector or tune rules. Reproduce:{" "}
        <span className="mono">python -m eval.score --split dev</span>.
      </p>
    </div>
  );
}
