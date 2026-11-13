export type Stage = 'Pre-seed' | 'Seed' | 'Series A' | 'Series B' | 'Series C+'

export interface Round {
  stage: Stage
  amountM: number
  year: number
  investors: string[]
}

export interface Startup {
  id: string
  name: string
  sector: string
  country: string
  founded: number
  stage: Stage
  totalRaisedM: number
  model: 'B2B' | 'B2C' | 'B2B2C'
  pitch: string
  website: string
  rounds: Round[]
}
