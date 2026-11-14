// POST /api/ask {question} -> {answer, picks: [{id, why}]}. Runs inside the Vite server so the
// Gemini key never reaches the browser. Retrieval: query embedding vs .cache/embeddings.json
// (written by scripts/embed.mjs), then Gemini picks and explains from the top matches.
import { existsSync, readFileSync, statSync } from 'node:fs'

const MODEL = 'gemini-3.8-flash'
const EMBED_MODEL = 'gemini-embedding-001'
const EMBED_DIM = 768
const SHORTLIST = 30
const API = 'https://generativelanguage.googleapis.com/v1beta/models'

const file = (p) => new URL(`../${p}`, import.meta.url)
const loaded = new Map()
// Re-read a file only when it changed: summaries and embeddings get rebuilt while the server runs.
function json(p, fallback) {
  if (!existsSync(file(p))) return fallback
  const mtime = statSync(file(p)).mtimeMs
  const hit = loaded.get(p)
  if (hit?.mtime === mtime) return hit.value
  const value = JSON.parse(readFileSync(file(p), 'utf8'))
  loaded.set(p, { mtime, value })
  return value
}

async function gemini(key, path, body) {
  const res = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json()
  if (!res.ok) throw new Error(`gemini ${res.status}: ${out.error?.message}`)
  return out
}

export async function ask(question, key) {
  const startups = json('src/data/startups.json', [])
  const summaries = json('src/data/summaries.json', {})
  const vectors = json('.cache/embeddings.json', null)
  if (!vectors) throw new Error('no embeddings yet: run node scripts/embed.mjs')

  const { embedding } = await gemini(key, `${EMBED_MODEL}:embedContent`, {
    content: { parts: [{ text: question }] }, taskType: 'RETRIEVAL_QUERY', outputDimensionality: EMBED_DIM,
  })
  const n = Math.hypot(...embedding.values) || 1
  const q = embedding.values.map((x) => x / n)
  const seen = new Set()
  const shortlist = startups
    .filter((s) => vectors[s.id] && !seen.has(s.id) && seen.add(s.id))
    .map((s) => ({ s, score: vectors[s.id].v.reduce((a, x, i) => a + x * q[i], 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SHORTLIST)
    .map(({ s }) => ({
      id: s.id, name: s.name, sector: s.sector, country: s.country, founded: s.founded,
      funding: s.funding ?? undefined, investors: s.investors.map((i) => i.name).slice(0, 5),
      about: summaries[s.id]?.summary ?? s.description,
    }))

  const out = await gemini(key, `${MODEL}:generateContent`, {
    systemInstruction: { parts: [{ text: 'You help angel investors find Nordic and Baltic startups on a map. Answer only from the candidate list. Be direct: 1-3 sentences, no hype. If nothing fits, say so and suggest the closest ones.' }] },
    contents: [{ parts: [{ text: `Question: ${question}\n\nCandidates (JSON):\n${JSON.stringify(shortlist)}` }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          answer: { type: 'STRING' },
          picks: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, why: { type: 'STRING' } }, required: ['id', 'why'] } },
        },
        required: ['answer', 'picks'],
      },
    },
  })
  const parsed = JSON.parse(out.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || '{}')
  const valid = new Set(shortlist.map((s) => s.id))
  return { answer: parsed.answer ?? '', picks: (parsed.picks ?? []).filter((p) => valid.has(p.id)).slice(0, 8), model: MODEL }
}

// Vite plugin: same endpoint in `vite` and `vite preview`.
export function askPlugin(key) {
  const handler = async (req, res, next) => {
    if (req.url !== '/api/ask' || req.method !== 'POST') return next()
    let raw = ''
    for await (const chunk of req) raw += chunk
    res.setHeader('Content-Type', 'application/json')
    try {
      const question = String(JSON.parse(raw || '{}').question ?? '').trim().slice(0, 500)
      if (!key) throw new Error('GEMINI_API_KEY missing in .env')
      if (!question) throw new Error('empty question')
      res.end(JSON.stringify(await ask(question, key)))
    } catch (e) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: e.message }))
    }
  }
  return {
    name: 'ask-api',
    configureServer: (server) => { server.middlewares.use(handler) },
    configurePreviewServer: (server) => { server.middlewares.use(handler) },
  }
}
