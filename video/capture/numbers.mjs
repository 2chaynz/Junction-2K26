// Builds public/numbers.json for the numbers scene from results files (nothing typed by hand).
//   node capture/numbers.mjs [results-name]    default: video-dev  (eval/results/<name>.jsonl, from `python -m eval.score --name video-dev`)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const name = process.argv[2] ?? "video-dev";
const rows = readFileSync(root(`eval/results/${name}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const LABEL = { swiss_dwellings: "Swiss vector plans", cubicasa5k: "Scanned plans (detector)", ifc_models: "BIM models (IFC)", opening_design: "Schedule sheets" };
const by = {};
for (const r of rows) {
  const src = r.q.path.split("/")[1];
  if (r.correct === null || r.correct === undefined) continue; // text answers are not auto-graded
  by[src] ??= { n: 0, ok: 0 };
  by[src].n += 1; by[src].ok += r.correct ? 1 : 0;
}
const sources = Object.entries(LABEL).filter(([k]) => by[k]?.n).map(([k, label]) => ({ label, n: by[k].n, acc: by[k].ok / by[k].n }));
const v = JSON.parse(readFileSync(root("web/public/versus.json"), "utf8"));
// overall accuracy + cost per answer over every graded answer in the results file
const graded = rows.filter((r) => r.correct !== null && r.correct !== undefined);
const overall = { n: graded.length, acc: graded.filter((r) => r.correct).length / graded.length,
  eurPerAnswer: rows.reduce((a, r) => a + (r.a.cost_eur ?? 0), 0) / rows.length };
// the hook drawing: the Swiss door question where the frontier model is wrong (same row as in versus.json)
const hr = v.rows.find((r) => r.path.includes("site2292_bldg3379_floor15050") && /doors/i.test(r.question));
const hook = { truth: hr.truth, ours: hr.ours.value, vlm: hr.vlm.value, model: "Gemini 3.8 Flash" };
const out = {
  sources,
  overall,
  hook,
  versus: { ours: v.summary.ours, vlm: v.summary.vlm, model: "Gemini 3.8 Flash" },
  note: `Sources: eval/results/${name}.jsonl (dev split of Stoa's preview set; the detector never trained on these plans) and web/public/versus.json.`,
};
writeFileSync(fileURLToPath(new URL("../public/numbers.json", import.meta.url)), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.sources.map((s) => `${s.label} ${(s.acc * 100).toFixed(1)}% of ${s.n}`), null, 1));
