import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { ask, askStream, getDrawings, originalUrl, surprise } from "./api";
import Benchmark from "./Benchmark";
import Changes, { CHANGE_Q, PAIRS, onNewSheet } from "./Changes";
import Chat from "./Chat";
import Explorer from "./Explorer";
import { baselinePath, demoName, demoPath, ifcUrl, TakeoffPreview, useRevisionDemo } from "./FinalDemo";
import { Splitter, usePanels } from "./Splitter";
import { SOURCE_LABEL, TYPE, floorsOf, fmtAnswer, fmtSize, pickChips, sheetCode, shortName } from "./format";
import ProjectMenu from "./ProjectMenu";
import HowItWorks from "./HowItWorks";
import Measure from "./Measure";
import ProjectOverview from "./Overview";
import Projects from "./Projects";
import {
  type Overview, type Recent, type SessionSummary, buildProjects, deleteSession, getRecent, getSession, listSessions,
  newSessionId, projectKeyOf, saveSession, sessionsOverview, sheetName, touchRecent,
} from "./workspace";
import "./shell.css";
import Takeoff, { levelLabel, projectLanguage, type Row } from "./Takeoff";
import Stack from "./Stack";
import type { Answer, Drawing, Mark, Msg, Shape, Step, Tool, Turn } from "./types";
import Viewer from "./Viewer";
import VlmBadge from "./VlmBadge";

// three.js + web-ifc are ~4 MB: only fetch them when a model is opened in 3D.
const Model3D = lazy(() => import("./Model3D"));

// Two levels, like Photoshop / Figma: a start screen with global pages, then tabs inside one project.
const HOME_TABS = ["Projects", "How it works", "Benchmark"] as const;
const PROJECT_TABS = ["Overview", "Drawings", "Takeoff"] as const;
type Tab = (typeof HOME_TABS)[number] | (typeof PROJECT_TABS)[number];
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

// Which sheet is open, inside its folder, with previous / next like a drawing set viewer.
function SheetBar({ folder, items, path, code, onPick, onFolder }: {
  folder: string; items: Drawing[]; path: string; code: string; onPick: (p: string) => void; onFolder: () => void;
}) {
  const i = items.findIndex((d) => d.path === path);
  const d = items[i];
  if (!d) return null;
  return (
    <div className="sheetbar">
      <button className="crumb dim ellipsis" onClick={onFolder} title="Project overview">{folder}</button>
      <span className="sep">/</span>
      <span className="crumb cur ellipsis" title={d.path}>{sheetName(d)}</span>
      <span className="mono dim">{code}</span>
      <span className="spacer" />
      <span className="mono dim">{i + 1} / {items.length}</span>
      <button className="step" disabled={i <= 0} onClick={() => onPick(items[i - 1].path)} title="Previous sheet" aria-label="Previous sheet">‹</button>
      <button className="step" disabled={i >= items.length - 1} onClick={() => onPick(items[i + 1].path)} title="Next sheet" aria-label="Next sheet">›</button>
    </div>
  );
}

