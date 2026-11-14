import { useEffect, useMemo, useState } from "react";
import { ask, getDrawings, surprise } from "./api";
import type { Answer, Drawing } from "./types";
import Picker from "./Picker";
import Viewer from "./Viewer";
import AnswerCard from "./AnswerCard";
import { SOURCE_LABEL, shortName } from "./format";

type Status = "idle" | "asking" | "answered" | "unknown" | "error";

export default function AskTab() {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [path, setPath] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    getDrawings()
      .then((d) => {
        setDrawings(d);
        // ?path=…&q=… opens a drawing and asks right away (demo links, video takes).
        const u = new URLSearchParams(location.search);
        const p = u.get("path"), q = u.get("q");
        if (p && d.some((x) => x.path === p)) {
          setPath(p);
          if (q) run(p, q);
          return;
        }
        const first = d.find((x) => x.source === "swiss_dwellings") ?? d[0];
        if (first) setPath(first.path);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const drawing = useMemo(() => drawings.find((d) => d.path === path), [drawings, path]);

  function select(p: string) {
    setPath(p);
    setAnswer(null);
    setStatus("idle");
    setQuestion("");
    setShowAll(false);
  }

  async function run(p: string, q: string) {
    if (!q.trim()) return;
    setQuestion(q);
    setStatus("asking");
    setAnswer(null);
    setHover(null);
    setFocus(null);
    try {
      const a = await ask(p, q);
      setAnswer(a);
      setStatus(a.value === null || a.value === undefined ? "unknown" : "answered");
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }

  async function onSurprise() {
    const s = await surprise();
    select(s.path);
    run(s.path, s.question);
  }

  const chips = drawing ? (showAll ? drawing.questions : drawing.questions.slice(0, 5)) : [];
  const view = answer?.view ?? drawing?.view ?? "";

  return (
    <div className="ask">
      <Picker drawings={drawings} selected={path} onSelect={select} />

      <section className="panel sheet">
        <div className="panel-head">
          <span className="tb-label">File</span>
          <span className="mono ellipsis">{shortName(path)}</span>
          <span className="spacer" />
          <span className="tb-label">Source</span>
          <span className="mono">{drawing ? SOURCE_LABEL[drawing.source] ?? drawing.source : ""}</span>
          <span className={`status ${status}`}>{STATUS_LABEL[status]}</span>
        </div>
        {view ? (
          <Viewer view={view} answer={answer} hover={hover} focus={focus} onHover={setHover} />
        ) : (
          <div className="empty">{error || "Loading drawings…"}</div>
        )}
      </section>

      <aside className="side">
        <div className="panel">
          <div className="panel-head">
            <span className="tb-label">Question</span>
            <span className="spacer" />
            <button className="btn ghost" onClick={onSurprise}>Surprise me</button>
          </div>
          <form
            className="qform"
            onSubmit={(e) => {
              e.preventDefault();
              run(path, question);
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask this drawing anything, in any language"
            />
            <button className="btn" disabled={status === "asking" || !path}>Ask</button>
          </form>
          {drawing && drawing.questions.length > 0 && (
            <div className="chips">
              <div className="tb-label">Stoa's questions for this drawing</div>
              {chips.map((q, i) => (
                <button key={i} className="chip" onClick={() => run(path, q.question)} title={q.question}>
                  {q.question}
                </button>
              ))}
              {drawing.questions.length > 5 && (
                <button className="chip more" onClick={() => setShowAll(!showAll)}>
                  {showAll ? "show fewer" : `+ ${drawing.questions.length - 5} more`}
                </button>
              )}
            </div>
          )}
        </div>
        <AnswerCard
          answer={answer}
          status={status}
          hover={hover}
          onHover={setHover}
          onFocus={setFocus}
        />
      </aside>
    </div>
  );
}

const STATUS_LABEL: Record<Status, string> = {
  idle: "Ready",
  asking: "Reading…",
  answered: "Answered",
  unknown: "No answer",
  error: "Error",
};
