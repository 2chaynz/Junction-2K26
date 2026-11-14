import { useState } from "react";
import { METHOD_COLOR, fmtEur, fmtValue } from "./format";
import type { Answer } from "./types";

type Props = {
  answer: Answer | null;
  status: string;
  hover: number | null;
  onHover: (i: number | null) => void;
  onFocus: (i: number | null) => void;
};

export default function AnswerCard({ answer, status, hover, onHover, onFocus }: Props) {
  const [json, setJson] = useState(false);

  if (!answer) {
    return (
      <div className="panel answer empty-card">
        <div className="panel-head">
          <span className="tb-label">Answer</span>
        </div>
        <p className="dim">{status === "asking" ? "Reading the drawing…" : "Pick a drawing, then ask or tap one of Stoa's questions."}</p>
      </div>
    );
  }

  const c = answer.check;
  const color = METHOD_COLOR[answer.method] ?? METHOD_COLOR.none;
  // The router appends its own timing line; the UI shows time in the footer instead.
  const notes = answer.trace.filter((s) => !/ path, [\d.]+s$/.test(s));

  return (
    <div className="panel answer">
      <div className="panel-head">
        <span className="tb-label">Answer</span>
        <span className="spacer" />
        <span className="method" style={{ borderColor: color, color }}>{answer.method}</span>
      </div>

      <div className="value-row">
        <div className="value">{fmtValue(answer.value, answer.unit)}</div>
        {c && (
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

      {answer.evidence.length > 0 && (
        <div className="evidence">
          <div className="tb-label">Evidence · {answer.evidence.length}</div>
          <ul>
            {answer.evidence.map((e, i) => (
              <li
                key={i}
                className={hover === i ? "hot" : ""}
                onMouseEnter={() => onHover(i)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onFocus(i)}
              >
                <span className="num">{i + 1}</span>
                <span className="ellipsis">{e.label || e.kind}</span>
                {e.ifc_guid && <span className="mono dim">{e.ifc_guid.slice(0, 8)}</span>}
              </li>
            ))}
          </ul>
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

      <button className="btn ghost small" onClick={() => setJson(!json)}>
        {json ? "hide" : "show"} API response
      </button>
      {json && <pre className="code">{JSON.stringify(answer, null, 2)}</pre>}
    </div>
  );
}
