import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { METHOD_NAME, fmtAnswer, fmtEur, fmtTime, fmtValue, shortName } from "./format";
import { CountUpText } from "./motion";
import VlmPicker from "./VlmPicker";
import type { Answer, Mark, Msg, Reason, Source, Step, Table } from "./types";

type Props = {
  msgs: Msg[];
  path: string;
  chips: string[];
  active: number | null; // index in msgs of the answer whose marks are on the plan
  hover: number | null;
  focus: number | null;
  draft: string;
  busy: boolean;
  setDraft: (s: string) => void;
  onAsk: (q: string) => void;
  mark?: Mark | null; // T49: highlighted spot the next question is about
  onClearMark?: () => void;
  onActivate: (msg: number) => void;
  onHover: (i: number | null) => void;
  onFocus: (i: number | null) => void;
  artifact?: ReactNode;
  head?: ReactNode; // T61: which session this conversation is saved in
};

const MAX_CITES = 9;

// A reader that was tried and declined reads as one line: "Is there an earlier issue…? No."
function lines(steps: Step[]) {
  const out: { kind: Step["kind"]; text: string }[] = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (s.kind === "skip" && last?.kind === "try") out[out.length - 1] = { kind: "skip", text: `${last.text} ${s.text}` };
    else out.push({ kind: s.kind, text: s.text });
  }
  return out;
}

