import { useEffect, useMemo, useState } from "react";
import { ask, getDrawings, surprise } from "./api";
import Chat from "./Chat";
import { DEMO, pickChips } from "./format";
import Picker from "./Picker";
import type { Drawing, Msg } from "./types";
import Viewer from "./Viewer";

export default function App() {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [path, setPath] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

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
        const first = d.find((x) => x.path === DEMO[0]) ?? d.find((x) => x.source === "swiss_dwellings") ?? d[0];
        if (first) setPath(first.path);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const drawing = useMemo(() => drawings.find((d) => d.path === path), [drawings, path]);
  const chips = useMemo(() => pickChips(drawing), [drawing]);
  const busy = msgs.some((m) => m.kind === "pending");

  function activate(i: number | null) {
    setActive(i);
    setHover(null);
    setFocus(null);
  }

  function select(p: string) {
    if (p === path) return;
    setPath(p);
    setDraft("");
    activate(null);
    setMsgs((m) => (m.length ? [...m, { kind: "switch", path: p }] : m));
  }

  async function run(p: string, q: string) {
    setDraft("");
    activate(null);
    setMsgs((m) => [...m, { kind: "user", path: p, text: q }, { kind: "pending", path: p }]);
    let next: Msg;
    try {
      next = { kind: "answer", path: p, question: q, answer: await ask(p, q) };
    } catch (e) {
      next = { kind: "error", path: p, text: `Something broke: ${String(e)}` };
    }
    setMsgs((m) => {
      const i = m.findIndex((x) => x.kind === "pending");
      const out = [...m];
      out[i] = next;
      if (next.kind === "answer") setActive(i);
      return out;
    });
  }

  async function onRandom() {
    try {
      const s = await surprise();
      select(s.path);
      setDraft(s.question);
    } catch (e) {
      setError(String(e));
    }
  }

  const act = active !== null ? msgs[active] : null;
  const answer = act?.kind === "answer" && act.path === path ? act.answer : null;
  const view = answer?.view ?? drawing?.view ?? "";

  return (
    <div className="app">
      <header className="top">
        <span className="brand">SiteLens</span>
        <Picker drawings={drawings} selected={path} onSelect={select} />
        <button className="btn" onClick={onRandom}>Random</button>
        <span className="spacer" />
      </header>
      <main className="stage">
        {view.endsWith(".ifc") ? (
          <div className="empty">No 2D plan for this model. Answers cite model elements in the chat.</div>
        ) : view ? (
          <Viewer
            view={view}
            answer={answer}
            hover={hover}
            focus={focus}
            onHover={setHover}
            onFocus={setFocus}
            busy={busy}
          />
        ) : (
          <div className="empty">{error || "Loading drawings…"}</div>
        )}
      </main>
      <Chat
        msgs={msgs}
        path={path}
        chips={chips}
        active={active}
        hover={hover}
        focus={focus}
        draft={draft}
        busy={busy}
        setDraft={setDraft}
        onAsk={(q) => run(path, q)}
        onActivate={(i) => {
          const m = msgs[i];
          if (m.path !== path) setPath(m.path);
          activate(i);
        }}
        onHover={setHover}
        onFocus={setFocus}
      />
    </div>
  );
}
