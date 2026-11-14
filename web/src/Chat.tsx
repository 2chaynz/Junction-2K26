import { type ReactNode, useEffect, useRef, useState } from "react";
import { METHOD_NAME, fmtAnswer, fmtEur, fmtTime, fmtValue, shortName } from "./format";
import type { Answer, Mark, Msg, Step, Table } from "./types";

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
  const [open, setOpen] = useState(false);
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
  onHover: (i: number | null) => void; onFocus: (i: number | null) => void;
}) {
  const { a } = props;
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
        <p>Couldn't read this from the drawing.</p>
        <div className="meta">
          {a.tried?.length ? `Tried: ${a.tried.map((t) => METHOD_NAME[t] ?? t).join(", ")} · ` : ""}
          <span className="mono">{fmtTime(a.time_s)}</span>
        </div>
      </>
    );

  if (a.method === "general")
    return (
      <>
        <div className="tag">general · not from the drawing</div>
        <p>{String(a.value)}</p>
        <div className="meta">{meta}</div>
      </>
    );

  const c = a.check;
  return (
    <>
      <div className="value-line">
        <span className="value">{fmtAnswer(a)}</span>
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
      {props.steps.length === 0 && notes.length > 0 && (
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
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (p.mark) input.current?.focus();
  }, [p.mark]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [p.msgs]);

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
          const marks = m.answer.evidence.some((e) => e.bbox.length === 4);
          return (
            <div
              key={i}
              className={`msg sl ${on ? "on" : ""} ${marks && !on ? "clickable" : ""}`}
              onClick={() => !on && marks && p.onActivate(i)}
              title={marks && !on ? "Show on the plan" : undefined}
            >
              {m.steps.length > 0 && <Thinking steps={m.steps} live={false} time={m.answer.time_s} />}
              <AnswerMsg a={m.answer} question={m.question} steps={m.steps} on={on} busy={p.busy} onAsk={p.onAsk} hover={p.hover} focus={p.focus} onHover={p.onHover} onFocus={p.onFocus} />
            </div>
          );
        })}
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
          <input
            ref={input}
            value={p.draft}
            onChange={(e) => p.setDraft(e.target.value)}
            placeholder={p.mark ? "What is this? Area of this room? How many doors here?" : "Ask about this drawing, any language"}
          />
          <button className="send" disabled={p.busy || !p.draft.trim()} aria-label="Ask">
            Ask
          </button>
        </form>
      </div>
    </aside>
  );
}
