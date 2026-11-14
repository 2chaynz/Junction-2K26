import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { ask, askStream, getDrawings, originalUrl, surprise } from "./api";
import Benchmark from "./Benchmark";
import Changes, { CHANGE_Q, PAIRS, onNewSheet } from "./Changes";
import Chat from "./Chat";
import Explorer from "./Explorer";
import { Splitter, usePanels } from "./Splitter";
import { SOURCE_LABEL, TYPE, floorsOf, fmtSize, pickChips, sheetCode, shortName } from "./format";
import HowItWorks from "./HowItWorks";
import Measure from "./Measure";
import Projects from "./Projects";
import {
  type Overview, type Recent, type SessionSummary, buildProjects, deleteSession, getRecent, getSession, listSessions,
  newSessionId, projectKeyOf, saveSession, sessionsOverview, touchRecent,
} from "./workspace";
import Takeoff, { type Row } from "./Takeoff";
import Stack from "./Stack";
import type { Answer, Drawing, Mark, Msg, Shape, Step, Tool } from "./types";
import Viewer from "./Viewer";
import VlmBadge from "./VlmBadge";

// three.js + web-ifc are ~4 MB: only fetch them when a model is opened in 3D.
const Model3D = lazy(() => import("./Model3D"));

const TABS = ["Projects", "Ask", "How it works", "Benchmark"] as const;
type Tab = (typeof TABS)[number] | "Takeoff";
type SheetDrawing = Drawing & { model?: string | null };

