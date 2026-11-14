import type { Answer, Drawing } from "./types";

const UNIT: Record<string, string> = { m2: "m²", m3: "m³", m: "m", ft2: "ft²", count: "" };

export function fmtValue(v: unknown, unit: string | null): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    const s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
    return `${s}${unit && UNIT[unit] ? " " + UNIT[unit] : ""}`;
  }
  return String(v);
}

/** "4 WCs" when every hit has the same short label, else the plain value. */
export function fmtAnswer(a: Answer): string {
  const base = fmtValue(a.value, a.unit);
  // Detector labels carry a score ("door 0.87"); the noun is the part before it.
  const labels = new Set(a.evidence.map((e) => e.label.replace(/\s+\d+(\.\d+)?$/, "")));
  const [l] = [...labels];
  if (a.unit === "count" && typeof a.value === "number" && labels.size === 1 && l && l.length < 16 && !/\d|·/.test(l))
    return `${base} ${a.value === 1 ? l : l.endsWith("s") ? l : l + "s"}`;
  return base;
}

export const fmtEur = (e: number) => (e === 0 ? "€0" : e < 0.001 ? `€${e.toPrecision(1)}` : `€${e.toFixed(3)}`);
export const fmtTime = (s: number) => (s < 0.1 ? `${Math.max(1, Math.round(s * 1000))}ms` : `${s.toFixed(s < 1 ? 2 : 1)}s`);

export const METHOD_NAME: Record<string, string> = {
  ifc: "IFC", vector: "vector", schedule: "schedule", detector: "detector", facts: "facts", diff: "revision diff",
  vlm: "VLM", general: "general", none: "none", takeoff: "takeoff", crosscheck: "cross-check",
};

export const GROUPS: { source: string[]; label: string }[] = [
  { source: ["cubicasa5k"], label: "Scanned plans" },
  { source: ["swiss_dwellings"], label: "Vector plans" },
  { source: ["ifc_models", "ifc_bench"], label: "BIM models" },
  { source: ["opening_design"], label: "Schedules" },
];

export const TYPE: Record<string, string> = {
  cubicasa5k: "PNG", swiss_dwellings: "PDF", ifc_models: "IFC", ifc_bench: "IFC", opening_design: "PDF",
};

// One per type. The first one opens on load.
export const DEMO = [
  "data/swiss_dwellings/site418_bldg1080_floor4724.pdf",
  "data/cubicasa5k/colorful-2002.png",
  "data/ifc_models/bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus.pdf",
  "data/ifc_models/bsc-molio_molio-with-uris.ifc",
  "data/opening_design/Sports_Complex/Sheets - Current Set/A-801 - Door and Finish Schedules & Wall Types.pdf",
];

export const shortName = (path: string) => (path.split("/").pop() ?? path).replace(/\.(pdf|png|jpe?g|ifc)$/i, "");

/** Three varied Stoa questions, English first. */
export function pickChips(d: Drawing | undefined, n = 3): string[] {
  if (!d) return [];
  const en = d.questions.filter((q) => /^(how|what|which|is|are|does|do)\b/i.test(q.question));
  const pool = en.length >= n ? en : d.questions;
  const out: string[] = [];
  const types = new Set<string>();
  for (const q of pool) if (!types.has(q.type) && out.length < n) (types.add(q.type), out.push(q.question));
  for (const q of pool) if (!out.includes(q.question) && out.length < n) out.push(q.question);
  return out;
}

export const SOURCE_LABEL: Record<string, string> = {
  swiss_dwellings: "Swiss Dwellings · vector PDF",
  cubicasa5k: "CubiCasa5K · scanned plan",
  ifc_models: "BIM model · IFC",
  ifc_bench: "IFC benchmark model",
  opening_design: "Opening Design · US sheet set",
};

const PREFIX: Record<string, string> = {
  swiss_dwellings: "SW", cubicasa5k: "CC", ifc_models: "BIM", ifc_bench: "IB", opening_design: "US",
};

/** Title-block style sheet number, e.g. SW-001, stable per source. */
export function sheetCode(paths: string[], path: string, source: string): string {
  const same = paths.filter((p) => p.split("/")[1] === source);
  return `${PREFIX[source] ?? "XX"}-${String(same.indexOf(path) + 1).padStart(3, "0")}`;
}

const PAPER: [string, number, number][] = [["A0", 841, 1189], ["A1", 594, 841], ["A2", 420, 594], ["A3", 297, 420], ["A4", 210, 297], ["ARCH D", 610, 914], ["ARCH E", 914, 1219], ["Letter", 216, 279], ["Tabloid", 279, 432]];

/** "420 × 297 mm · A3 landscape" for PDFs (size in points), "1240 × 980 px" for images. */
export function fmtSize(path: string, w: number, h: number): string {
  if (/\.(png|jpe?g)$/i.test(path)) return `${Math.round(w)} × ${Math.round(h)} px`;
  const mw = (w * 25.4) / 72, mh = (h * 25.4) / 72;
  const [a, b] = [Math.min(mw, mh), Math.max(mw, mh)];
  const fit = PAPER.find(([, pw, ph]) => Math.abs(pw - a) < 6 && Math.abs(ph - b) < 6);
  return `${Math.round(mw)} × ${Math.round(mh)} mm${fit ? ` · ${fit[0]} ${mw > mh ? "landscape" : "portrait"}` : ""}`;
}
