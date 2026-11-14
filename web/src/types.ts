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
  method: string;
  confidence: number;
  cost_eur: number;
  evidence: Evidence[];
  trace: string[];
  time_s: number;
  view: string;
  check?: Check;
};

export type KeyQuestion = { question: string; answer: unknown; unit: string | null; type: string };

export type Drawing = { path: string; source: string; view: string; questions: KeyQuestion[] };
