export type Evidence = {
  file: string;
  bbox: number[];
  page: number;
  label: string;
  kind: "box" | "polygon" | "text" | "ifc";
  polygon: number[][] | null;
  ifc_guid: string | null;
};

export type Check = { expected: unknown; unit: string | null; match: boolean | null };

export type Answer = {
  value: unknown;
  unit: string | null;
  method: string; // ifc | vector | detector | vlm | general | none
  confidence: number;
  cost_eur: number;
  evidence: Evidence[];
  trace: string[];
  time_s: number;
  view: string;
  check?: Check;
  tried?: string[];
  clarify?: { ask: string; options: string[] }; // method "clarify": a question back instead of a guess
};

export type KeyQuestion = { question: string; answer: unknown; unit: string | null; type: string };

export type Drawing = { path: string; source: string; view: string; questions: KeyQuestion[] };

// One reasoning step streamed by /api/ask/stream (CONTRACT.md → Step).
export type Step = { kind: "understand" | "try" | "skip" | "fail" | "found" | "trace" | "general" | "check" | "clarify"; path: string; text: string; t: number };

export type Msg =
  | { kind: "user"; path: string; text: string }
  | { kind: "answer"; path: string; question: string; answer: Answer; steps: Step[] }
  | { kind: "pending"; path: string; steps: Step[] }
  | { kind: "error"; path: string; text: string }
  | { kind: "switch"; path: string };
