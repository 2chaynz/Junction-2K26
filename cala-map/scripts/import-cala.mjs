// Pulls Nordic + Baltic startups from Cala into src/data/startups.json.
// Every API response is cached in .cache/ so reruns only fetch what is missing.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const KEY = readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/CALA_API_KEY=(\S+)/)[1]
const API = 'https://api.cala.ai/v1'
const CACHE = new URL('../.cache/', import.meta.url)
const OUT = new URL('../src/data/startups.json', import.meta.url)
const CONCURRENCY = 6

const COUNTRIES = ['Finland', 'Sweden', 'Norway', 'Denmark', 'Iceland', 'Estonia', 'Latvia', 'Lithuania']
const SECTORS = ['fintech', 'healthtech', 'climate tech', 'artificial intelligence', 'robotics', 'gaming',
  'mobility', 'food tech', 'edtech', 'cybersecurity', 'deep tech', 'consumer', 'enterprise software', 'biotech']

mkdirSync(CACHE, { recursive: true })

async function call(method, path, body) {
  const key = createHash('sha1').update(method + path + JSON.stringify(body ?? '')).digest('hex')
  const file = new URL(`${key}.json`, CACHE)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(API + path, {
      method,
      headers: { 'X-API-KEY': KEY, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt))
      continue
    }
    const data = await res.json()
    if (!res.ok) {
      console.warn(`  ${res.status} ${path}`, JSON.stringify(data).slice(0, 200))
      return null
    }
    writeFileSync(file, JSON.stringify(data))
    return data
  }
  console.warn(`  gave up ${path}`)
  return null
}

async function pool(items, fn) {
  const out = []
  let i = 0
  let done = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
      if (++done % 10 === 0) console.log(`  ${done}/${items.length}`)
    }
  }))
  return out
}

// 1. Discover company ids per country x sector.
const jobs = COUNTRIES.flatMap((country) => SECTORS.map((sector) => ({ country, sector })))
console.log(`discover: ${jobs.length} queries`)
const found = new Map()
await pool(jobs, async ({ country, sector }) => {
  const data = await call('POST', '/knowledge/query', {
    input: `startups.location=${country}.industry=${sector}.founded_year>=2015.limit=50`,
  })
  for (const e of data?.entities ?? []) {
    if (e.entity_type === 'Company' && !found.has(e.id)) found.set(e.id, { id: e.id, sector, country })
  }
})
console.log(`discovered ${found.size} companies`)

// 2. Details: properties, industries, HQ, funding rounds, investors, founders.
const QUERY = {
  properties: ['name', 'founding_date', 'website', 'description', 'headquarters_address'],
  relationships: {
    outgoing: {
      OPERATES_IN_INDUSTRY: { limit: 5 },
      HAS_HEADQUARTERS_IN: { limit: 2 },
      PARTICIPATES_IN_CORPORATE_EVENT: { limit: 30 },
    },
    incoming: { INVESTED_IN: { limit: 50 }, FOUNDED: { limit: 10 } },
  },
}
const val = (p, k) => p?.[k]?.value ?? null
const props = (r) => Object.fromEntries(Object.entries(r.properties ?? {}).filter(([k]) => k !== 'sources'))

console.log('details:')
const startups = (await pool([...found.values()], async (seed) => {
  const d = await call('POST', `/entities/${seed.id}`, QUERY)
  if (!d) return null
  const out = d.relationships?.outgoing ?? {}
  const inc = d.relationships?.incoming ?? {}
  const founded = val(d.properties, 'founding_date')
  return {
    id: d.id,
    name: val(d.properties, 'name') ?? d.name,
    sector: seed.sector,
    country: seed.country,
    founded: founded ? +founded.slice(0, 4) : null,
    website: val(d.properties, 'website'),
    description: val(d.properties, 'description') ?? d.description ?? '',
    hq: val(d.properties, 'headquarters_address'),
    industries: (out.OPERATES_IN_INDUSTRY ?? []).map((x) => x.name),
    rounds: (out.PARTICIPATES_IN_CORPORATE_EVENT ?? [])
      .filter((x) => x.entity_type === 'PrivateCompanyFundingRound')
      .map((x) => ({ id: props(x).id ?? x.id, date: props(x).event_date ?? null }))
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
    investors: (inc.INVESTED_IN ?? []).map((x) => ({ id: x.id, name: x.name, type: x.entity_type })),
    founders: (inc.FOUNDED ?? []).map((x) => ({ id: x.id, name: x.name })),
    sources: Object.values(d.properties ?? {}).flatMap((p) => p.sources ?? []).map((s) => s.document).filter(Boolean),
  }
})).filter(Boolean)

writeFileSync(OUT, JSON.stringify(startups))
console.log(`wrote ${startups.length} startups to src/data/startups.json`)
