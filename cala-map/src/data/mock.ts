import type { Stage, Startup } from './types'

// Fictional data so the UI can be built before the Cala import lands.
export const SECTORS = [
  'FinTech', 'HealthTech', 'ClimateTech', 'AI Infra', 'Robotics', 'Gaming',
  'Mobility', 'FoodTech', 'EdTech', 'Cybersecurity', 'DeepTech', 'Consumer',
]
const COUNTRIES = ['Finland', 'Sweden', 'Estonia', 'Denmark', 'Norway', 'Germany', 'France', 'Netherlands']
const STAGES: Stage[] = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+']
const FUNDS = [
  'Northwind Ventures', 'Aurora Capital', 'Fjord Partners', 'Baltic Seed', 'Polar Fund',
  'Kite Ventures', 'Harbor VC', 'Lumen Capital', 'Tundra Partners', 'Saga Ventures',
]
const SYL = ['ka', 'lo', 'vi', 'nor', 'ta', 'ri', 'sol', 'mi', 'ux', 'pha', 'zen', 'qu', 'ly', 'vo', 'tek', 'ar']
const AMOUNT: Record<Stage, number> = { 'Pre-seed': 0.5, Seed: 2, 'Series A': 10, 'Series B': 30, 'Series C+': 80 }

export function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)]

function makeName(r: () => number) {
  const n = 2 + Math.floor(r() * 2)
  const s = Array.from({ length: n }, () => pick(r, SYL)).join('')
  return s[0].toUpperCase() + s.slice(1)
}

export function mockStartups(perSector = 120): Startup[] {
  const r = rng(42)
  const out: Startup[] = []
  SECTORS.forEach((sector) => {
    const count = Math.floor(perSector * (0.5 + r()))
    for (let i = 0; i < count; i++) {
      const stageIdx = Math.min(4, Math.floor(r() * r() * 5))
      const founded = 2012 + Math.floor(r() * 13)
      const rounds = STAGES.slice(0, stageIdx + 1).map((stage, k) => ({
        stage,
        amountM: Math.round(AMOUNT[stage] * (0.5 + r()) * 10) / 10,
        year: Math.min(2026, founded + k + Math.floor(r() * 2)),
        investors: Array.from(new Set([pick(r, FUNDS), pick(r, FUNDS)])),
      }))
      const name = makeName(r)
      out.push({
        id: `${out.length + 1}`,
        name,
        sector,
        country: pick(r, COUNTRIES),
        founded,
        stage: STAGES[stageIdx],
        totalRaisedM: Math.round(rounds.reduce((a, x) => a + x.amountM, 0) * 10) / 10,
        model: pick(r, ['B2B', 'B2C', 'B2B2C'] as const),
        pitch: `${name} builds ${sector.toLowerCase()} software for European ${pick(r, ['SMBs', 'hospitals', 'banks', 'cities', 'retailers', 'factories'])}.`,
        website: `https://${name.toLowerCase()}.example`,
        rounds,
      })
    }
  })
  return out
}
