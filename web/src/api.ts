import type { Answer, Drawing } from "./types";

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
  return r.json();
}