function SheetInfo({ d, all, view, size, onModel }: {
  d: SheetDrawing;
  all: string[];
  view: string;
  size: [number, number] | null;
  onModel: () => void;
}) {
  const openFile = () => window.open(originalUrl(d.path), "_blank", "noopener");
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
        <button
          type="button"
          className="v ellipsis sheetlink"
          title={`Double-click to open ${d.path}`}
          onDoubleClick={openFile}
          onClick={(event) => { if (event.detail === 0) openFile(); }}
        >
          {d.path.split("/").pop()}
        </button>
      </div>
      <div className="cell">
        <span className="k">Folder</span>
        <span className="v ellipsis mono" title={folder}>{folder}</span>
      </div>
      {d.model || d.path.endsWith(".ifc") ? (
        <button type="button" className="cell sheetlink" onClick={onModel} title="Open source BIM model">
          <span className="k">Source</span>
          <span className="v">{SOURCE_LABEL[d.source] ?? d.source}</span>
        </button>
      ) : (
        <div className="cell">
          <span className="k">Source</span>
          <span className="v">{SOURCE_LABEL[d.source] ?? d.source}</span>
        </div>
      )}
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
  const [drawings, setDrawings] = useState<SheetDrawing[]>([]);
  const [path, setPath] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [pen, setPen] = useState(false);
  const [mark, setMark] = useState<Mark | null>(null);
  const [error, setError] = useState("");
  const [size, setSize] = useState<[number, number] | null>(null);
  const [mode, setMode] = useState<"plan" | "3d" | "stack">("plan");
  const search = useRef<HTMLInputElement>(null);
  const panels = usePanels();
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
  const [sid, setSid] = useState(newSessionId);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [overview, setOverview] = useState<Overview>({});
  const [recent, setRecent] = useState<Recent>(getRecent);
  const loaded = useRef<Msg[] | null>(null); // msgs as reopened from the server: unchanged → no re-save

  useEffect(() => {
    getDrawings()
      .then((d) => {
        setDrawings(d);
        // ?path=…&q=… opens a drawing and asks right away (demo links, video takes).
        const u = new URLSearchParams(location.search);
        const p = u.get("path"), q = u.get("q");
        if (p && d.some((x) => x.path === p)) {
          setPath(p);
    setMode("plan");
          if (q) run(p, q);
          return;
        }
        // Back to the project you were last in; first visit starts on the project list.
        const last = Object.entries(getRecent()).sort((a, b) => b[1].t - a[1].t).find(([, r]) => d.some((x) => x.path === r.path));
        if (last) setPath(last[1].path);
        else setTab("Projects");
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
  const projects = useMemo(() => buildProjects(drawings), [drawings]);
  const projKey = drawing ? projectKeyOf(drawing) : null;
  const project = useMemo(() => projects.find((p) => p.key === projKey) ?? null, [projects, projKey]);
  const sessProj = useRef<string | null>(null); // project the open session belongs to

  useEffect(() => {
    sessionsOverview().then(setOverview).catch(() => {});
  }, [tab === "Projects"]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSessions([]);
    if (projKey) listSessions(projKey).then(setSessions).catch(() => {});
  }, [projKey]);

  useEffect(() => {
    if (!projKey || !path) return;
    touchRecent(projKey, path);
    setRecent(getRecent());
  }, [projKey, path]);

  // Autosave: every finished question lands in the project's session list.
  useEffect(() => {
    if (busy || !projKey || msgs === loaded.current || !msgs.some((m) => m.kind === "user")) return;
    const key = sessProj.current ?? projKey;
    sessProj.current = key;
    saveSession(key, sid, msgs)
      .then((sum) => {
        if (key !== projKey) return;
        setSessions((l) => [sum, ...l.filter((x) => x.id !== sum.id)]);
        setOverview((o) => ({ ...o, [key]: { sessions: (o[key]?.sessions ?? 0) + (sessions.some((x) => x.id === sum.id) ? 0 : 1), updated: sum.updated } }));
      })
      .catch(() => {});
  }, [msgs, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPen(false);
      setMark(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
    setMark(null);
    setPen(false);
    setChHover(null);
    setChFocus(null);
    activate(null);
    const d = drawings.find((x) => x.path === p);
    if (d && projectKeyOf(d) !== projKey) {
      // Another project: its own conversation. The one we leave is already saved.
      setMsgs([]);
      setSid(newSessionId());
      sessProj.current = projectKeyOf(d);
      loaded.current = null;
      return;
    }
    setMsgs((m) => (m.length ? [...m, { kind: "switch", path: p }] : m));
  }

  function newSession() {
    setMsgs([]);
    setSid(newSessionId());
    sessProj.current = projKey;
    loaded.current = null;
    setDraft("");
    setMark(null);
    activate(null);
  }

  async function openSession(id: string) {
    if (!projKey || busy) return;
    try {
      const s = await getSession(projKey, id);
      const ms = s.msgs ?? [];
      loaded.current = ms;
      sessProj.current = projKey;
      setSid(id);
      setMsgs(ms);
      setTab("Ask");
      setDraft("");
      setMark(null);
      setPen(false);
      setChOn(false);
      setMsOn(false);
      // Reopen on the last answer: its sheet and its marks.
      let i = ms.length - 1;
      while (i >= 0 && ms[i].kind !== "answer") i--;
      const last = ms[ms.length - 1];
      const p = (i >= 0 ? ms[i].path : last?.path) ?? path;
      if (p && p !== path && drawings.some((x) => x.path === p)) (setPath(p), setSize(null));
      activate(i >= 0 ? i : null);
    } catch (e) {
      setError(String(e));
    }
  }

  async function removeSession(id: string) {
    if (!projKey) return;
    await deleteSession(projKey, id).catch(() => {});
    setSessions((l) => l.filter((x) => x.id !== id));
    setOverview((o) => (o[projKey] ? { ...o, [projKey]: { ...o[projKey], sessions: Math.max(0, o[projKey].sessions - 1) } } : o));
    if (id === sid) newSession();
  }

  function openProject(key: string, at?: string) {
    const p = projects.find((x) => x.key === key);
    if (!p) return;
    const target = [at, recent[key]?.path, p.cover?.path].find((x) => x && p.items.some((d) => d.path === x));
    if (target) select(target);
    setTab("Ask");
  }

  async function run(p: string, q: string) {
    const region = mark ?? undefined;
    setDraft("");
    setMark(null);
    setPen(false);
    activate(null);
    // The conversation can change while this runs (new session, other project): only fill our own bubble.
    const id = newSessionId();
    setMsgs((m) => [...m, { kind: "user", path: p, text: q, mark: region }, { kind: "pending", path: p, steps: [], id }]);
    const steps: Step[] = [];
    let next: Msg;
    try {
      const answer = await askStream(p, q, (s) => {
        steps.push(s);
        const snap = [...steps];
        setMsgs((m) => m.map((x) => (x.kind === "pending" && x.id === id ? { ...x, steps: snap } : x)));
      }, region);
      next = { kind: "answer", path: p, question: q, answer, steps, mark: region };
    } catch (e) {
      next = { kind: "error", path: p, text: `Something broke: ${String(e)}` };
    }
    setMsgs((m) => {
      const i = m.findIndex((x) => x.kind === "pending" && x.id === id);
      if (i < 0) return m;
      const out = [...m];
      out[i] = next;
      if (next.kind === "answer") {
        setActive(i);
        if (next.answer.evidence.some((e) => e.ifc_guid)) setMode("3d");
      }
      return out;
    });
  }

  // A takeoff row becomes a chat answer, so the drawing / 3D view marks every element in it.
  function showRow(r: Row) {
    const label = `${r.category}: ${r.type}${r.size ? ` · ${r.size}` : ""}`;
    const a: Answer = {
      value: r.count, unit: "count", method: "takeoff", confidence: 1, cost_eur: 0, evidence: r.evidence,
      trace: [`takeoff row: ${label}`, `${r.count} element(s)${r.levels.length ? ` on ${r.levels.join(", ")}` : ""}`],
      time_s: 0, view: drawing?.view ?? path,
    };
    setTab("Ask");
    setChOn(false);
    setHover(null);
    setFocus(null);
    if (r.evidence.some((e) => e.ifc_guid)) setMode("3d");
    setMsgs((m) => {
      setActive(m.length + 1);
      return [...m, { kind: "user", path, text: `Takeoff: ${label}` }, { kind: "answer", path, question: label, answer: a, steps: [] }];
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

  const sessionTitle =
    sessions.find((x) => x.id === sid)?.title ?? msgs.find((m): m is Extract<Msg, { kind: "user" }> => m.kind === "user")?.text ?? "New session";
  const act = active !== null ? msgs[active] : null;
  const shownMark = mark ?? (act?.kind === "answer" && act.path === path ? act.mark ?? null : null);
  const answer = act?.kind === "answer" && act.path === path ? act.answer : null;
  const view = showCh || msOn ? drawing?.view ?? "" : answer?.view ?? drawing?.view ?? "";
  const isIfc = path.endsWith(".ifc");
  const openModel = () => {
    setChOn(false);
    setMsOn(false);
    setMode("3d");
  };
  const modelPath = drawing?.model ?? (isIfc ? path : null);
  const hasPlan = !!modelPath && !!view && !view.endsWith(".ifc");
  const show3d = !!modelPath && ((mode === "3d" && !msOn) || (isIfc && !hasPlan));
  const floors = useMemo(() => floorsOf(drawings, path), [drawings, path]);
  const showStack = floors.length > 1 && mode === "stack" && !showCh && !msOn;
  const ch = chData[path];
  const chAnswer = useMemo(() => (ch?.answer ? onNewSheet(ch.answer, view) : null), [ch, view]);

  return (
    <div className={`app ${tab === "Ask" ? "" : "paged"}`}>
      <header className="top">
        <span className="brand">SiteLens</span>
        {project && (
          <button className="projchip" onClick={() => setTab("Projects")} title="Switch project">
            <span className="k">Project</span>
            <span className="ellipsis">{project.name}</span>
            <span className="caret">▾</span>
          </button>
        )}
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <VlmBadge />
        <details className="tools-menu" onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }} onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
        }}>
          <summary className={`btn ${msOn || tab === "Takeoff" ? "on" : ""}`}>Tools</summary>
          <div className="tools-options">
            <button type="button" disabled={!path} onClick={(event) => {
              const menu = event.currentTarget.closest("details");
              if (menu) {
                menu.open = false;
                menu.querySelector("summary")?.focus();
              }
              setTab("Ask");
              setMsOn(tab !== "Ask" || !msOn);
              setChOn(false);
              setTool(null);
              setShapes([]);
            }}>{tab === "Ask" && msOn ? "Close Measure" : "Measure"}</button>
            <button type="button" disabled={!path} onClick={(event) => {
              const menu = event.currentTarget.closest("details");
              if (menu) {
                menu.open = false;
                menu.querySelector("summary")?.focus();
              }
              setMsOn(false);
              setTab("Takeoff");
            }}>Takeoff</button>
          </div>
        </details>
        {tab === "Ask" && <button className="btn" onClick={onRandom}>Random question</button>}
      </header>

      {tab === "Takeoff" && (
        <main className="pagewrap">
          <Takeoff path={path} name={path.split("/").pop() ?? ""} onShow={showRow} />
        </main>
      )}
      {tab === "How it works" && <main className="pagewrap"><HowItWorks /></main>}
      {tab === "Benchmark" && <main className="pagewrap"><Benchmark /></main>}
      {tab === "Projects" && (
        <main className="pagewrap">
          <Projects projects={projects} overview={overview} recent={recent} current={projKey} onOpen={openProject} />
        </main>
      )}

      <div className="askview" hidden={tab !== "Ask"} {...panels.props}>
        <Explorer
          ref={search}
          drawings={drawings}
          projects={projects}
          project={project}
          selected={path}
          onSelect={select}
          onProjects={() => setTab("Projects")}
          sessions={sessions}
          session={sid}
          onSession={openSession}
          onNewSession={newSession}
          onDeleteSession={removeSession}
        />
        <main className="stage">
          <div className="canvas">
            {(hasPlan || floors.length > 1) && (
              <div className="modes">
                <button className={!show3d && !showStack ? "on" : ""} onClick={() => setMode("plan")}>Plan</button>
                {hasPlan && (
                  <button className={show3d ? "on" : ""} onClick={openModel}>3D</button>
                )}
                {floors.length > 1 && (
                  <button className={showStack ? "on" : ""} onClick={() => (setChOn(false), setMsOn(false), setMode("stack"))}>
                    Building · {floors.length}
                  </button>
                )}
              </div>
            )}
            {showStack ? (
              <Stack floors={floors} selected={path} onPick={(p) => (select(p), setMode("plan"))} />
            ) : show3d && modelPath ? (
              <Suspense fallback={<div className="empty">Loading 3D viewer…</div>}>
              <Model3D
                path={modelPath}
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
                pen={pen && !showCh && !(msOn && tool)}
                mark={showCh ? null : shownMark}
                onPen={showCh ? undefined : setPen}
                onMark={showCh ? undefined : (m) => (setMark(m), activate(null))}
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
            {hasPair && !msOn && !view.endsWith(".ifc") && !showStack && (
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
          {drawing && <SheetInfo d={drawing} all={allPaths} view={view} size={size} onModel={openModel} />}
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
          mark={mark}
          onClearMark={() => setMark(null)}
          onAsk={(q) => run(path, q)}
          onActivate={(i) => {
            const m = msgs[i];
            if (m.path !== path) (setPath(m.path), setSize(null));
            activate(i);
          }}
          onHover={setHover}
          onFocus={setFocus}
          head={
            <div className="chathead">
              <span className="k">Session</span>
              <span className="ellipsis" title={sessionTitle}>{sessionTitle}</span>
              <span className="spacer" />
              {sessions.some((x) => x.id === sid) && <span className="saved">saved to {project?.name}</span>}
              <button className="new" onClick={newSession} disabled={!msgs.length || busy} title="Start a fresh conversation">
                + New
              </button>
            </div>
          }
        />
        <Splitter side="explorer" w={panels.w} onChange={panels.set} />
        <Splitter side="chat" w={panels.w} onChange={panels.set} />
      </div>
    </div>
  );
}
