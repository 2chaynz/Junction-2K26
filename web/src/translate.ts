// English for strings the browser reads itself (IFC storeys, properties, names). Server answers arrive translated.
const cache = new Map<string, string>();

const worth = (s: string) => /[^\W\d_]{2,}/u.test(s);

export async function toEnglish(texts: string[]): Promise<string[]> {
  const todo = [...new Set(texts.filter((t) => worth(t) && !cache.has(t)))];
  if (todo.length) {
    try {
      const r = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texts: todo }),
      });
      if (r.ok) {
        const { texts: out } = (await r.json()) as { texts: string[] };
        todo.forEach((t, i) => cache.set(t, out[i] ?? t));
      }
    } catch {
      // offline or rate-limited: show the original text
    }
  }
  return texts.map((t) => cache.get(t) ?? t);
}
