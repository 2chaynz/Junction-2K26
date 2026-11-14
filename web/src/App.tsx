import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { ask, askStream, getDrawings, surprise } from "./api";
import Benchmark from "./Benchmark";
import Changes, { CHANGE_Q, PAIRS, onNewSheet } from "./Changes";
import Chat from "./Chat";
import Explorer from "./Explorer";
import { DEMO, SOURCE_LABEL, TYPE, fmtSize, pickChips, sheetCode, shortName } from "./format";
import HowItWorks from "./HowItWorks";
import Measure from "./Measure";
import type { Answer, Drawing, Msg, Shape, Step, Tool } from "./types";
import Viewer from "./Viewer";

// three.js + web-ifc are ~4 MB: only fetch them when a model is opened in 3D.
const Model3D = lazy(() => import("./Model3D"));

const TABS = ["Ask", "How it works", "Benchmark"] as const;
type Tab = (typeof TABS)[number];

function SheetInfo({ d, all, view, size }: { d: Drawing; all: string[]; view: string; size: [number, number] | null }) {
  const folder = d.path.split("/").slice(1, -1).join("/");
  const plan = d.view !== d.path ? shortName(d.view) : null;
  return (
    <footer className="sheetinfo">
      <div className="cell">
        <span className="k">Sheet</span>
        <span className="v mono">{sheetCode(all, d.path, d.source)}</span>
      </div>
      <div className="cell grow">
        <span className="k">File</span>
        <span className="v ellipsis" title={d.path}>{d.path.split("/").pop()}</span>
      </div>
      <div className="cell">
        <span className="k">Folder</span>
        <span className="v ellipsis mono" title={folder}>{folder}</span>
      </div>
      <div className="cell">
        <span className="k">Source</span>
        <span className="v">{SOURCE_LABEL[d.source] ?? d.source}</span>
      </div>
      {plan && (
        <div className="cell">
          <span className="k">Shown</span>
          <span className="v ellipsis" title={d.view}>plan {plan.replace(/^.*_plan-/, "")}</span>
        </div>
      )}
      <div className="cell">
        <span className="k">Size</span>
        <span className="v mono">{size ? fmtSize(view, size[0], size[1]) : TYPE[d.source]}</span>
      </div>
      <div className="cell">
        <span className="k">Stoa Qs</span>
        <span className="v mono">{d.questions.length}</span>
      </div>
    </footer>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("Ask");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [path, setPath] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [size, setSize] = useState<[number, number] | null>(null);
  const [mode, setMode] = useState<"plan" | "3d">("plan");
  const search = useRef<HTMLInputElement>(null);
  const [chOn, setChOn] = useState(false);
  const [chData, setChData] = useState<Record<string, { answer?: Answer; error?: string }>>({});
  const [chHover, setChHover] = useState<number | null>(null);
  const [chFocus, setChFocus] = useState<number | null>(null);
  const [msOn, setMsOn] = useState(false);
  const [tool, setTool] = useState<Tool | null>(null);
  const [drawn, setDrawn] = useState<number[][] | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [mpu, setMpu] = useState<number | null>(null);
  const [msHot, setMsHot] = useState<string | null>(null);
  const [zoomTo, setZoomTo] = useState<number[] | null>(null);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && t.tagName !== "INPUT" && t.tagName !== "TEXTAREA") {
        e.preventDefault();
        setTab("Ask");
        setTimeout(() => search.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const drawing = useMemo(() => drawings.find((d) => d.path === path), [drawings, path]);
  const allPaths = useMemo(() => drawings.map((d) => d.path), [drawings]);
  const chips = useMemo(() => pickChips(drawing), [drawing]);
  const busy = msgs.some((m) => m.kind === "pending");
  const hasPair = PAIRS.has(path);
  const showCh = chOn && hasPair;

  useEffect(() => {
    if (!showCh || chData[path]) return;
    setChData((d) => ({ ...d, [path]: {} }));
    ask(path, CHANGE_Q)
      .then((a) => setChData((d) => ({ ...d, [path]: { answer: a } })))
      .catch((e) => setChData((d) => ({ ...d, [path]: { error: String(e) } })));
  }, [showCh, path]); // eslint-disable-line react-hooks/exhaustive-deps

  function activate(i: number | null) {
    if (i !== null) (setChOn(false), setMsOn(false)); // a chat answer takes over the drawing
    setActive(i);
    setHover(null);
    setFocus(null);
  }

  function select(p: string) {
    setTab("Ask");
    if (p === path) return;
    setPath(p);
    setSize(null);
    setDraft("");
    setChHover(null);
    setChFocus(null);
    activate(null);
    setMsgs((m) => (m.length ? [...m, { kind: "switch", path: p }] : m));
  }

  async function run(p: string, q: string) {
    setDraft("");
    activate(null);
    setMsgs((m) => [...m, { kind: "user", path: p, text: q }, { kind: "pending", path: p, steps: [] }]);
    const steps: Step[] = [];
    let next: Msg;
    try {
      const answer = await askStream(p, q, (s) => {
        steps.push(s);
        const snap = [...steps];
        setMsgs((m) => m.map((x) => (x.kind === "pending" ? { ...x, steps: snap } : x)));
      });
      next = { kind: "answer", path: p, question: q, answer, steps };
    } catch (e) {
      next = { kind: "error", path: p, text: `Something broke: ${String(e)}` };
    }
    setMsgs((m) => {
      const i = m.findIndex((x) => x.kind === "pending");
      const out = [...m];
      out[i] = next;
      if (next.kind === "answer") {
        setActive(i);
        if (next.answer.evidence.some((e) => e.ifc_guid)) setMode("3d");
      }
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
  const view = showCh || msOn ? drawing?.view ?? "" : answer?.view ?? drawing?.view ?? "";
  const isIfc = path.endsWith(".ifc");
  const hasPlan = isIfc && !view.endsWith(".ifc");
  const show3d = isIfc && ((mode === "3d" && !msOn) || !hasPlan);
  const ch = chData[path];
  const chAnswer = useMemo(() => (ch?.answer ? onNewSheet(ch.answer, view) : null), [ch, view]);

  return (
    <div className={`app ${tab === "Ask" ? "" : "paged"}`}>
      <header className="top">
        <span className="brand">SiteLens</span>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        {tab === "Ask" && (
          <button
            className={`btn ${msOn ? "on" : ""}`}
            title="Area and length takeoffs with the scale and where it came from"
            onClick={() => {
              setMsOn((v) => !v);
              setChOn(false);
              setTool(null);
              setShapes([]);
            }}
          >
            {msOn ? "Close measure" : "Measure"}
          </button>
        )}
        {tab === "Ask" && <button className="btn" onClick={onRandom}>Random question</button>}
      </header>

      {tab === "How it works" && <main className="pagewrap"><HowItWorks /></main>}
      {tab === "Benchmark" && <main className="pagewrap"><Benchmark /></main>}

      <div className="askview" hidden={tab !== "Ask"}>
        <Explorer ref={search} drawings={drawings} selected={path} onSelect={select} />
        <main className="stage">
          <div className="canvas">
            {hasPlan && (
              <div className="modes">
                <button className={show3d ? "" : "on"} onClick={() => setMode("plan")}>Plan</button>
                <button className={show3d ? "on" : ""} onClick={() => setMode("3d")}>3D</button>
              </div>
            )}
            {show3d ? (
              <Suspense fallback={<div className="empty">Loading 3D viewer…</div>}>
              <Model3D
                path={path}
                answer={answer}
                hover={hover}
                focus={focus}
                onHover={setHover}
                onFocus={setFocus}
                busy={busy}
              />
              </Suspense>
            ) : view ? (
              <Viewer
                view={view}
                answer={msOn ? null : showCh ? chAnswer : answer}
                hover={showCh ? chHover : hover}
                focus={showCh ? chFocus : focus}
                onHover={showCh ? setChHover : setHover}
                onFocus={showCh ? setChFocus : setFocus}
                onSize={(w, h) => setSize([w, h])}
                busy={busy || (showCh && !ch?.answer && !ch?.error)}
                changes={showCh}
                shapes={msOn ? shapes : []}
                tool={msOn ? tool : null}
                mpu={mpu}
                hotShape={msHot}
                onShapeHover={setMsHot}
                onShapeClick={setMsHot}
                onDraw={setDrawn}
                zoomTo={msOn ? zoomTo : null}
              />
            ) : (
              <div className="empty">{error || "Loading drawings…"}</div>
            )}
            {hasPair && !msOn && !view.endsWith(".ifc") && (
              <button className={`ch-toggle ${showCh ? "on" : ""}`} onClick={() => setChOn((v) => !v)}>
                {showCh ? "Hide changes" : "What changed"}
              </button>
            )}
            {msOn && view && !view.endsWith(".ifc") && (
              <Measure
                path={view}
                tool={tool}
                setTool={setTool}
                drawn={drawn}
                clearDrawn={() => setDrawn(null)}
                hot={msHot}
                setHot={setMsHot}
                onShapes={(s, m) => (setShapes(s), setMpu(m))}
                onZoom={(b) => setZoomTo([...b])}
                onOpen={(f) => {
                  const d = drawings.find((x) => x.path === f || x.view === f);
                  if (d) select(d.path);
                  return !!d;
                }}
              />
            )}
            {showCh && !msOn && (
              <Changes
                path={path}
                answer={chAnswer}
                error={ch?.error ?? ""}
                hover={chHover}
                focus={chFocus}
                onHover={setChHover}
                onFocus={setChFocus}
              />
            )}
          </div>
          {drawing && <SheetInfo d={drawing} all={allPaths} view={view} size={size} />}
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
            if (m.path !== path) (setPath(m.path), setSize(null));
            activate(i);
          }}
          onHover={setHover}
          onFocus={setFocus}
        />
      </div>
    </div>
  );
}
