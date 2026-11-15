import { DEMO, shortName } from "./format";
import type { Drawing, Msg } from "./types";

// A project is what a site team works in: one building (BIM model + its plans), one sheet set,
// or a portfolio / archive of stand-alone plans. Each has typed subfolders and its own Ask sessions.

export type Kind = "BIM" | "Sheet set" | "Portfolio" | "Archive";
export type Folder = { key: string; label: string; code: string; items: Drawing[] };
export type Proj = {
  key: string; name: string; kind: Kind; org: string;
  folders: Folder[]; items: Drawing[]; cover: Drawing | null;
  plans: number; models: number; questions: number; featured: boolean;
  created?: number; // imported projects: when, for newest-first
};

export const KIND_LABEL: Record<Kind, string> = {
  BIM: "BIM model", "Sheet set": "Sheet set", Portfolio: "Housing portfolio", Archive: "Plan archive",
};

const ORG: Record<string, string> = {
  bsc: "buildingSMART sample", kit: "KIT Karlsruhe", rwth: "RWTH Aachen", bimspeed: "BIMspeed", tuwien: "TU Wien",
};

// Same building under two spellings (ifc_models vs ifc_bench).
const ALIAS: Record<string, string> = { fzkhouse: "fzkhaus" };
const NAME: Record<string, string> = {
  fzkhaus: "FZK-Haus", digitalhub: "Digital Hub", sixty5: "Sixty5", ac20: "AC20 Institute", "4351": "Project 4351",
  hitos: "HITOS", ettenheimgis: "Ettenheim GIS", ctr: "CTR",
};

// US National CAD Standard discipline letters, which sheet numbers and model names use.
const DISC: [RegExp, string, string][] = [
  [/\b(str|structural|structure)\b/, "S", "Structure"],
  [/\b(hvac|mep|heating|ventilation|mechanical)\b/, "M", "Mechanical"],
  [/\b(electrical|elec)\b/, "E", "Electrical"],
  [/\b(plumbing|san|sanitary)\b/, "P", "Plumbing"],
  [/\b(city|gis|site)\b/, "C", "Site"],
];
const discipline = (s: string): [string, string] => {
  const t = s.toLowerCase().replace(/[_-]+/g, " ");
  for (const [re, c, l] of DISC) if (re.test(t)) return [c, l];
  return ["A", "Architecture"];
};

const norm = (s: string) => {
  const k = s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return ALIAS[k] ?? k;
};
const titleCase = (s: string) => s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const isModel = (d: Drawing) => d.path.toLowerCase().endsWith(".ifc");

type Place = { key: string; name: string; kind: Kind; org: string; folder: [string, string, string] };

const BENCH_DISC = /_(arc|str|mep|heating|plumbing|ventilation|electrical|city)$/;

