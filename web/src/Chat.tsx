import { useEffect, useRef, useState } from "react";
import { METHOD_NAME, fmtAnswer, fmtEur, fmtTime, fmtValue, shortName } from "./format";
import type { Answer, Msg } from "./types";

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
  onActivate: (msg: number) => void;
  onHover: (i: number | null) => void;
  onFocus: (i: number | null) => void;
};

const MAX_CITES = 9;

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

function AnswerMsg(props: {
  a: Answer; on: boolean; hover: number | null; focus: number | null;
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
      {notes.length > 0 && (
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
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [p.msgs.length]);

  const empty = !p.msgs.some((m) => m.path === p.path && m.kind !== "switch");

  return (
    <aside className="chat">
      <div className="log" ref={log}>
        {p.msgs.map((m, i) => {
          if (m.kind === "switch")
            return <div key={i} className="divider"><span>{shortName(m.path)}</span></div>;
          if (m.kind === "user") return <div key={i} className="msg user">{m.text}</div>;
          if (m.kind === "pending") return <div key={i} className="msg sl pending">Reading the drawing…</div>;
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
              <AnswerMsg a={m.answer} on={on} hover={p.hover} focus={p.focus} onHover={p.onHover} onFocus={p.onFocus} />
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
            placeholder="Ask about this drawing, any language"
          />
          <button className="send" disabled={p.busy || !p.draft.trim()} aria-label="Ask">
            Ask
          </button>
        </form>
      </div>
    </aside>
  );
}
