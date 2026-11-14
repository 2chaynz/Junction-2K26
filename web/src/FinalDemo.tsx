import { useEffect, useRef, useState } from "react";
import type { Answer, Msg } from "./types";
import "./final-demo.css";

const modelStem = "data/ifc_models/bimspeed-vitoria_ald26-";
export const demoPath = modelStem + "project.ifc";
export const baselinePath = modelStem + "before.ifc";
export const ifcUrl = (path: string) => "/api/ifc?path=" + encodeURIComponent(path);
export const demoName = "Vitoria-Gasteiz ALD26";
export const demoFloor = "P2";

type Change = { guid: string; kind: string; name: string; level: string | null; change: "added" | "removed"; dimensions: number[] | null };

function dimensionText(values: number[][]) {
  if (!values.length) return "Unavailable";
  return [0, 1, 2].map((axis) => {
    const lengths = values.map((size) => size[axis]);
    const min = Math.min(...lengths).toFixed(2);
    const max = Math.max(...lengths).toFixed(2);
    return min === max ? min : `${min}?${max}`;
  }).join(" ? ") + " m";
}

function countChanges(rows: Change[]) {
  const groups = new Map<string, { added: number; removed: number; sizes: number[][] }>();
  const total = { added: 0, removed: 0 };
  for (const row of rows) {
    const group = groups.get(row.kind) ?? { added: 0, removed: 0, sizes: [] };
    if (row.dimensions) group.sizes.push(row.dimensions);
    group[row.change]++;
    total[row.change]++;
    groups.set(row.kind, group);
  }
  return { total, groups: [...groups].sort((a, b) =>
    b[1].added + b[1].removed - a[1].added - a[1].removed || a[0].localeCompare(b[0])) };
}

const prompts = [
  "What are the changes?",
  "What changed on the second floor?",
  "Create a takeoff of these changes.",
];

function takeoffImage(rows: Change[], scope: string) {
  const { total, groups } = countChanges(rows);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 410 + groups.length * 50;
  const ctx = canvas.getContext("2d")!;
  function text(s: string, x: number, y: number, font: string, color = "#1a1a1a") {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(s, x, y, x === 330 ? 398 : canvas.width - x - 48);
  }
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#d92d20";
  ctx.fillRect(0, 0, canvas.width, 8);
  text("SiteLens  /  " + demoName, 48, 62, "600 20px sans-serif", "#666");
  text("Renovation takeoff", 48, 126, "600 56px sans-serif");
  text(scope + "  |  Baseline and proposed renovation", 50, 165, "22px sans-serif", "#666");
  text("+" + total.added + " added", 48, 223, "600 32px sans-serif", "#087758");
  text(total.removed + " removed", 510, 223, "600 32px sans-serif", "#ba3027");
  text("ELEMENT TYPE", 64, 263, "600 17px sans-serif", "#666");
  text("LOCAL BOUNDS X ? Y ? Z", 330, 263, "600 17px sans-serif", "#666");
  text("ADDED", 754, 263, "600 17px sans-serif", "#087758");
  text("REMOVED", 884, 263, "600 17px sans-serif", "#ba3027");
  groups.forEach(([kind, count], i) => {
    const y = 280 + i * 50;
    ctx.fillStyle = i % 2 ? "#fff" : "#f5f5f3";
    ctx.fillRect(48, y, 984, 48);
    text(kind, 64, y + 31, "22px sans-serif");
    text(dimensionText(count.sizes), 330, y + 31, "18px sans-serif");
    text(String(count.added), 754, y + 31, "22px sans-serif", "#087758");
    text(String(count.removed), 884, y + 31, "22px sans-serif", "#ba3027");
  });
  text("Dimensions: local geometry bounds, min?max across measured elements of each type.", 48, canvas.height - 83, "18px sans-serif", "#666");
  text("Added from [2]; removed from [1]. BIM-SPEED / TU Berlin, CC BY 4.0.", 48, canvas.height - 55, "18px sans-serif", "#666");
  text("[1] Baseline IFC     [2] Proposal IFC", 48, canvas.height - 25, "600 19px sans-serif", "#125d9c");
  return canvas.toDataURL("image/png");
}

function revisionAnswer(rows: Change[], scope: string): Answer {
  const { total: { added, removed }, groups } = countChanges(rows);
  return {
    value: `${scope}: ${added} added, ${removed} removed`,
    method: "revision", confidence: 1, unit: null, cost_eur: 0, time_s: 0, view: demoPath,
    evidence: rows.map((row) => ({
      file: row.change === "removed" ? baselinePath : demoPath, page: 0, bbox: [], polygon: null, kind: "ifc", ifc_guid: row.guid,
      label: `${row.change === "added" ? "Added" : "Removed"}: ${row.name}`,
    })),
    trace: groups.map(([kind, count]) => `${kind}: ${count.added} added, ${count.removed} removed`)
      .concat(groups.map(([kind, count]) =>
        `${kind}: ${dimensionText(count.sizes)} (${count.sizes.length} of ${count.added + count.removed} measured)`))
      .concat("Dimensions show local geometry bounds (X ? Y ? Z), as ranges across measured elements.",
        "Counts compare IFC GlobalIds. Edits to shared IDs are outside this takeoff."),
  };
}