function Thinking({ steps, live, time }: { steps: Step[]; live: boolean; time?: number }) {
  const [open, setOpen] = useState(live);
  const ls = lines(steps);
  return (
    <div className={`think ${live ? "live" : ""}`}>
      <button
        className="think-head"
        aria-expanded={open}
        onClick={(e) => (e.stopPropagation(), setOpen(!open))}
      >
        {live ? "Thinking…" : `${open ? "▾" : "▸"} Reasoned for ${fmtTime(time ?? 0)} · ${ls.length} steps`}
      </button>
      {open && (
        <ol className="think-body">
          {ls.length === 0 && <li className="try">Reading the question…</li>}
          {ls.map((l, i) => (
            <li key={i} className={l.kind}>{l.text}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Cites({ a, on, hover, focus, onHover, onFocus }: {
  a: Answer; on: boolean; hover: number | null; focus: number | null;
  onHover: (i: number | null) => void; onFocus: (i: number | null) => void;
}) {
  const [all, setAll] = useState(false);
  const n = a.evidence.length;
  if (!n) return null;
  if (n > MAX_CITES && !all)
    return (
      <button className="cite range" onClick={(e) => (e.stopPropagation(), setAll(true))} title="Show all">
        [1]…[{n}]
      </button>
    );
  return (
    <span className="cites">
      {a.evidence.map((e, i) => (
        <button
          key={i}
          className={`cite ${on && hover === i ? "hot" : ""} ${on && focus === i ? "focus" : ""}`}
          title={e.label || e.kind}
          onMouseEnter={() => on && onHover(i)}
          onMouseLeave={() => on && onHover(null)}
          onClick={(ev) => {
            if (!on) return;
            ev.stopPropagation();
            onFocus(focus === i ? null : i);
          }}
        >
          [{i + 1}]
        </button>
      ))}
    </span>
  );
}

const TIER: Record<string, string> = {
  chat: "Conversation", check: "Answer key", drawing: "This drawing", project: "Related sheet", vlm: "Vision model", web: "Web",
};

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

// One source behind a [n]: where it is (sheet, page, crop) or the web page, and a way to light it on the plan.
function SourceCard({ s, onShow }: { s: Source; onShow: (() => void) | null }) {
  if (s.tier === "web")
    return (
      <div className="src-card" onClick={(e) => e.stopPropagation()}>
        <div className="src-head"><span className="src-n">{s.n}</span><span className="src-tier web">Web</span></div>
        <a href={s.url} target="_blank" rel="noreferrer noopener" className="src-link">{s.title || host(s.url ?? "")}</a>
      </div>
    );
  const crop = s.bbox && s.bbox.length === 4 && s.file
    ? `/api/file?path=${encodeURIComponent(s.file)}&page=${s.page ?? 0}&clip=${s.bbox.map((v) => v.toFixed(1)).join(",")}&pad=${Math.min(s.bbox[2] - s.bbox[0], s.bbox[3] - s.bbox[1]) < 30 ? 3 : 0.8}&scale=2`
    : null;
  return (
    <div className="src-card" onClick={(e) => e.stopPropagation()}>
      <div className="src-head">
        <span className="src-n">{s.n}</span>
        <span className={`src-tier ${s.tier}`}>{TIER[s.tier] ?? s.tier}</span>
        <span className="ellipsis" title={s.file}>{s.file ? shortName(s.file) : ""}</span>
        {s.file && !s.file.endsWith(".ifc") && <span className="dim mono">p. {(s.page ?? 0) + 1}</span>}
      </div>
      <div className="src-label">{s.label}</div>
      {crop && <img className="src-crop" src={crop} alt={s.label} />}
      {s.ifc_guid && <div className="dim mono">BIM element {s.ifc_guid}</div>}
      {onShow && <button className="btn small" onClick={onShow}>{s.ifc_guid ? "Show in the model" : "Highlight on the plan"}</button>}
    </div>
  );
}

// The verifiable chain: each line cites [n]; a click opens the source under the line and lights it up.
function Reasoning({ a, on, focus, onFocus, onActivate }: {
  a: Answer; on: boolean; focus: number | null; onFocus: (i: number | null) => void; onActivate: () => void;
}) {
  const [open, setOpen] = useState<{ line: number; n: number } | null>(null);
  const [wide, setWide] = useState<Set<number>>(new Set());
  const rs: Reason[] = a.reasoning ?? [];
  if (!rs.length) return null;
  const src = new Map((a.sources ?? []).map((s) => [s.n, s]));
  const show = (s: Source) =>
    s.ev === undefined || s.ev === null ? null : () => {
      if (!on) onActivate();
      onFocus(s.ev!);
    };
  const pick = (line: number, n: number) => {
    const same = open?.line === line && open.n === n;
    setOpen(same ? null : { line, n });
    const s = src.get(n);
    if (!same && s) show(s)?.();
  };
  let tier = "";
  return (
    <ol className="reasoning" onClick={(e) => e.stopPropagation()}>
      {rs.map((r, i) => {
        const head = r.tier !== tier ? ((tier = r.tier), TIER[r.tier] ?? r.tier) : null;
        const many = r.src.length > 6 && !wide.has(i);
        const card = open?.line === i ? src.get(open.n) : undefined;
        return (
          <li key={i} className={`r ${r.tier}`}>
            {head && <div className="r-tier">{head}</div>}
            <span className="r-text">{r.text}</span>
            {many ? (
              <button className="cite range" onClick={() => setWide(new Set([...wide, i]))} title="Show every source">
                [{r.src[0]}]…[{r.src[r.src.length - 1]}]
              </button>
            ) : (
              r.src.map((n) => {
                const s = src.get(n);
                const lit = on && s?.ev != null && focus === s.ev;
                return (
                  <button key={n} className={`cite ${open?.line === i && open.n === n ? "open" : ""} ${lit ? "focus" : ""}`}
                    title={s?.label} onClick={() => pick(i, n)}>
                    [{n}]
                  </button>
                );
              })
            )}
            {card && <SourceCard s={card} onShow={show(card)} />}
          </li>
        );
      })}
    </ol>
  );
}

function csvOf(t: Table): string {
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [t.columns, ...t.rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

function download(t: Table, question: string) {
  // BOM so Excel reads UTF-8 (×, ↔, umlauts)
  const blob = new Blob(["﻿" + csvOf(t)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (question || t.title).replace(/[^\w -]+/g, "").trim().slice(0, 60).replace(/\s+/g, "-") + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Row i is cited by evidence i: hover/click a row to light it on the drawing or the 3D model.
function AnswerTable({ t, question, on, hover, focus, onHover, onFocus }: {
  t: Table; question: string; on: boolean; hover: number | null; focus: number | null;
  onHover: (i: number | null) => void; onFocus: (i: number | null) => void;
}) {
  return (
    <div className="atable" onClick={(e) => e.stopPropagation()}>
      <div className="atable-head">
        <span className="atable-title">{t.title}</span>
        <span className="dim mono">{t.rows.length} rows</span>
        <span className="spacer" />
        <button className="btn small" onClick={() => download(t, question)}>Download CSV</button>
      </div>
      {t.rows.length > 0 && (
        <div className="atable-scroll">
          <table>
            <thead>
              <tr>{t.columns.map((c, k) => <th key={k}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => (
                <tr
                  key={i}
                  className={`${on && hover === i ? "hot" : ""} ${on && focus === i ? "focus" : ""}`}
                  onMouseEnter={() => on && onHover(i)}
                  onMouseLeave={() => on && onHover(null)}
                  onClick={() => on && onFocus(focus === i ? null : i)}
                >
                  {r.map((v, k) => <td key={k} title={String(v)}>{String(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AnswerMsg(props: {
  a: Answer; question: string; steps: Step[]; on: boolean; busy: boolean; onAsk: (q: string) => void; hover: number | null; focus: number | null;
  onHover: (i: number | null) => void; onFocus: (i: number | null) => void; onActivate: () => void;
}) {
  const { a } = props;
  const reasoning = <Reasoning a={a} on={props.on} focus={props.focus} onFocus={props.onFocus} onActivate={props.onActivate} />;
  const asked = a.followup && <div className="followup">Read as: “{a.followup.standalone}”</div>;
  const [steps, setSteps] = useState(false);
  // The router appends its own timing line; the meta line shows time instead.
  const notes = a.trace.filter((s) => !/ path, [\d.]+s$/.test(s));
  const meta = (
    <span className="mono">
      {METHOD_NAME[a.method] ?? a.method} · {fmtEur(a.cost_eur)} · {fmtTime(a.time_s)}
    </span>
  );

  if (a.method === "clarify" && a.clarify)
    return (
      <>
        <p>{a.clarify.ask}</p>
        <div className="options">
          {a.clarify.options.map((q) => (
            <button key={q} className="option" disabled={props.busy} onClick={(e) => (e.stopPropagation(), props.onAsk(q))}>
              {q}
            </button>
          ))}
        </div>
        <div className="meta"><span className="mono">asked back · {fmtEur(a.cost_eur)} · {fmtTime(a.time_s)}</span></div>
      </>
    );

  if (a.value === null || a.value === undefined)
    return (
      <>
        {asked}
        <p>Couldn't find this in the drawing, the project or the web.</p>
        <div className="meta">
          {a.tried?.length ? `Tried: ${a.tried.map((t) => METHOD_NAME[t] ?? t).join(", ")} · ` : ""}
          <span className="mono">{fmtTime(a.time_s)}</span>
        </div>
        {reasoning}
      </>
    );

  if (a.method === "general" || a.method === "web")
    return (
      <>
        {asked}
        <div className="tag">{a.method === "web" ? "web search" : "general"} · not from the drawing</div>
        <p>{String(a.value)}</p>
        <div className="meta">{meta}</div>
        {reasoning}
      </>
    );

  if (a.method === "revision") return (
    <>
      <p className="demo-answer">{fmtAnswer(a)}</p>
      <ul>{notes.slice(0, 4).map((line) => <li key={line}>{line}</li>)}</ul>
      <details><summary>All quantities and method</summary>
        <ul>{notes.map((line) => <li key={line}>{line}</li>)}</ul>
      </details>
    </>
  );

  const c = a.check;
  return (
    <>
      {asked}
      {a.tier === "project" && a.source_path && (
        <div className="tag">found on a related sheet · {shortName(a.source_path)}</div>
      )}
      <div className="value-line">
        <span className="value"><CountUpText text={fmtAnswer(a)} /></span>
        <Cites {...props} />
        {a.confidence < 0.6 && <span className="warn">please check</span>}
      </div>
      <div className="meta">
        {meta}
        {c && c.match === true && <span className="stoa ok"> · ✓ Stoa</span>}
        {c && c.match === false && <span className="stoa ko">✗ Stoa: {fmtValue(c.expected, c.unit)}</span>}
      </div>
      {a.table && (
        <AnswerTable t={a.table} question={props.question} on={props.on} hover={props.hover} focus={props.focus}
          onHover={props.onHover} onFocus={props.onFocus} />
      )}
      {reasoning}
      {!a.reasoning?.length && props.steps.length === 0 && notes.length > 0 && (
        <>
          <button className="steps-toggle" onClick={(e) => (e.stopPropagation(), setSteps(!steps))}>
            {steps ? "▾" : "▸"} Steps ({notes.length})
          </button>
          {steps && (
            <ol className="steps">
              {notes.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}
        </>
      )}
    </>
  );
}

export default function Chat(p: Props) {
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const box = input.current;
    if (!box) return;
    const resize = () => {
      box.style.height = "auto";
      // hidden panel measures 0: keep the CSS height until it's shown
      if (!box.scrollHeight) return;
      box.style.height = `${box.scrollHeight + box.offsetHeight - box.clientHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [p.draft]);

  useEffect(() => {
    if (p.mark) input.current?.focus();
  }, [p.mark]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [p.msgs, p.artifact]);

  const empty = !p.msgs.some((m) => m.path === p.path && m.kind !== "switch");

  return (
    <aside className="chat">
      {p.head}
      <div className="log" ref={log}>
        {p.msgs.map((m, i) => {
          if (m.kind === "switch")
            return <div key={i} className="divider"><span>{shortName(m.path)}</span></div>;
          if (m.kind === "user")
            return (
              <div key={i} className="msg user">
                {m.mark && <span className="marked" title="Asked about a highlighted spot" />}
                {m.text}
              </div>
            );
          if (m.kind === "pending")
            return <div key={i} className="msg sl pending"><Thinking steps={m.steps} live /></div>;
          if (m.kind === "error") return <div key={i} className="msg sl error">{m.text}</div>;
          const on = i === p.active;
          const marks = m.answer.evidence.some((e) => e.ifc_guid || e.bbox.length === 4);
          return (
            <div
              key={i}
              className={`msg sl ${on ? "on" : ""} ${marks && !on ? "clickable" : ""}`}
              onClick={() => !on && marks && p.onActivate(i)}
              title={marks && !on ? "Show evidence" : undefined}
            >
              {m.steps.length > 0 && <Thinking steps={m.steps} live={false} time={m.answer.time_s} />}
              <AnswerMsg a={m.answer} question={m.question} steps={m.steps} on={on} busy={p.busy} onAsk={p.onAsk} hover={p.hover} focus={p.focus} onHover={p.onHover} onFocus={p.onFocus} onActivate={() => p.onActivate(i)} />
            </div>
          );
        })}
        {p.artifact}
        {empty && <p className="hello">Ask anything about this drawing.</p>}
      </div>

      <div className="composer">
        {p.chips.length > 0 && (
          <div className="chips">
            {p.chips.map((q) => (
              <button key={q} className="chip" disabled={p.busy} onClick={() => p.onAsk(q)} title={q}>
                {q}
              </button>
            ))}
          </div>
        )}
        {p.mark && (
          <span className="markchip">
            Highlighted spot
            <button type="button" onClick={p.onClearMark} aria-label="Remove highlight">×</button>
          </span>
        )}
        <form
          className="ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (p.draft.trim() && !p.busy) p.onAsk(p.draft.trim());
          }}
        >
          <textarea
            ref={input}
            rows={1}
            aria-label="Question"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            value={p.draft}
            onChange={(e) => p.setDraft(e.target.value)}
            placeholder={p.mark ? "Ask about the highlighted spot" : "Ask a question"}
          />
          <button className="send" disabled={p.busy || !p.draft.trim()} aria-label="Ask">
            Ask
          </button>
        </form>
        <div className="composer-foot">
          <VlmPicker />
        </div>
      </div>
    </aside>
  );
}
