export const METHOD_COLOR: Record<string, string> = {
  ifc: "#a79df7",
  vector: "#f9a77a",
  detector: "#ff7b7b",
  vlm: "#c3c3cc",
  none: "#7f93ad",
};

const UNIT: Record<string, string> = { m2: "m²", m3: "m³", m: "m", ft2: "ft²", count: "" };

export function fmtValue(v: unknown, unit: string | null): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    const s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
    return `${s}${unit && UNIT[unit] ? " " + UNIT[unit] : ""}`;
  }
  return String(v);
}

export const fmtEur = (e: number) => (e === 0 ? "€0" : e < 0.001 ? `€${e.toExponential(1)}` : `€${e.toFixed(4)}`);

export const SOURCE_LABEL: Record<string, string> = {
  swiss_dwellings: "Swiss · vector",
  cubicasa5k: "CubiCasa · scans",
  ifc_models: "IFC · BIM",
  ifc_bench: "IFC bench",
  opening_design: "US sheets",
};

export const shortName = (path: string) => path.split("/").pop() ?? path;

const PREFIX: Record<string, string> = {
  swiss_dwellings: "SW", cubicasa5k: "CC", ifc_models: "BIM", ifc_bench: "IB", opening_design: "US",
};

/** Title-block style sheet number, e.g. SW-001, stable per source. */
export function sheetCode(paths: string[], path: string, source: string): string {
  const same = paths.filter((p) => p.split("/")[1] === source);
  return `${PREFIX[source] ?? "XX"}-${String(same.indexOf(path) + 1).padStart(3, "0")}`;
}

// Measured whole-sheet baseline (Gemma 4 12B, LOG 14 Nov): EUR 0.003–0.005 per answer.
export const BASELINE_EUR = 0.004;
