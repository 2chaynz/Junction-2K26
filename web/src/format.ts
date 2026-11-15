import type { Answer, Drawing } from "./types";
import script from "./demoScript.json";

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

// Final demo (T96): featured drawings in demo order, each with verified role-tagged questions.
export type Chip = { q: string; role?: string };
type Scripted = { project: string; path: string; chips: (Chip & { expect: unknown; method?: string })[] };
export const SCRIPT = script as Scripted[];
export const DEMO = SCRIPT.map((s) => s.path);

export const shortName = (path: string) => (path.split("/").pop() ?? path).replace(/\.(pdf|png|jpe?g|ifc)$/i, "");

// Stoa has no language field. Match the English openings used in its question sets.
export const isEnglishQuestion = (question: string): boolean =>
  /^(?:how|what|which|who|where|when|why|is|are|does|do|can|could|would|on sheet)\b/i.test(question.trimStart());

export function pickChips(d: Drawing | undefined, n = 3): Chip[] {
  if (!d) return [];
  const scripted = SCRIPT.find((s) => s.path === d.path);
  if (scripted) return scripted.chips.map(({ q, role }) => ({ q, role }));
  const pool = d.questions.filter((q) => isEnglishQuestion(q.question));
  const out: string[] = [];
  const types = new Set<string>();
  for (const q of pool) if (!types.has(q.type) && out.length < n) (types.add(q.type), out.push(q.question));
  for (const q of pool) if (!out.includes(q.question) && out.length < n) out.push(q.question);
  return out.map((q) => ({ q }));
}

export const SOURCE_LABEL: Record<string, string> = {
  swiss_dwellings: "Swiss Dwellings · vector PDF",
  cubicasa5k: "CubiCasa5K · scanned plan",
  ifc_models: "BIM model · IFC",
  ifc_bench: "IFC benchmark model",
  opening_design: "Opening Design · US sheet set",
  uploads: "Imported by you",
};

const PREFIX: Record<string, string> = {
  swiss_dwellings: "SW", cubicasa5k: "CC", ifc_models: "BIM", ifc_bench: "IB", opening_design: "US", uploads: "IMP",
};

/** Title-block style sheet number, e.g. SW-001, stable per source. */
export function sheetCode(paths: string[], path: string, source: string): string {
  // Imports number per project (their folder), not across every upload.
  const dir = path.slice(0, path.lastIndexOf("/") + 1);
  const same = paths.filter((p) => (source === "uploads" ? p.startsWith(dir) : p.split("/")[1] === source));
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

export type Project = { key: string; label: string; floor: number | null };

const titleCase = (s: string) => s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Which project (building, model, sheet set) a drawing belongs to. null = a stand-alone plan. */
export function projectOf(d: Drawing): Project | null {
  const name = shortName(d.path);
  if (d.source === "swiss_dwellings") {
    const m = name.match(/^site(\d+)_bldg(\d+)_floor(\d+)/);
    return m ? { key: `sw/${m[1]}/${m[2]}`, label: `Site ${m[1]} · Building ${m[2]}`, floor: Number(m[3]) } : null;
  }
  if (d.source === "ifc_models" || d.source === "ifc_bench") {
    const plan = name.match(/^(.+)_plan-(-?\d+)(?:-|$)/);
    const model = name.replace(/_plan-.*$/, "");
    return { key: `ifc/${model}`, label: model.replace(/^bsc-/, ""), floor: plan ? Number(plan[2]) : null };
  }
  if (d.source === "opening_design") {
    const dir = d.path.split("/")[2];
    return dir ? { key: `od/${dir}`, label: titleCase(dir), floor: null } : null;
  }
  return null;
}

/** 2D floor sheets of the same project, ordered by their floor identifiers. */
export function floorsOf(drawings: Drawing[], path: string): Drawing[] {
  const d = drawings.find((x) => x.path === path);
  const p = d && projectOf(d);
  if (!p || p.floor === null) return [];
  // File names carry no level number; floor id order is the best guess at bottom-up.
  // One plate per floor even when a floor has questions in several formats; the open file wins, then its format.
  const ext = (x: Drawing) => x.path.split(".").pop()!.toLowerCase();
  const rank = (x: Drawing) => (x.path === path ? 0 : ext(x) === ext(d) ? 1 : ext(x) === "pdf" ? 2 : ext(x) === "png" ? 3 : 4);
  const best = new Map<number, Drawing>();
  for (const x of drawings) {
    const f = projectOf(x);
    if (f?.key !== p.key || f.floor === null) continue;
    const cur = best.get(f.floor);
    if (!cur || rank(x) < rank(cur)) best.set(f.floor, x);
  }
  return best.size > 1 ? [...best.entries()].sort((a, b) => a[0] - b[0]).map(([, x]) => x) : [];
}
