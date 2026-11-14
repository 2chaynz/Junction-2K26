// POST /api/ask {question} -> {answer, picks: [{id, why}]}: Gemini picks from our map (query
// embedding vs .cache/embeddings.json, from scripts/embed.mjs).
// POST /api/cala {question} -> {answer, sources, entities}: Cala's live, sourced answer. Separate
// because Cala takes up to a minute; the map answer must not wait for it.
// Both run inside the Vite server so the keys never reach the browser.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'

const MODEL = 'gemini-3.8-flash'
const EMBED_MODEL = 'gemini-embedding-001'
const EMBED_DIM = 768
const SHORTLIST = 30
const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const CALA = 'https://api.cala.ai/v1'

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

// Cala's sourced answer; failures come back as {error}. Answers are cached on disk so a
// repeated question (e.g. during the demo) is instant and costs no credits.
async function calaSearch(question, key) {
  if (!key) return { error: 'CALA_API_KEY missing in .env' }
  const cached = file(`.cache/cala-answers/${createHash('sha1').update(question.toLowerCase()).digest('hex')}.json`)
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'))
  try {
    const res = await fetch(`${CALA}/knowledge/search`, {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: question, return_entities: true }),
      signal: AbortSignal.timeout(120000),
    })
    const body = await res.json()
    if (!res.ok) return { error: `Cala ${res.status}: ${body.detail ?? res.statusText}` }
    const sources = new Map()
    for (const bit of body.context ?? []) {
      for (const o of bit.origins ?? []) {
        const ref = o.document?.url ? o.document : o.source
        if (ref?.url && !sources.has(ref.url)) sources.set(ref.url, { name: ref.name || ref.url.replace(/^https?:\/\//, '').split('/')[0], url: ref.url })
      }
    }
    const out = {
      answer: body.content ?? '',
      sources: [...sources.values()].slice(0, 6),
      entities: (body.entities ?? []).map((e) => ({ id: e.id, name: e.name, type: e.entity_type })),
    }
    mkdirSync(file('.cache/cala-answers/'), { recursive: true })
    writeFileSync(cached, JSON.stringify(out))
    return out
  } catch (e) {
    return { error: `Cala: ${e.message}` }
  }
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

// Vite plugin: same endpoints in `vite` and `vite preview`.
export function askPlugin({ gemini: key, cala: calaKey }) {
  const routes = {
    '/api/ask': (q) => {
      if (!key) throw new Error('GEMINI_API_KEY missing in .env')
      return ask(q, key)
    },
    '/api/cala': (q) => calaSearch(q, calaKey),
  }
  const handler = async (req, res, next) => {
    const route = routes[req.url]
    if (!route || req.method !== 'POST') return next()
    let raw = ''
    for await (const chunk of req) raw += chunk
    res.setHeader('Content-Type', 'application/json')
    try {
      const question = String(JSON.parse(raw || '{}').question ?? '').trim().slice(0, 500)
      if (!question) throw new Error('empty question')
      res.end(JSON.stringify(await route(question)))
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
