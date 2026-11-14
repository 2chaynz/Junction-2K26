/// <reference types="vite/client" />
import raw from "../../sitelens/diff_pairs.json?raw";
import type { Answer } from "./types";

// Read the diff path's own pair list, so unpaired sheets never hit the router (it would fall through to paid paths).
const LIST: { old: string; new: string; note: string }[] = JSON.parse(raw);
export const PAIRS = new Map(LIST.map((p) => [p.new, p]));
export const CHANGE_Q = "What changed since the previous issue?";

export type Kind = "added" | "removed" | "changed" | "quantity" | "drawing";
export const KIND_LABEL: Record<Kind, string> = {
  quantity: "Quantities",
  changed: "Changed",
  added: "Added",
  removed: "Removed",
  drawing: "Drawing changes",
};

export function changeKind(label: string): Kind {
  const p = label.split(":")[0];
  if (p === "quantity") return /removed/.test(label) ? "removed" : /added/.test(label) ? "added" : "quantity";
  if (p === "added" || p === "removed" || p === "changed") return p;
  return "drawing";
}

const strip = (label: string) => label.replace(/^[a-z ]+:\s*/, "");
const issue = (path: string) => path.split("/").slice(-2, -1)[0] ?? path;

// Old-sheet evidence moved onto the new sheet with the diff's own alignment (new = s·old + shift),
// so removed items show as ghosts in place. Indices stay the same as in the answer.
export function onNewSheet(a: Answer, view: string): Answer {
  const m = a.trace.map((t) => t.match(/aligned: scale ([\d.]+), shift \((-?[\d.]+), (-?[\d.]+)\)/)).find(Boolean);
  const [s, dx, dy] = m ? [+m[1], +m[2], +m[3]] : [1, 0, 0];
  return {
    ...a,
    evidence: a.evidence.map((e) =>
      e.file === view || e.bbox.length !== 4
        ? e
        : { ...e, file: view, bbox: [e.bbox[0] * s + dx, e.bbox[1] * s + dy, e.bbox[2] * s + dx, e.bbox[3] * s + dy] },
    ),
  };
}

type Props = {
  path: string;
  answer: Answer | null;
  error: string;
  hover: number | null;
  focus: number | null;
  onHover: (i: number | null) => void;
  onFocus: (i: number | null) => void;
};

export default function Changes({ path, answer, error, hover, focus, onHover, onFocus }: Props) {
  const pair = PAIRS.get(path);
  const quantities = answer?.trace.filter((t) => t.startsWith("quantity:")).map(strip) ?? [];
  const groups = (Object.keys(KIND_LABEL) as Kind[]).map((k) => ({
    k,
    rows: (answer?.evidence ?? []).map((e, i) => ({ e, i })).filter(({ e }) => changeKind(e.label) === k),
  }));
  return (
    <aside className="changes" onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div className="ch-head">
        <div className="ch-title">What changed</div>
        {pair && (
          <div className="ch-vs dim">
            vs <span className="mono">{issue(pair.old)}</span>
          </div>
        )}
        {pair?.note && <div className="ch-note">{pair.note}</div>}
      </div>
      {error && <div className="ch-empty">Couldn't load changes: {error}</div>}
      {!answer && !error && <div className="ch-empty dim">Comparing with the earlier issue…</div>}
      {answer && answer.value === null && <div className="ch-empty dim">No comparison available for this sheet.</div>}
      {answer && answer.value !== null && (
        <div className="ch-body">
          <div className="ch-sum">
            <span className="mono">{answer.evidence.length}</span> marked changes ·{" "}
            <span className="mono">{answer.time_s?.toFixed(1)}s</span> · €0
          </div>
          {quantities.length > 0 && (
            <ul className="ch-qty">
              {quantities.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          )}
          {groups
            .filter((g) => g.rows.length)
            .map((g) => (
              <section key={g.k}>
                <h4>
                  <span className={`dot k-${g.k}`} /> {KIND_LABEL[g.k]} <span className="dim mono">{g.rows.length}</span>
                </h4>
                {g.rows.map(({ e, i }) => (
                  <button
                    key={i}
                    className={`ch-row ${hover === i ? "hot" : ""} ${focus === i ? "on" : ""}`}
                    title={e.label}
                    onMouseEnter={() => onHover(i)}
                    onMouseLeave={() => onHover(null)}
                    onClick={() => onFocus(focus === i ? null : i)}
                  >
                    <span className="mono dim">{i + 1}</span>
                    <span className="ellipsis">{strip(e.label)}</span>
                  </button>
                ))}
              </section>
            ))}
        </div>
      )}
    </aside>
  );
}
