import { useEffect, useRef, useState } from "react";
import type { Answer, Msg } from "./types";
import "./final-demo.css";

export const demoBase = import.meta.env.BASE_URL + "demo/";
export const demoPath = demoBase + "harbor-overlay.ifc";
export const demoName = "Harbor Workshop";

type Change = { guid: string; name: string; level: string | null; change: "added" | "removed"; area: number | null };
const prompts = [
  "What are the changes?",
  "What changed on the second floor?",
  "Create a takeoff of these changes.",
];

function takeoffImage(rows: Change[], scope: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 326 + rows.length * 58;
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
  text("SiteLens   /   Harbor Workshop", 48, 62, "600 20px sans-serif", "#666");
  text("Revision takeoff", 48, 126, "600 56px sans-serif");
  text(scope + "  ·  Revision A → B  ·  Recreated IFC revisions", 50, 165, "22px sans-serif", "#666");
  const total = (kind: Change["change"]) => rows.filter((row) => row.change === kind)
    .reduce((sum, row) => sum + (row.area ?? 0), 0);
  text("+" + total("added").toFixed(1) + " m² added", 48, 223, "600 32px sans-serif", "#087758");
  text("−" + total("removed").toFixed(1) + " m² removed", 510, 223, "600 32px sans-serif", "#ba3027");
  rows.forEach((row, i) => {
    const y = 254 + i * 58;
    ctx.fillStyle = i % 2 ? "#fff" : "#f5f5f3";
    ctx.fillRect(48, y, 984, 54);
    text(row.change === "added" ? "Added" : "Removed", 64, y + 34, "600 19px sans-serif",
      row.change === "added" ? "#087758" : "#ba3027");
    text(row.name, 208, y + 34, "22px sans-serif");
    text(row.area === null ? "Area unavailable" : row.area.toFixed(1) + " m²", 840, y + 34, "22px sans-serif");
  });
  text("Source: Qto_WallBaseQuantities.GrossSideArea · one gross face per wall", 48, canvas.height - 24, "18px sans-serif", "#666");
  return canvas.toDataURL("image/png");
}

function revisionAnswer(rows: Change[], scope: string): Answer {
  const added = rows.filter((row) => row.change === "added").length;
  const removed = rows.length - added;
  return {
    value: `${scope}: ${added} added, ${removed} removed`,
    method: "revision", confidence: 1, unit: null, cost_eur: 0, time_s: 0, view: demoPath,
    trace: ["Compared wall IFC GlobalIds in revisions A and B."],
    evidence: rows.map((row) => ({
      file: demoPath, page: 0, bbox: [], polygon: null, kind: "ifc", ifc_guid: row.guid,
      label: `${row.change === "added" ? "Added" : "Removed"}: ${row.name}`,
    })),
    table: {
      title: "Wall changes", columns: ["Change", "Element", "Floor"],
      rows: rows.map((row) => [row.change === "added" ? "Added" : "Removed", row.name, row.level?.replace("Level", "Floor") ?? "—"]),
    },
  };
}

export function useRevisionDemo(enabled: boolean, entered: boolean, onOpen: () => void) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const [image, setImage] = useState("");
  const automatic = useRef(true);
  const open = useRef(onOpen);
  open.current = onOpen;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/demo/revisions", { signal: controller.signal }).then((res) => {
      if (!res.ok) throw new Error("Could not load the BIM revisions.");
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
    const floor = /\b(second|2nd|floor\s*2|level\s*2)\b/.test(q);
    const previous = active === null ? undefined : messages[active];
    const priorFloor = previous?.kind === "answer" && previous.answer.view === demoPath
      && String(previous.answer.value).startsWith("Floor 2");
    const wholeBuilding = /\b(all changes|whole building|entire building|all floors|every floor)\b/.test(q);
    const focused = floor || (wantsTakeoff && priorFloor && !wholeBuilding);
    const rows = focused ? changes.filter((row) => row.level === "Level 2") : changes;
    const scope = focused ? "Floor 2" : "Whole building";
    const answer = revisionAnswer(rows, scope);
    const recognized = wantsTakeoff || /chang|revision|compar/.test(q);
    setDraft("");
    if (wantsTakeoff) setImage(takeoffImage(rows, scope));
    if (recognized) setActive(messages.length + 1);
    setMessages([...messages, { kind: "user", path: demoPath, text: question }, recognized
      ? { kind: "answer", path: demoPath, question, answer, steps: [] }
      : { kind: "error", path: demoPath, text: "Ask about revision changes, Floor 2, or a takeoff of the changes." }]);
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
    changes, messages, draft, active, image, error,
    onReady: setReady,
    activate: setActive,
    type(s: string) { automatic.current = false; setDraft(s); },
    ask(q: string) { automatic.current = false; ask(q); },
  };
}
