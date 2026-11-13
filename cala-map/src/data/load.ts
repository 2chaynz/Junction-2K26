import type { Stage, Startup } from './types'
import { mockStartups } from './mock'

// Raw shape written by scripts/import-cala.mjs.
type Raw = Omit<Startup, 'stage' | 'sector'> & { sector: string }

const SECTOR_LABEL: Record<string, string> = {
  fintech: 'FinTech', healthtech: 'HealthTech', 'climate tech': 'ClimateTech', 'artificial intelligence': 'AI',
  robotics: 'Robotics', gaming: 'Gaming', mobility: 'Mobility', 'food tech': 'FoodTech', edtech: 'EdTech',
  cybersecurity: 'Cybersecurity', 'deep tech': 'DeepTech', consumer: 'Consumer',
  'enterprise software': 'Enterprise', biotech: 'BioTech',
}

const STAGES: Stage[] = ['Unknown', 'No rounds', 'Seed', 'Series A', 'Series B', 'Series C+']
export const stageOf = (rounds: number): Stage => STAGES[Math.min(rounds, 4) + 1]

const files = import.meta.glob<Raw[]>('./startups.json', { eager: true, import: 'default' })
const raw = files['./startups.json']

export const STARTUPS: Startup[] = raw
  ? raw.map((s) => ({ ...s, sector: SECTOR_LABEL[s.sector] ?? s.sector, stage: s.rounds.length || s.sources.length ? stageOf(s.rounds.length) : 'Unknown' }))
  : mockStartups()
export const IS_MOCK = !raw
export const SECTORS = [...new Set(STARTUPS.map((s) => s.sector))].sort()
export { STAGES }