export function TakeoffPreview({ image }: { image: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => dialog.current?.showModal(), 750);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="demo-artifact">
      <button ref={opener} className="btn" onClick={() => dialog.current?.showModal()}>Open revision takeoff</button>
      <dialog ref={dialog} className="takeoff-preview" aria-labelledby="takeoff-preview-title"
        onClose={() => opener.current?.focus()}>
        <header>
          <h2 id="takeoff-preview-title">Revision takeoff</h2>
          <button className="btn" onClick={() => dialog.current?.close()} autoFocus>Close</button>
        </header>
        <img src={image} alt="Revision takeoff with counts and measured geometry dimensions by element type" />
        <footer>
          <a href={ifcUrl(baselinePath)} download="bimspeed-vitoria_ald26-before.ifc">[1] Baseline IFC</a>
          <a href={ifcUrl(demoPath)} download="bimspeed-vitoria_ald26-project.ifc">[2] Proposal IFC</a>
          <a className="btn" href={image} download="vitoria-renovation-takeoff.png">Download PNG</a>
        </footer>
      </dialog>
    </div>
  );
}

export function useRevisionDemo(enabled: boolean, entered: boolean, onOpen: () => void) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const [images, setImages] = useState<Record<number, string>>({});
  const automatic = useRef(true);
  const open = useRef(onOpen);
  open.current = onOpen;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/demo/revisions", { signal: controller.signal }).then((res) => {
      if (!res.ok) throw new Error("Load the full Junction dataset to open the Vitoria IFC revisions.");
      return res.json() as Promise<Change[]>;
    }).then(setChanges).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || entered || !changes) return;
    const timer = setTimeout(() => open.current(), 1300);
    return () => clearTimeout(timer);
  }, [enabled, entered, changes]);

  function ask(question: string) {
    if (!changes) return;
    const q = question.toLowerCase().trim().replace(/[?.!]+$/, "").replace(/\s+/g, " ");
    const floorName = "(?:p2|(?:the )?(?:second|2nd) floor|floor 2|level 2)";
    const comparison = /^(?:what (?:are the changes|changed)|show (?:me )?(?:what changed|the changes)|compare (?:the )?revisions)$/;
    const scopedComparison = new RegExp(`^(?:(?:what changed|what are the changes|show (?:me )?the changes) (?:on|for|in) )?${floorName}$`);
    const takeoff = /^(?:create|make|generate|save) (?:a )?take\s*off(?: of (these|all) changes)?$/;
    const scopedTakeoff = new RegExp(`^(?:create|make|generate|save) (?:a )?take\\s*off (?:on|for) ${floorName}$`);
    const takeoffRequest = takeoff.exec(q);
    const floorTakeoff = scopedTakeoff.test(q);
    const wantsTakeoff = !!takeoffRequest || floorTakeoff;
    const previous = active === null ? undefined : messages[active];
    const priorFloor = previous?.kind === "answer" && String(previous.answer.value).startsWith("P2:");
    const focused = floorTakeoff || scopedComparison.test(q) || (!!takeoffRequest && takeoffRequest[1] !== "all" && priorFloor);
    const recognized = wantsTakeoff || focused || comparison.test(q);
    const rows = focused ? changes.filter((row) => row.level === demoFloor) : changes;
    const scope = focused ? "P2" : "Whole building";
    const answer = revisionAnswer(rows, scope);
    setDraft("");
    if (wantsTakeoff && recognized) {
      const image = takeoffImage(rows, scope);
      setImages((previous) => ({ ...previous, [messages.length + 1]: image }));
    }
    if (recognized) setActive(messages.length + 1);
    setMessages([...messages, { kind: "user", path: demoPath, text: question }, recognized
      ? { kind: "answer", path: demoPath, question, answer, steps: [] }
      : { kind: "error", path: demoPath, text: "Choose P2 or the whole building for this revision walkthrough." }]);
  }

  const submit = useRef(ask);
  submit.current = ask;
  const step = messages.filter((message) => message.kind === "user").length;
  useEffect(() => {
    if (!enabled || !entered || !ready || !changes || !automatic.current || step >= prompts.length) return;
    const prompt = prompts[step];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: ReturnType<typeof setTimeout>;
    let n = 0;
    function type() {
      if (!automatic.current) return;
      n = reduced ? prompt.length : n + 1;
      setDraft(prompt.slice(0, n));
      timer = n < prompt.length ? setTimeout(type, 35) : setTimeout(() => { if (automatic.current) submit.current(prompt); }, 300);
    }
    timer = setTimeout(type, step === 0 ? 350 : 2200);
    return () => clearTimeout(timer);
  }, [enabled, entered, ready, changes, step]);

  return {
    changes, messages, draft, active, image: active === null ? "" : images[active] ?? "", error,
    onReady: setReady,
    activate: setActive,
    type(s: string) { automatic.current = false; setDraft(s); },
    ask(q: string) { automatic.current = false; ask(q); },
  };
}
