// Writes src/data/positions.json: a 2D position per startup inside its island,
// so similar companies end up next to each other.
// embed() is TF-IDF for now; swap it for Gemini (or Gemma) embeddings without touching the rest.
import { readFileSync, writeFileSync } from 'node:fs'

const startups = JSON.parse(readFileSync(new URL('../src/data/startups.json', import.meta.url), 'utf8'))
const OUT = new URL('../src/data/positions.json', import.meta.url)
const STOP = new Set('a an and the of for in on to with by from its is are as at or that this based company startup platform'.split(' '))

const tokens = (s) => s.toLowerCase().match(/[a-z]{3,}/g)?.filter((w) => !STOP.has(w)) ?? []

function embed(texts) {
  const docs = texts.map(tokens)
  const df = new Map()
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1)
  const vocab = [...df.keys()].filter((w) => df.get(w) > 1)
  const index = new Map(vocab.map((w, i) => [w, i]))
  return docs.map((d) => {
    const v = new Float64Array(vocab.length)
    for (const w of d) if (index.has(w)) v[index.get(w)] += Math.log(docs.length / df.get(w))
    const n = Math.hypot(...v) || 1
    return v.map((x) => x / n)
  })
}

// Top-2 principal components by power iteration; enough to spread neighbours in 2D.
function pca2(vectors) {
  const dim = vectors[0]?.length ?? 0
  if (!dim) return vectors.map(() => [0.5, 0.5])
  const mean = new Float64Array(dim)
  for (const v of vectors) for (let i = 0; i < dim; i++) mean[i] += v[i] / vectors.length
  const X = vectors.map((v) => v.map((x, i) => x - mean[i]))
  const comps = []
  for (let c = 0; c < 2; c++) {
    let w = Float64Array.from({ length: dim }, (_, i) => Math.sin(i * 12.9898 + c))
    for (let it = 0; it < 50; it++) {
      const next = new Float64Array(dim)
      for (const x of X) {
        let dot = 0
        for (let i = 0; i < dim; i++) dot += x[i] * w[i]
        for (let i = 0; i < dim; i++) next[i] += dot * x[i]
      }
      for (const prev of comps) {
        let dot = 0
        for (let i = 0; i < dim; i++) dot += next[i] * prev[i]
        for (let i = 0; i < dim; i++) next[i] -= dot * prev[i]
      }
      const n = Math.hypot(...next) || 1
      w = next.map((x) => x / n)
    }
    comps.push(w)
  }
  const proj = X.map((x) => comps.map((w) => x.reduce((a, xi, i) => a + xi * w[i], 0)))
  // Rank-normalise each axis so points fill the island instead of clumping.
  return [0, 1].reduce((acc, axis) => {
    const order = proj.map((p, i) => [p[axis], i]).sort((a, b) => a[0] - b[0])
    order.forEach(([, i], rank) => { acc[i][axis] = order.length > 1 ? rank / (order.length - 1) : 0.5 })
    return acc
  }, proj.map(() => [0.5, 0.5]))
}

const positions = {}
for (const sector of new Set(startups.map((s) => s.sector))) {
  const group = startups.filter((s) => s.sector === sector)
  const xy = pca2(embed(group.map((s) => `${s.name} ${s.description}`)))
  group.forEach((s, i) => { positions[s.id] = xy[i].map((v) => Math.round(v * 1000) / 1000) })
}
writeFileSync(OUT, JSON.stringify(positions))
console.log(`wrote positions for ${Object.keys(positions).length} startups`)
