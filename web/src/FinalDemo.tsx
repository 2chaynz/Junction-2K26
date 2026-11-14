import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { Answer } from "./types";
import "./final-demo.css";

const Model3D = lazy(() => import("./Model3D"));
const base = import.meta.env.BASE_URL + "demo/";
const view = base + "harbor-overlay.ifc";
const questions = ["Show me what has changed.", "How much wall area was added or removed?"];
type Change = { guid: string; name: string; change: "added" | "removed"; area: number };
const area = (n: number) => n.toFixed(1);
const totals = (changes: Change[]) => [
  changes.filter((c) => c.change === "added").reduce((n, c) => n + c.area, 0),
  changes.filter((c) => c.change === "removed").reduce((n, c) => n + c.area, 0),
];
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function saveTakeoff(changes: Change[]) {
  const [added, removed] = totals(changes);
  const rows = changes.map((c) => `<tr><td>${escapeHtml(c.name)}<small>${escapeHtml(c.guid)}</small></td><td>${c.change}</td><td>${area(c.area)} m²</td></tr>`).join("");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SiteLens · Wall takeoff</title>
  <style>
  *{box-sizing:border-box}body{margin:0;padding:clamp(16px,5vw,64px);background:#edf1f4;color:#152531;font:16px/1.5 system-ui}
  main{max-width:850px;margin:auto;background:white;border-radius:18px;overflow:hidden}header,section{padding:clamp(20px,5vw,48px)}
  header{background:#132331;color:white}h1{margin:.25em 0 0;font-size:clamp(36px,6vw,64px);line-height:1.05}
  p{margin:.7em 0 0}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.metrics div{background:#edf1f4;padding:12px;border-radius:8px}
  strong{display:block;font-size:clamp(17px,3vw,30px)}.add{color:#087858}.remove{color:#a23630}
  table{margin-top:24px;width:100%;border-collapse:collapse}th,td{padding:12px 6px;text-align:left;border-bottom:1px solid #dee5ea}small{display:block;color:#465760;overflow-wrap:anywhere}
  @media print{body{padding:0;background:white}header{color:#152531;background:white}}
  </style><main><header><small style="color:inherit">SITELENS / REVISION TAKEOFF</small><h1>Wall area changes</h1><p>Harbor Workshop · Level 3 · Revision A → B</p></header>
  <section><div class="metrics"><div>Added<strong class="add">+${area(added)} m²</strong></div><div>Removed<strong class="remove">−${area(removed)} m²</strong></div><div>Net<strong>${added >= removed ? "+" : "−"}${area(Math.abs(added - removed))} m²</strong></div></div>
  <table><thead><tr><th>Element / IFC ID</th><th>Change</th><th>Gross side area</th></tr></thead><tbody>${rows}</tbody></table>
  <p><small>Source: sample IFC revisions A and B, Qto_WallBaseQuantities.GrossSideArea. One gross face per changed wall.</small></p></section></main></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "sitelens-harbor-wall-takeoff.html";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function FinalDemo() {
  const [changes, setChanges] = useState<Change[]>([]);
  const [error, setError] = useState(false);
  const [replay, setReplay] = useState(0);
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState("");
  const [saved, setSaved] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const ready = useCallback(() => setStep(1), []);

  useEffect(() => {
    const abort = new AbortController();
    fetch(base + "harbor-changes.json", { signal: abort.signal }).then((response) => {
      if (!response.ok) throw new Error("Revision evidence unavailable");
      return response.json() as Promise<Change[]>;
    }).then(setChanges).catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => abort.abort();
  }, []);

  const answered = step >= 3;
  const quantity = step >= 6;
  const [added, removed] = totals(changes);
  const changeIds = useMemo(() => new Set(changes.map((c) => c.guid)), [changes]);
  const answer = useMemo<Answer | null>(() => !answered ? null : ({
    value: changes.length, unit: null, method: "ifc", confidence: 1, cost_eur: 0, time_s: 0, view, trace: [],
    evidence: changes.map((c) => ({
      file: base + (c.change === "added" ? "harbor-B.ifc" : "harbor-A.ifc"), page: 0, bbox: [],
      label: `${c.change === "added" ? "Added" : "Removed"}: ${c.name}`, kind: "ifc", ifc_guid: c.guid, polygon: null,
    })),
  }), [answered, changes]);

  useEffect(() => {
    if (step === 0 || step >= 7) return;
    const question = step === 1 ? questions[0] : step === 4 ? questions[1] : null;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: ReturnType<typeof setTimeout>;
    if (question) {
      let n = 0;
      const type = () => {
        n = reduce ? question.length : n + 1;
        setTyped(question.slice(0, n));
        timer = n < question.length ? setTimeout(type, 33) : setTimeout(() => setStep(step + 1), 300);
      };
      timer = setTimeout(type, 200);
    } else {
      const delay = step === 3 ? 2600 : step === 6 ? 1500 : 350;
      timer = setTimeout(() => {
        if (step === 3) setTyped("");
        setStep(step + 1);
      }, delay);
    }
    return () => clearTimeout(timer);
  }, [step, replay]);

  function restart() {
    setStep(0);
    setTyped("");
    setSaved(false);
    setHover(null);
    setFocus(null);
    setReplay((n) => n + 1);
  }

  return (
    <main className="final-demo">
      <header className="fd-top">
        <b>SiteLens<span>.</span></b>
        <nav><button onClick={restart} disabled={!changes.length}>Replay</button><a href={location.pathname}>Workspace</a></nav>
      </header>
      <div className="fd-body">
        <section className="fd-stage" aria-label="Interactive BIM revision model">
          <div className="fd-project"><span>SAMPLE IFC</span><h1>Harbor Workshop</h1><p>Revision A → B</p></div>
          {!changes.length ? <p className="fd-loading" role="status">{error ? "Could not load the demo revisions. Reload to try again." : "Loading BIM…"}</p> :
            <Suspense fallback={<p className="fd-loading">Loading BIM…</p>}>
              <Model3D path={view} answer={answer} hover={hover} focus={focus} onHover={setHover} onFocus={setFocus} busy={step === 2 || step === 5}
                demo={{ url: view, replay, overview: !quantity, changeIds, onReady: ready }} />
            </Suspense>}
          {answered && <div className="fd-legend"><span>Added</span><span>Removed</span></div>}
        </section>
        <aside className="fd-story" aria-label="Guided demo">
          <div className="fd-progress" aria-label="Two demo highlights"><span className={quantity ? "" : "current"}>01 / Reveal</span><span className={quantity ? "current" : ""}>02 / Takeoff</span></div>
          {step > 0 && <p className="fd-question" aria-label={step < 4 ? questions[0] : questions[1]}>{typed || "\u00a0"}</p>}
          <div className="fd-result" aria-live="polite">
            {step === 0 && <h2>See what changed.</h2>}
            {answered && !quantity && <><h2>Two walls changed.</h2><p>A new east enclosure replaces an interior partition on Level 3.</p></>}
            {quantity && <>
              <h2>Wall area changes</h2>
              <div className="fd-metrics"><div><span>Added</span><strong>+{area(added)} <small>m²</small></strong></div><div><span>Removed</span><strong>−{area(removed)} <small>m²</small></strong></div></div>
              <div className="fd-rows">
                {changes.map((c, i) => <button key={c.guid} aria-pressed={focus === i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setFocus(focus === i ? null : i)}><span className={c.change}>{c.name}</span><span>{area(c.area)} m²</span></button>)}
              </div>
              <details><summary>Show measurement source</summary><p>Gross side area from one face of each changed wall, as recorded in the IFC quantities.</p><a href={base + "harbor-A.ifc"} download>Revision A</a>{" · "}<a href={base + "harbor-B.ifc"} download>Revision B</a></details>
            </>}
          </div>
          {step === 7 && <div className="fd-save">
            <p aria-live="polite">{saved ? "Takeoff downloaded." : "Want to save this as a takeoff?"}</p>
            <button onClick={() => { saveTakeoff(changes); setSaved(true); }}>{saved ? "Download again" : "Save takeoff"} <span aria-hidden="true">↓</span></button>
          </div>}
        </aside>
      </div>
    </main>
  );
}
