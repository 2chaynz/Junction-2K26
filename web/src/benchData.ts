// Every number here comes from a scored run; sources per board. Same questions for every model on a board.

export type Maker = "sitelens" | "google" | "nvidia" | "anthropic" | "openai";

export type Model = {
  id: string;
  name: string;
  maker: Maker;
  makerName: string;
  reads: string; // how it reads a drawing, one line
};

export const MODELS: Record<string, Model> = {
  sitelens: { id: "sitelens", name: "Sindri", maker: "sitelens", makerName: "us",
    reads: "Reads the file's own data first (text, lines, model properties); a trained detector for scans; AI last." },
  "gemini-3.8-flash": { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", maker: "google", makerName: "Google",
    reads: "Sees the whole sheet as one image and answers from the picture." },
  "gemini-3.5-flash": { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", maker: "google", makerName: "Google",
    reads: "Sees the whole sheet as one image and answers from the picture." },
  "gemini-3.1-pro": { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", maker: "google", makerName: "Google",
    reads: "Sees the whole sheet as one image and answers from the picture." },
  "gemma-4-31b": { id: "gemma-4-31b", name: "Gemma 4 31B", maker: "google", makerName: "Google · open weights",
    reads: "Open-weights vision model; sees the whole sheet as one image." },
  nemotron: { id: "nemotron", name: "Nemotron 3.5 Super VL", maker: "nvidia", makerName: "NVIDIA · open weights",
    reads: "Open-weights vision model (hosted by Verda); sees the whole sheet as one image." },
  "claude-fable-5": { id: "claude-fable-5", name: "Claude Fable 5", maker: "anthropic", makerName: "Anthropic",
    reads: "Sees the whole sheet as one image and answers from the picture." },
  "gpt-5.5": { id: "gpt-5.5", name: "GPT-5.5", maker: "openai", makerName: "OpenAI",
    reads: "Sees the whole sheet as one image and answers from the picture." },
};

export type Entry = { model: string; acc: number | null; cost: string; note?: string };

export type Board = {
  id: string;
  tab: string;
  title: string;
  n: string; // what was asked
  source: string; // where the numbers come from
  takeaway: string;
  metrics?: { id: string; label: string; entries: Entry[] }[];
  entries?: Entry[];
};

export const BOARDS: Board[] = [
  {
    id: "vector",
    tab: "Vector plans",
    title: "Swiss apartment plans (vector PDF)",
    n: "40 questions · Stoa's held-out dev split · identical for every model",
    source: "eval.score --split dev --source swiss_dwellings --limit 40 (T20 run for the models, Sat 14 Nov)",
    takeaway: "The answer is in the file. Sindri reads it exactly; a vision model has to guess it from pixels.",
    entries: [
      { model: "sitelens", acc: 100, cost: "€0" },
      { model: "gemini-3.8-flash", acc: 60, cost: "€0.021" },
      { model: "nemotron", acc: 30, cost: "€0.0005" },
      { model: "gemma-4-31b", acc: null, cost: "—", note: "not run: 57 s per answer on the free tier" },
    ],
  },
  {
    id: "scans",
    tab: "Scanned plans",
    title: "Scanned Finnish plans (CubiCasa5K images)",
    n: "40 questions · Stoa's held-out dev split · identical for every model",
    source: "eval.score --split dev --source cubicasa5k --limit 40 (T20 run for the models, Sat 14 Nov)",
    takeaway: "On pictures, our detector still wins: it was trained for floor-plan symbols and runs on a laptop CPU.",
    entries: [
      { model: "sitelens", acc: 95, cost: "€0.00001" },
      { model: "gemini-3.8-flash", acc: 85, cost: "€0.0045" },
      { model: "gemma-4-31b", acc: 57.5, cost: "free tier", note: "57 s per answer" },
      { model: "nemotron", acc: 52.5, cost: "€0.0002" },
    ],
  },
  {
    id: "aecv",
    tab: "Outside benchmark",
    title: "AECV-Bench: 120 French plans we never trained on",
    n: "Object counts, exact match · 120 plans · public leaderboard numbers for the models",
    source: "eval/aecv_report.md (T17); model rows from the AECV-Bench paper",
    takeaway:
      "Symbols (doors, windows): on par with frontier models for a tiny fraction of the cost. Room types (bedrooms, " +
      "toilets): models win by reading the room names; that's what our room-label OCR is for.",
    metrics: [
      { id: "window", label: "Windows", entries: [
        { model: "sitelens", acc: 41, cost: "€0.006" }, { model: "gemini-3.5-flash", acc: 39, cost: "$3.77" },
        { model: "gemini-3.1-pro", acc: 33, cost: "n/a" }, { model: "claude-fable-5", acc: 29, cost: "$9.22" },
        { model: "gpt-5.5", acc: 28, cost: "$26.88" }, { model: "gemma-4-31b", acc: 13, cost: "$0.02" } ] },
      { id: "door", label: "Doors", entries: [
        { model: "gemini-3.5-flash", acc: 43, cost: "$3.77" }, { model: "sitelens", acc: 37, cost: "€0.006" },
        { model: "claude-fable-5", acc: 36, cost: "$9.22" }, { model: "gemini-3.1-pro", acc: 34, cost: "n/a" },
        { model: "gpt-5.5", acc: 30, cost: "$26.88" }, { model: "gemma-4-31b", acc: 22, cost: "$0.02" } ] },
      { id: "bedroom", label: "Bedrooms", entries: [
        { model: "gemini-3.5-flash", acc: 93, cost: "$3.77" }, { model: "claude-fable-5", acc: 93, cost: "$9.22" },
        { model: "gpt-5.5", acc: 92, cost: "$26.88" }, { model: "gemini-3.1-pro", acc: 91, cost: "n/a" },
        { model: "gemma-4-31b", acc: 80, cost: "$0.02" }, { model: "sitelens", acc: 53, cost: "€0.006" } ] },
      { id: "toilet", label: "Toilets", entries: [
        { model: "gemini-3.5-flash", acc: 82, cost: "$3.77" }, { model: "gemini-3.1-pro", acc: 82, cost: "n/a" },
        { model: "claude-fable-5", acc: 82, cost: "$9.22" }, { model: "gemma-4-31b", acc: 78, cost: "$0.02" },
        { model: "gpt-5.5", acc: 77, cost: "$26.88" }, { model: "sitelens", acc: 66, cost: "€0.006" } ] },
    ],
  },
];

// Sindri alone on Stoa's held-out dev split (preview set; the detector never trained on these plans).
// video/numbers.json, run Sat 14 Nov ~21:00.
export const HELD_OUT = [
  { label: "BIM models (IFC)", n: 394, acc: 100 },
  { label: "Swiss vector plans", n: 626, acc: 97.44 },
  { label: "Schedule sheets", n: 17, acc: 94.12 },
  { label: "Scanned plans", n: 816, acc: 83.58 },
];
