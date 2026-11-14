import type { Answer, Drawing, Mark, Step } from "./types";

export const fileUrl = (path: string, scale = 1, page = 0) =>
  `/api/file?path=${encodeURIComponent(path)}&page=${page}&scale=${scale}`;

export const isImage = (path: string) => /\.(png|jpe?g)$/i.test(path);

// PDFs are rendered at RENDER_SCALE px per point; image evidence is already in pixels.
export const RENDER_SCALE = 2;
export const viewScale = (path: string) => (isImage(path) ? 1 : RENDER_SCALE);

export async function getDrawings(): Promise<Drawing[]> {
  const r = await fetch("/api/drawings");
  if (!r.ok) throw new Error(`drawings: ${r.status}`);
  return r.json();
}

export async function ask(path: string, question: string): Promise<Answer> {
  const r = await fetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, question }),
  });
  if (!r.ok) throw new Error(`ask: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function surprise(): Promise<{ path: string; question: string }> {
  const r = await fetch("/api/random");
  if (!r.ok) throw new Error(`random: ${r.status}`);
  return r.json();
}

// Same as ask(), but reports each reasoning step as the server takes it.
export async function askStream(path: string, question: string, onStep: (s: Step) => void, region?: Mark | null): Promise<Answer> {
  const r = await fetch("/api/ask/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(region ? { path, question, region } : { path, question }),
  });
  if (!r.ok || !r.body) throw new Error(`ask: ${r.status} ${await r.text()}`);
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const m = JSON.parse(line);
      if (m.step) onStep(m.step);
      else if (m.answer) return m.answer;
      else if (m.error) throw new Error(m.error);
    }
  }
  throw new Error("ask: stream ended without an answer");
}