/** Project and subfolder of one drawing. */
function place(d: Drawing): Place {
  const name = shortName(d.path);
  if (d.source === "uploads" && d.project) {
    const t = name.toLowerCase();
    const [c, l] = discipline(name);
    const folder: [string, string, string] = isModel(d) ? [`m-${c}`, l, c]
      : /\.(png|jpe?g)$/i.test(d.path) ? ["scan", "Scans", "SC"]
      : /schedule/.test(t) ? ["sch", "Schedules", "SCH"]
      : /elevation/.test(t) ? ["elev", "Elevations", "EL"]
      : /section/.test(t) ? ["sec", "Sections", "SEC"]
      : ["sheets", "Sheets", "SH"];
    return { key: d.project.key, name: d.project.name, kind: "Sheet set", org: "Imported", folder };
  }
  if (d.source === "ifc_models") {
    const base = name.replace(/_plan-.*$/, "");
    const [orgBldg, model = ""] = base.split(/_(.*)/);
    const org = orgBldg.split("-")[0];
    const bldg = orgBldg.slice(org.length + 1) || orgBldg;
    const k = norm(bldg);
    const folder: [string, string, string] = isModel(d)
      ? [`m-${discipline(model)[0]}`, discipline(model)[1], discipline(model)[0]]
      : [`plans-${model}`, "Floor plans", "FP"];
    return { key: `bim/${k}`, name: NAME[k] ?? titleCase(bldg), kind: "BIM", org: ORG[org] ?? org, folder };
  }
  if (d.source === "ifc_bench") {
    const m = name.match(BENCH_DISC);
    const bldg = m ? name.slice(0, -m[0].length) : name;
    const k = norm(bldg);
    const [c, l] = discipline(m?.[1] ?? "");
    return { key: `bim/${k}`, name: NAME[k] ?? titleCase(bldg), kind: "BIM", org: "IFC benchmark", folder: [`m-${c}`, l, c] };
  }
  if (d.source === "opening_design") {
    const [, , dir = "Sheets", set = ""] = d.path.split("/");
    const t = name.toLowerCase();
    const folder: [string, string, string] = /schedule/.test(t) ? ["sch", "Schedules", "SCH"]
      : /elevation/.test(t) ? ["elev", "Elevations", "EL"]
      : /section/.test(t) ? ["sec", "Sections", "SEC"]
      : /plan/.test(t) ? ["plan", "Plans", "FP"]
      : ["det", "Details & enlarged plans", "DET"];
    return { key: `set/${norm(dir)}`, name: NAME[norm(dir)] ?? titleCase(dir), kind: "Sheet set", org: set, folder };
  }
  if (d.source === "swiss_dwellings") {
    const site = Number(name.match(/^site(\d+)/)?.[1] ?? 0);
    const lo = Math.floor(site / 1000) * 1000;
    return {
      key: "portfolio/swiss", name: "Swiss Dwellings", kind: "Portfolio", org: "Residential floor plans, Switzerland",
      folder: [`s${String(lo).padStart(5, "0")}`, `Sites ${lo}–${lo + 999}`, "SW"],
    };
  }
  const cat = name.replace(/-?\d+$/, "");
  const label = cat === "colorful" ? "Colour plans" : cat === "high_quality" ? "High quality scans" : "Architectural scans";
  return { key: "archive/cubicasa", name: "CubiCasa Plan Archive", kind: "Archive", org: "Scanned apartment plans, Finland", folder: [cat, label, "SC"] };
}

const memo = new WeakMap<Drawing, Place>();
const placeOf = (d: Drawing) => {
  let p = memo.get(d);
  if (!p) memo.set(d, (p = place(d)));
  return p;
};

export const projectKeyOf = (d: Drawing) => placeOf(d).key;

const KIND_ORDER: Kind[] = ["BIM", "Sheet set", "Portfolio", "Archive"];
const FOLDER_ORDER = ["FP", "SH", "A", "S", "M", "E", "P", "C", "SCH", "EL", "SEC", "DET", "SC"];

export function buildProjects(drawings: Drawing[]): Proj[] {
  const m = new Map<string, Proj & { _f: Map<string, Folder> }>();
  for (const d of drawings) {
    const pl = placeOf(d);
    let p = m.get(pl.key);
    if (!p) {
      p = { key: pl.key, name: pl.name, kind: pl.kind, org: pl.org, folders: [], items: [], cover: null,
        plans: 0, models: 0, questions: 0, featured: false, _f: new Map() };
      m.set(pl.key, p);
    }
    if (p.org === "IFC benchmark") p.org = pl.org; // the real author beats the benchmark that re-published it
    if (d.project) p.created = d.project.created;
    p.items.push(d);
    p.questions += d.questions.length;
    isModel(d) ? p.models++ : p.plans++;
    if (DEMO.includes(d.path)) p.featured = true;
    const [fk, fl, code] = pl.folder;
    const f = p._f.get(fk) ?? { key: `${pl.key}#${fk}`, label: fl, code, items: [] };
    f.items.push(d);
    p._f.set(fk, f);
  }
  const out: Proj[] = [];
  for (const { _f, ...p } of m.values()) {
    const folders = [..._f.values()];
    // Two plan sets of one building (e.g. before / project) keep their model name.
    const planSets = folders.filter((f) => f.code === "FP" && p.kind === "BIM");
    if (planSets.length > 1)
      for (const f of planSets) f.label = `Floor plans · ${f.key.split("#plans-")[1] || "model"}`;
    folders.sort((a, b) => FOLDER_ORDER.indexOf(a.code) - FOLDER_ORDER.indexOf(b.code) || a.label.localeCompare(b.label, "en", { numeric: true }));
    const demo = p.items.find((d) => DEMO.includes(d.path));
    p.cover = demo ?? p.items.find((d) => !isModel(d)) ?? p.items[0] ?? null;
    if (p.created && p.models) p.kind = "BIM"; // an import with a model is a building
    out.push({ ...p, folders });
  }
  // Your own imports first, newest on top: you just made them.
  return out.sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || Number(b.featured) - Number(a.featured) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.items.length - a.items.length);
}

