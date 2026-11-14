import { useEffect, useRef, useState } from "react";
import type { Answer, Msg } from "./types";
import "./final-demo.css";

const modelStem = "data/ifc_models/bimspeed-vitoria_ald26-";
export const demoPath = modelStem + "project.ifc";
export const baselinePath = modelStem + "before.ifc";
export const ifcUrl = (path: string) => "/api/ifc?path=" + encodeURIComponent(path);
export const demoName = "Vitoria-Gasteiz ALD26";
export const demoFloor = "P2";

type Change = { guid: string; kind: string; name: string; level: string | null; change: "added" | "removed" };

function countChanges(rows: Change[]) {
  const groups = new Map<string, { added: number; removed: number }>();
  const total = { added: 0, removed: 0 };
  for (const row of rows) {
    const group = groups.get(row.kind) ?? { added: 0, removed: 0 };
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
  canvas.height = 360 + groups.length * 50;
  const ctx = canvas.getContext("2d")!;
  function text(s: string, x: number, y: number, font: string, color = "#1a1a1a") {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
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
  text("ADDED", 754, 263, "600 17px sans-serif", "#087758");
  text("REMOVED", 884, 263, "600 17px sans-serif", "#ba3027");
  groups.forEach(([kind, count], i) => {
    const y = 280 + i * 50;
    ctx.fillStyle = i % 2 ? "#fff" : "#f5f5f3";
    ctx.fillRect(48, y, 984, 48);
    text(kind, 64, y + 31, "22px sans-serif");
    text(String(count.added), 754, y + 31, "22px sans-serif", "#087758");
    text(String(count.removed), 884, y + 31, "22px sans-serif", "#ba3027");
  });
  text("IFC element counts by GlobalId  |  BIM-SPEED / TU Berlin, CC BY 4.0", 48, canvas.height - 24, "18px sans-serif", "#666");
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
      .concat("Counts compare IFC GlobalIds. Edits to shared IDs are outside this takeoff."),
  };
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
    const q = question.toLowerCase();
    const wantsTakeoff = /take\s*off/.test(q);
    const floor = /\b(second|2nd|floor\s*2|level\s*2|p2)\b/.test(q);
    const previous = active === null ? undefined : messages[active];
    const priorFloor = previous?.kind === "answer" && previous.answer.view === demoPath
      && String(previous.answer.value).startsWith("P2");
    const wholeBuilding = /\b(all changes|whole building|entire building|all floors|every floor)\b/.test(q);
    const focused = floor || (wantsTakeoff && priorFloor && !wholeBuilding);
    const rows = focused ? changes.filter((row) => row.level === demoFloor) : changes;
    const scope = focused ? "P2" : "Whole building";
    const answer = revisionAnswer(rows, scope);
    const recognized = wantsTakeoff || /chang|revision|compar/.test(q);
    setDraft("");
    if (wantsTakeoff) {
      const image = takeoffImage(rows, scope);
      setImages((previous) => ({ ...previous, [messages.length + 1]: image }));
    }
    if (recognized) setActive(messages.length + 1);
    setMessages([...messages, { kind: "user", path: demoPath, text: question }, recognized
      ? { kind: "answer", path: demoPath, question, answer, steps: [] }
      : { kind: "error", path: demoPath, text: "Ask about revision changes, P2, or a takeoff of the changes." }]);
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
      timer = n < prompt.length ? setTimeout(type, 35) : setTimeout(() => submit.current(prompt), 300);
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
