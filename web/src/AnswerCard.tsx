import { useMemo, useState } from "react";
import { BASELINE_EUR, METHOD_COLOR, fmtEur, fmtValue } from "./format";
import type { Answer } from "./types";

type Props = {
  answer: Answer | null;
  status: string;
  hover: number | null;
  onHover: (i: number | null) => void;
  onFocus: (i: number | null) => void;
};

const METHOD_WHAT: Record<string, string> = {
  ifc: "read from the BIM model, no AI",
  vector: "read from the CAD geometry, no AI",
  detector: "symbol detector, runs on a laptop CPU",
  vlm: "vision model, last resort",
  none: "no method could answer",
};

export default function AnswerCard({ answer, status, hover, onHover, onFocus }: Props) {
  const [json, setJson] = useState(false);

  // Group evidence by label: "28 × window" reads faster than 28 rows.
  const groups = useMemo(() => {
    const g = new Map<string, number[]>();
    answer?.evidence.forEach((e, i) => {
      const k = e.label || e.kind;
      g.set(k, [...(g.get(k) ?? []), i]);
    });
    return [...g.entries()];
  }, [answer]);

  if (!answer) {
    return (
      <div className="panel answer empty-card">
        <div className="panel-head">
          <span className="tb-label">Answer</span>
        </div>
        {status === "asking" ? (
          <p className="hand big">Reading the drawing…</p>
        ) : (
          <ol className="howto">
            <li><b>Pick</b> a drawing on the left.</li>
            <li><b>Ask</b> anything, or tap one of Stoa's questions.</li>
            <li><b>Check</b> the red marks on the plan: every answer shows where it comes from.</li>
          </ol>
        )}
      </div>
    );
  }

  const c = answer.check;
  const color = METHOD_COLOR[answer.method] ?? METHOD_COLOR.none;
  // The router appends its own timing line; the footer shows time instead.
  const notes = answer.trace.filter((s) => !/ path, [\d.]+s$/.test(s));
  const cheaper = answer.cost_eur > 0 ? Math.round(BASELINE_EUR / answer.cost_eur) : null;

  return (
    <div className="panel answer">
      <div className="panel-head">
        <span className="tb-label">Answer</span>
        <span className="spacer" />
        <span className="method" style={{ borderColor: color, color }}>{answer.method}</span>
      </div>

      <div className="value-row">
        <div>
          <div className="value">{fmtValue(answer.value, answer.unit)}</div>
          <div className="dim small">{METHOD_WHAT[answer.method] ?? answer.method}</div>
        </div>
        {c && c.match !== null && (
          <div className={`stamp ${c.match ? "ok" : "ko"}`}>
            {c.match ? "CHECKED ✓" : "MISMATCH ✗"}
            <small>Stoa: {fmtValue(c.expected, c.unit)}</small>
          </div>
        )}
      </div>

      {notes.length > 0 && (
        <ol className="notes">
          {notes.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}

      {groups.length > 0 && (
        <div className="evidence">
          <div className="tb-label">Evidence on the plan · {answer.evidence.length}</div>
          {groups.every(([, idx]) => idx.length === 1) ? (
            <ul className="rows">
              {groups.map(([label, [i]]) => (
                <li
                  key={i}
                  className={hover === i ? "hot" : ""}
                  onMouseEnter={() => onHover(i)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => onFocus(i)}
                >
                  <span className="hand">{i + 1}</span>
                  <span className="ellipsis">{label}</span>
                </li>
              ))}
            </ul>
          ) : groups.map(([label, idx]) => (
            <div key={label} className="group">
              <div className="group-label">
                <span className="hand">{idx.length} ×</span> {label}
              </div>
              <div className="nums">
                {idx.map((i) => (
                  <button
                    key={i}
                    className={hover === i ? "hot" : ""}
                    onMouseEnter={() => onHover(i)}
                    onMouseLeave={() => onHover(null)}
                    onClick={() => onFocus(i)}
                    title={answer.evidence[i].ifc_guid ?? `zoom to #${i + 1}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <table className="tb-footer">
        <tbody>
          <tr>
            <th>Path</th>
            <th>Cost</th>
            <th>Conf</th>
            <th>Time</th>
          </tr>
          <tr>
            <td style={{ color }}>{answer.method}</td>
            <td>{fmtEur(answer.cost_eur)}</td>
            <td>{answer.confidence.toFixed(2)}</td>
            <td>{answer.time_s.toFixed(2)} s</td>
          </tr>
        </tbody>
      </table>
      <div className="versus mono">
        Whole-sheet vision model: ~{fmtEur(BASELINE_EUR)} ·{" "}
        {cheaper ? `${cheaper}× cheaper here` : "no model call here"}
      </div>

      <button className="btn ghost small" onClick={() => setJson(!json)}>
        {json ? "hide" : "show"} API response
      </button>
      {json && <pre className="code">{JSON.stringify(answer, null, 2)}</pre>}
    </div>
  );
}
