export type Stage = 'Unknown' | 'No rounds' | 'Seed' | 'Series A' | 'Series B' | 'Series C+'

export interface Ref { id: string; name: string }

export interface Startup {
  id: string
  name: string
  sector: string
  country: string
  founded: number | null
  // Derived from the number of funding rounds Cala knows about; Cala has no stage field.
  stage: Stage
  website: string | null
  description: string
  hq: string | null
  // Free-text amount from Cala search results, e.g. "~$41M".
  funding?: string | null
  rounds: { id: string; date: string | null }[]
  investors: Ref[]
  founders: Ref[]
  sources: string[]
}
