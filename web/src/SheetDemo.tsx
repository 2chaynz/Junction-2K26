import { useEffect, useRef } from "react";
import type { Drawing, Msg } from "./types";

// Permit set → current set: door schedule reworked (+3 / -6 door marks, +19 ft² in edited areas). Pair in diff_pairs.json.
export const sheetDemoPath =
  "data/opening_design/Sports_Complex/Sheets - Current Set/A-801 - Door and Finish Schedules & Wall Types.pdf";

const prompts = [
  "What changed since the previous issue?",
  "How many doors were removed since the previous issue?",
  "What is the net area change since the previous issue?",
];

// Scripted walkthrough of the PDF sheet diff on the real /api/ask path. Typing by hand stops it.
export function useSheetDemo(
  enabled: boolean,
  drawings: Drawing[],
  msgs: Msg[],
  busy: boolean,
  open: (path: string) => void,
  setDraft: (s: string) => void,
  run: (path: string, q: string) => void,
) {
  const auto = useRef(enabled);
  const opened = useRef(false);
  const go = useRef({ open, setDraft, run });
  go.current = { open, setDraft, run };
  const found = drawings.some((d) => d.path === sheetDemoPath);
  const step = msgs.filter((m) => m.kind === "user").length;

  useEffect(() => {
    if (!enabled || !found || opened.current) return;
    opened.current = true;
    go.current.open(sheetDemoPath);
  }, [enabled, found]);

  useEffect(() => {
    if (!auto.current || !found || busy || step >= prompts.length) return;
    const prompt = prompts[step];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;
    function type() {
      if (!auto.current) return;
      n = reduced ? prompt.length : n + 1;
      go.current.setDraft(prompt.slice(0, n));
      timer = n < prompt.length
        ? setTimeout(type, 35)
        : setTimeout(() => auto.current && go.current.run(sheetDemoPath, prompt), 300);
    }
    // Leave each answer on screen long enough to read the marks.
    timer = setTimeout(type, step === 0 ? 900 : 3500);
    return () => clearTimeout(timer);
  }, [found, busy, step]);

  return {
    missing: enabled && drawings.length > 0 && !found,
    stop() { auto.current = false; },
  };
}