/** Thumbnail source for a drawing: its plan, or the plan rendered from an IFC model. */
export const thumbOf = (d: Drawing | null) => (d && !d.view.toLowerCase().endsWith(".ifc") ? d.view : null);

// Recently opened projects and the sheet last open in each. Per browser; sessions live on the server.
const RECENT = "sitelens.recent";
export type Recent = Record<string, { t: number; path: string }>;
export function getRecent(): Recent {
  try {
    return JSON.parse(localStorage.getItem(RECENT) || "{}");
  } catch {
    return {};
  }
}
export function touchRecent(key: string, path: string) {
  try {
    const r = getRecent();
    r[key] = { t: Date.now(), path };
    localStorage.setItem(RECENT, JSON.stringify(r));
  } catch {}
}

// Sessions API (CONTRACT.md → Demo API).
export type SessionSummary = {
  id: string; title: string; created: number; updated: number; questions: number; paths: string[];
  last: { question: string; value: unknown; unit: string | null } | null;
};
export type Session = { id: string; title?: string; msgs: Msg[]; updated: number };
export type Overview = Record<string, { sessions: number; updated: number }>;

const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

export async function listSessions(project: string): Promise<SessionSummary[]> {
  const r = await fetch(`/api/sessions?${q({ project })}`);
  return r.ok ? r.json() : [];
}
export async function sessionsOverview(): Promise<Overview> {
  const r = await fetch("/api/sessions");
  return r.ok ? r.json() : {};
}
export async function getSession(project: string, id: string): Promise<Session> {
  const r = await fetch(`/api/session?${q({ project, id })}`);
  if (!r.ok) throw new Error(`session: ${r.status}`);
  return r.json();
}
export async function saveSession(project: string, id: string, msgs: Msg[], title?: string): Promise<SessionSummary> {
  const r = await fetch("/api/session", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify(title === undefined ? { project, id, msgs } : { project, id, msgs, title }),
  });
  if (!r.ok) throw new Error(`session: ${r.status}`);
  return r.json();
}
export async function deleteSession(project: string, id: string) {
  await fetch(`/api/session?${q({ project, id })}`, { method: "DELETE" });
}

export const newSessionId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** "just now", "12 min ago", "3 h ago", "yesterday", "12 Nov". t in seconds or ms. */
export function ago(t: number): string {
  const ms = t < 1e12 ? t * 1000 : t;
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 2 * 86400) return "yesterday";
  return new Date(ms).toLocaleDateString("en", { day: "numeric", month: "short" });
}

/** Today / Yesterday / Last 7 days / Older, like chat histories. */
export function bucket(t: number): string {
  const ms = t < 1e12 ? t * 1000 : t;
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const d0 = day.getTime();
  if (ms >= d0) return "Today";
  if (ms >= d0 - 86400e3) return "Yesterday";
  if (ms >= d0 - 7 * 86400e3) return "Last 7 days";
  return "Older";
}

/** Short sheet name inside its project: the project prefix is already on screen. */
export function sheetName(d: Drawing): string {
  const name = shortName(d.path);
  if (d.title) return d.title; // server: storey name in English
  if (d.source === "ifc_models") {
    const plan = name.match(/_plan-(\d+)-(.+)$/);
    if (plan) return `${plan[1]} · ${plan[2].replace(/-/g, " ")}`;
    return name.split(/_(.*)/)[1] || name;
  }
  if (d.source === "ifc_bench") return name.replace(/_/g, " ");
  if (d.source === "swiss_dwellings") {
    const m = name.match(/^site(\d+)_bldg(\d+)_floor(\d+)/);
    if (m) return `Site ${m[1]} · floor ${m[3]}`;
  }
  if (d.source === "cubicasa5k") return `Plan ${name.match(/(\d+)$/)?.[1] ?? name}`;
  return name;
}
