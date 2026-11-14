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
};

export type KeyQuestion = { question: string; answer: unknown; unit: string | null; type: string };

export type Drawing = { path: string; source: string; view: string; questions: KeyQuestion[] };

// One reasoning step streamed by /api/ask/stream (CONTRACT.md → Step).
export type Step = { kind: "try" | "skip" | "fail" | "found" | "trace" | "general" | "check"; path: string; text: string; t: number };

export type Msg =
  | { kind: "user"; path: string; text: string }
  | { kind: "answer"; path: string; question: string; answer: Answer; steps: Step[] }
  | { kind: "pending"; path: string; steps: Step[] }
  | { kind: "error"; path: string; text: string }
  | { kind: "switch"; path: string };

// Measure (takeoffs). Coordinates are drawing units, the same as Evidence.bbox.
export type Ref = { file: string; page: number; bbox: number[]; text: string; kind: string };

export type Scale = {
  id: string;
  m_per_unit: number;
  source: string; // stored | dxf | sibling | note | bar | sheet_size | manual
  text: string;
  confidence: number;
  refs: Ref[];
  applies: number[] | null;
  agree: string;
  ratio: string;
};

export type Known = { id: string; text: string; value: number; unit: "m" | "m2"; ref: Ref };

export type Takeoff = {
  id: string;
  kind: "length" | "area" | "count";
  label: string;
  points: number[][];
  bbox: number[];
  value: number;
  unit: string;
  text: string;
  group?: string;
  printed?: number | null;
  outdoor?: boolean;
  perimeter_m?: number;
  closed?: boolean;
  scale?: { id: string; ratio: string; text: string; m_per_unit: number } | null;
  created?: string;
};

export type Calibration = Scale & { page: number; active: boolean; how: string; created: string };

export type MeasureState = {
  path: string;
  page: number;
  image: boolean;
  scale: Scale | null;
  candidates: Scale[];
  ask: string | null;
  options: Scale[];
  known: Known[];
  project: Scale[];
  calibrations: Calibration[];
  measurements: Takeoff[];
  auto: { summary: string; lines: string[]; items: Takeoff[]; scale: Scale | null };
};

export type Tool = "length" | "area" | "count" | "calibrate" | "calarea";

export type Shape = {
  id: string;
  points: number[][];
  closed: boolean;
  label: string;
  tone: "auto" | "manual" | "ref" | "count";
};