export default function App({ revisionDemo = false }: { revisionDemo?: boolean }) {
  const [tab, setTab] = useState<Tab>("Projects");
  const demoEntered = revisionDemo && tab === "Drawings";
  const demo = useRevisionDemo(revisionDemo, demoEntered, () => setTab("Drawings"));
  const removedIds = useMemo(() => new Set(demo.changes?.filter((row) => row.change === "removed").map((row) => row.guid)), [demo.changes]);
  const demoMessage = demo.active === null ? undefined : demo.messages[demo.active];
  const demoAnswer = demoMessage?.kind === "answer" ? demoMessage.answer : null;
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
  const [tkPath, setTkPath] = useState<string | null>(null); // takeoff of the project's model / schedule, not the open sheet
  const [zoomTo, setZoomTo] = useState<number[] | null>(null);
  const [sid, setSid] = useState(newSessionId);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [overview, setOverview] = useState<Overview>({});
  const [recent, setRecent] = useState<Recent>(getRecent);
  const loaded = useRef<Msg[] | null>(null); // msgs as reopened from the server: unchanged → no re-save

  useEffect(() => {
    if (revisionDemo) return;
    getDrawings()
      .then((d) => {
        setDrawings(d);
        // ?path=…&q=… opens a drawing and asks right away (demo links, video takes).
        const u = new URLSearchParams(location.search);
        const p = u.get("path"), q = u.get("q");
        if (p && d.some((x) => x.path === p)) {
          setPath(p);
          setMode("plan");
          const t = u.get("tab");
          setTab(PROJECT_TABS.find((x) => x.toLowerCase() === t?.toLowerCase()) ?? "Drawings");
          if (q) run(p, q);
        }
        // Otherwise start on the project list: "Continue where you left off" resumes the last sheet.
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && t.tagName !== "INPUT" && t.tagName !== "TEXTAREA") {
        if (!curProj.current) return;
        e.preventDefault();
        setTab("Drawings");
        if (!panels.w.explorer) panels.set("explorer", 288);
        setTimeout(() => search.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panels.w.explorer, panels.set]);

  const drawing = useMemo(() => drawings.find((d) => d.path === path), [drawings, path]);
  const allPaths = useMemo(() => drawings.map((d) => d.path), [drawings]);
  const chips = useMemo(() => pickChips(drawing), [drawing]);
  const busy = msgs.some((m) => m.kind === "pending");
  const projects = useMemo(() => buildProjects(drawings), [drawings]);
  const projKey = drawing ? projectKeyOf(drawing) : null;
  const project = useMemo(() => projects.find((p) => p.key === projKey) ?? null, [projects, projKey]);
  const sessProj = useRef<string | null>(null); // project the open session belongs to
  const curProj = useRef(projKey); // for async replies: still the project on screen?
  curProj.current = projKey;
  // Conversations left while a question was still answering; the answer is saved into them when it lands.
  const parked = useRef(new Map<string, { key: string; msgs: Msg[] }>());
  const park = () => {
    if (busy && projKey) parked.current.set(sid, { key: sessProj.current ?? projKey, msgs });
  };

  useEffect(() => {
    if (revisionDemo) return;
    sessionsOverview().then(setOverview).catch(() => {});
  }, [tab === "Projects"]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSessions([]);
    let stale = false;
    if (projKey) listSessions(projKey).then((l) => !stale && setSessions(l)).catch(() => {});
    return () => void (stale = true);
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
        if (key !== curProj.current) return;
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

  function select(p: string, to: Tab = "Drawings") {
    setTab(to);
    setTkPath(null);
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
      park();
      setMsgs([]);
      setSid(newSessionId());
      sessProj.current = projectKeyOf(d);
      loaded.current = null;
      return;
    }
    setMsgs((m) => (m.length ? [...m, { kind: "switch", path: p }] : m));
  }

  function newSession() {
    park();
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
    if (id === sid) return setTab("Drawings");
    try {
      // Still answering in the background: take that live copy back, the server one lacks the pending answer.
      const live = parked.current.get(id);
      const ms = live ? live.msgs : (await getSession(projKey, id)).msgs ?? [];
      parked.current.delete(id);
      park();
      loaded.current = ms;
      sessProj.current = projKey;
      setSid(id);
      setMsgs(ms);
      setTab("Drawings");
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
    // A named sheet (resume, search hit) opens it; a project card opens its overview first.
    if (target) select(target, at ? "Drawings" : "Overview");
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
    // T75: the last turns make follow-ups ("and windows?") resolvable; project sheets are tier 2.
    const history: Turn[] = msgs
      .filter((m): m is Extract<Msg, { kind: "answer" }> => m.kind === "answer" && m.answer.method !== "clarify")
      .slice(-4)
      .map((m) => ({ question: m.answer.followup?.standalone ?? m.question, answer: m.answer.value == null ? "unknown" : fmtAnswer(m.answer) }));
    // Only real projects share facts across sheets; the Swiss portfolio and CubiCasa archive are unrelated buildings.
    const linked = project?.kind === "BIM" || project?.kind === "Sheet set";
    const folderItems = project?.folders.find((f) => f.items.some((d) => d.path === p))?.items ?? [];
    const related = linked ? [...folderItems, ...(project?.items ?? [])].map((d) => d.path).filter((x) => x !== p) : [];
    let next: Msg;
    try {
      const answer = await askStream(p, q, (s) => {
        steps.push(s);
        const snap = [...steps];
        setMsgs((m) => m.map((x) => (x.kind === "pending" && x.id === id ? { ...x, steps: snap } : x)));
      }, region, { history, related: [...new Set(related)].slice(0, 6) });
      next = { kind: "answer", path: p, question: q, answer, steps, mark: region };
    } catch (e) {
      next = { kind: "error", path: p, text: `Something broke: ${String(e)}` };
    }
    for (const [psid, pk] of parked.current) {
      const i = pk.msgs.findIndex((x) => x.kind === "pending" && x.id === id);
      if (i < 0) continue;
      pk.msgs = pk.msgs.map((x, j) => (j === i ? next : x));
      if (!pk.msgs.some((x) => x.kind === "pending")) parked.current.delete(psid);
      saveSession(pk.key, psid, pk.msgs)
        .then((sum) => setSessions((l) => (curProj.current === pk.key ? [sum, ...l.filter((x) => x.id !== sum.id)] : l)))
        .catch(() => {});
      return;
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
  function showRow(r: Row, instance?: number) {
    const target = tkPath ?? modelPath ?? path;
    select(target);
    const d = drawings.find((item) => item.path === target);
    const evidence = instance === undefined ? r.evidence : [r.evidence[instance]];
    const label = `${r.category}: ${r.type}${r.size ? ` · ${r.size}` : ""}`;
    const a: Answer = {
      value: instance === undefined ? r.count : 1, unit: "count", method: "takeoff", confidence: 1, cost_eur: 0, evidence,
      trace: [`takeoff row: ${label}`, `${r.count} element(s)${r.levels.length ? ` on ${r.levels.map((level) => levelLabel(level, projectLanguage(target))).join(", ")}` : ""}`],
      time_s: 0, view: d?.view ?? target,
    };
    setTab("Drawings");
    setChOn(false);
    setHover(null);
    setFocus(instance === undefined ? null : 0);
    setMsOn(false);
    setMode(evidence.some((e) => e.ifc_guid) ? "3d" : "plan");
    setMsgs((m) => {
      setActive(m.length + 1);
      return [...m, { kind: "user", path: target, text: `Takeoff: ${label}` }, { kind: "answer", path: target, question: label, answer: a, steps: [] }];
    });
  }

  function toggleMeasure() {
    setMsOn((v) => !v);
    setChOn(false);
    setTool(null);
    setShapes([]);
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

  const inProject = (PROJECT_TABS as readonly string[]).includes(tab) && !!project;
  const folder = project?.folders.find((f) => f.items.some((d) => d.path === path)) ?? null;
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
  const modelPath = demoEntered ? demoPath : drawing?.model ?? (isIfc ? path : null);
  const hasPlan = !!modelPath && !!view && !view.endsWith(".ifc");
  const show3d = !!modelPath && (demoEntered || (mode === "3d" && !msOn) || (isIfc && !hasPlan));
  const floors = useMemo(() => floorsOf(drawings, path), [drawings, path]);
  const showStack = floors.length > 1 && mode === "stack" && !showCh && !msOn;
  const ch = chData[path];
  const chAnswer = useMemo(() => (ch?.answer ? onNewSheet(ch.answer, view) : null), [ch, view]);

  return (
    <div className={`app ${tab === "Drawings" ? "" : "paged"} ${revisionDemo ? "revision-demo" : ""}`}>
      <header className="shell">
        <div className="top">
          <nav className="crumbbar" aria-label="Breadcrumb">
            {revisionDemo ? <span className="brand">SiteLens</span> :
              <button className="brand" onClick={() => setTab("Projects")} title="Home: all projects">SiteLens</button>}
            {demoEntered && <><span className="sep">/</span><strong>{demoName}</strong></>}
            {inProject && project && (
              <>
                <span className="sep">/</span>
                <ProjectMenu
                  project={project}
                  projects={projects}
                  recent={recent}
                  onOpen={(k) => openProject(k)}
                  onHome={() => setTab("Projects")}
                />
              </>
            )}
          </nav>
          <span className="spacer" />
          {!inProject && project && (
            <button className="btn resume" onClick={() => setTab("Drawings")} title="Back to the open project">
              Back to <span className="ellipsis">{project.name}</span> ›
            </button>
          )}
          {revisionDemo ? <><a className="btn" href="?demo">Replay</a><a className="btn" href={location.pathname}>All projects</a></> :
            <><a className="btn" href="?demo">Final demo</a><VlmBadge /></>}
        </div>
        <nav className="tabs subnav">
          {(revisionDemo ? [demoEntered ? "Drawings" : "Projects"] as const : inProject ? PROJECT_TABS : HOME_TABS).map((t) => (
            <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
      </header>

      {tab === "Overview" && project && (
        <main className="pagewrap">
          <ProjectOverview
            project={project}
            allPaths={allPaths}
            sessions={sessions}
            lastPath={recent[project.key]?.path ?? null}
            onOpen={(p) => select(p)}
            onModel={(p) => (select(p), setMsOn(false), setChOn(false), setMode("3d"))}
            onChanges={(p) => (select(p), setMsOn(false), setChOn(true))}
            onSession={openSession}
            onTakeoff={(p) => (setTkPath(p), setTab("Takeoff"))}
          />
        </main>
      )}
      {tab === "Takeoff" && (
        <main className="pagewrap">
          <Takeoff path={tkPath ?? modelPath ?? path} name={(tkPath ?? modelPath ?? path).split("/").pop() ?? ""} onShow={showRow} language={projectLanguage(tkPath ?? modelPath ?? path)} />
        </main>
      )}
      {tab === "How it works" && <main className="pagewrap"><HowItWorks /></main>}
      {tab === "Benchmark" && <main className="pagewrap"><Benchmark /></main>}
      {tab === "Projects" && (
        <main className="pagewrap">
          {revisionDemo ? <div className="page projects">
            <h1>Projects</h1>
            <button className="pcard project-entry" disabled={!demo.changes} onClick={() => setTab("Drawings")}>
              <strong>{demoName}</strong>
              <span className="dim"> Baseline and proposed renovation</span>
            </button>
            {demo.error && <p role="alert">{demo.error}</p>}
          </div> : <Projects projects={projects} overview={overview} recent={recent} current={projKey} onOpen={openProject} />}
        </main>
      )}

      <div className="askview" hidden={tab !== "Drawings"} {...(revisionDemo ? {} : panels.props)}>
        {!revisionDemo && <Explorer
          ref={search}
          drawings={drawings}
          projects={projects}
          project={project}
          selected={path}
          onSelect={select}
          sessions={sessions}
          session={sid}
          onSession={openSession}
          onNewSession={newSession}
          onDeleteSession={removeSession}
        />}
        <main className="stage">
          {demoEntered && <div className="demo-modelbar">
            <strong>Renovation comparison</strong>
            <span className="dim">BIM-SPEED</span>
            {demoAnswer && <span className="demo-key"><span>Added</span><span>Removed</span></span>}
            <details><summary>Source files</summary><a href={ifcUrl(baselinePath)} download>Baseline</a>{" · "}<a href={ifcUrl(demoPath)} download>Proposal</a></details>
          </div>}
          {drawing && folder && (
            <SheetBar
              folder={folder.label}
              items={folder.items}
              path={path}
              code={sheetCode(allPaths, drawing.path, drawing.source)}
              onPick={(p) => select(p)}
              onFolder={() => setTab("Overview")}
            />
          )}
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
                answer={demoEntered ? demoAnswer : answer}
                language={demoEntered ? "en" : projectLanguage(modelPath)}
                demo={demoEntered ? { url: ifcUrl(demoPath), baseline: ifcUrl(baselinePath), overview: !String(demoAnswer?.value).startsWith("P2"), removedIds, onReady: demo.onReady } : undefined}
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
                extra={!showCh && !view.endsWith(".ifc") && (
                  <button className={msOn ? "on" : ""} onClick={toggleMeasure} title="Measure lengths and areas, set the scale">
                    Measure
                  </button>
                )}
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
          msgs={revisionDemo ? demo.messages : msgs}
          path={revisionDemo ? demoPath : path}
          chips={revisionDemo ? [] : chips}
          active={revisionDemo ? demo.active : active}
          artifact={demo.image ? <TakeoffPreview key={demo.active} image={demo.image} /> : undefined}
          hover={hover}
          focus={focus}
          draft={revisionDemo ? demo.draft : draft}
          busy={busy}
          setDraft={revisionDemo ? demo.type : setDraft}
          mark={mark}
          onClearMark={() => setMark(null)}
          onAsk={revisionDemo ? demo.ask : (q) => run(path, q)}
          onActivate={(i) => {
            if (revisionDemo) { setHover(null); setFocus(null); demo.activate(i); return; }
            const m = msgs[i];
            if (m.path !== path) (setPath(m.path), setSize(null));
            activate(i);
          }}
          onHover={setHover}
          onFocus={setFocus}
          head={revisionDemo ? undefined :
            <div className="chathead">
              <span className="k">Session</span>
              <span className="ellipsis" title={sessionTitle}>{sessionTitle}</span>
              <span className="spacer" />
              <button className="new" onClick={onRandom} disabled={busy} title="Pick a random Stoa question">Random</button>
              {sessions.some((x) => x.id === sid) && <span className="saved">saved to {project?.name}</span>}
              <button className="new" onClick={newSession} disabled={!msgs.length || busy} title="Start a fresh conversation">
                + New
              </button>
            </div>
          }
        />
        {!revisionDemo && <><Splitter side="explorer" w={panels.w} onChange={panels.set} />
        <Splitter side="chat" w={panels.w} onChange={panels.set} /></>}
      </div>
    </div>
  );
}
