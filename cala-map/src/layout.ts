import { rng } from './data/mock'
import type { Startup } from './data/types'
import { perlin } from './perlin'

export interface Tile {
  x: number
  y: number
  sector: string
  startup?: Startup
  color: [number, number, number]
}

export interface Island {
  sector: string
  cx: number
  cy: number
  radius: number
  color: [number, number, number]
}

// 2D position per startup id, each axis in [0, 1]; neighbours = similar companies.
export type Positions = Record<string, [number, number]>

const PALETTE: [number, number, number][] = [
  [120, 70, 95], [90, 80, 130], [70, 105, 100], [125, 95, 60], [100, 60, 120], [130, 75, 70],
  [70, 90, 125], [105, 115, 70], [125, 70, 115], [80, 110, 120], [115, 85, 95], [95, 100, 85],
  [110, 90, 120], [85, 115, 95],
]
// Every land tile is a startup: bare land looked clickable but was not.
const LAND_PER_STARTUP = 1

interface Shape {
  lobes: { x: number; y: number; r: number }[]
  angle: number
  stretch: number
  rough: number
  freq: number
}

// Each island draws its own silhouette: one to three lobes, stretched and rotated,
// with its own coast roughness. Same recipe everywhere would give lookalike blobs.
function randomShape(r: () => number): Shape {
  const lobes = [{ x: 0, y: 0, r: 1 }]
  const extra = Math.floor(r() * 3)
  for (let k = 0; k < extra; k++) {
    const a = r() * Math.PI * 2
    const d = 0.8 + r() * 0.7
    lobes.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.45 + r() * 0.5 })
  }
  return { lobes, angle: r() * Math.PI, stretch: 1 + r() * 0.4, rough: 0.5 + r() * 1.1, freq: 0.9 + r() * 1.3 }
}

// Land = the `area` cells where fractal noise minus distance to the nearest lobe is highest,
// so an island keeps its area whatever its shape. Cells are relative to the island origin.
function islandCells(area: number, shape: Shape, noise: (x: number, y: number) => number, offset: number) {
  const radius = Math.sqrt(area / Math.PI)
  const reach = Math.ceil(radius * 3.2)
  const [cos, sin] = [Math.cos(shape.angle), Math.sin(shape.angle)]
  const scored: { x: number; y: number; s: number }[] = []
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dy = -reach; dy <= reach; dy++) {
      const u = ((dx * cos + dy * sin) / radius) / shape.stretch
      const v = ((dy * cos - dx * sin) / radius) * shape.stretch
      const d = Math.min(...shape.lobes.map((l) => Math.hypot(u - l.x, v - l.y) / l.r))
      const n = noise(u * shape.freq + offset, v * shape.freq + offset)
      scored.push({ x: dx, y: dy, s: n * shape.rough - d })
    }
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, area)
}

const key = (x: number, y: number) => (x + 5000) * 10000 + (y + 5000)

// Drops an island at the free spot nearest the centre along random bearings: a scattered
// archipelago with uneven straits instead of rows and columns.
function place(cells: { x: number; y: number }[], blocked: Set<number>, r: () => number) {
  for (let ring = 0; ; ring++) {
    for (let k = 0; k < 10; k++) {
      const a = r() * Math.PI * 2
      // Wider than tall, to suit landscape screens.
      const ox = Math.round(Math.cos(a) * ring * 2.4)
      const oy = Math.round(Math.sin(a) * ring * 1.5)
      if (cells.every((c) => !blocked.has(key(c.x + ox, c.y + oy)))) return { ox, oy }
    }
  }
}

export function layoutIslands(startups: Startup[], sectors: string[], positions: Positions = {}) {
  const r = rng(23)
  const noise = perlin(11)
  const tiles: Tile[] = []
  const islands: Island[] = []
  const blocked = new Set<number>()
  const groups = sectors
    .map((sector, i) => ({ sector, color: PALETTE[i % PALETTE.length], members: startups.filter((s) => s.sector === sector) }))
    // Biggest first: small islands then fill the gaps around the large ones.
    .sort((a, b) => b.members.length - a.members.length)

  groups.forEach(({ sector, color, members }, i) => {
    const local = islandCells(Math.ceil(members.length * LAND_PER_STARTUP), randomShape(r), noise, i * 7.3)
    const { ox, oy } = place(local, blocked, r)
    const cells = local.map((c) => ({ x: c.x + ox, y: c.y + oy }))
    const strait = 3 + Math.floor(r() * 5)
    for (const c of cells) {
      for (let dx = -strait; dx <= strait; dx++) for (let dy = -strait; dy <= strait; dy++) blocked.add(key(c.x + dx, c.y + dy))
    }
    const startupAt = assign(members, cells, positions, r)
    for (const c of cells) {
      const s = startupAt.get(`${c.x},${c.y}`)
      const jitter = (r() - 0.5) * 36
      const shade = color.map((v) => Math.max(0, Math.min(255, v + jitter))) as [number, number, number]
      tiles.push({ x: c.x, y: c.y, sector, startup: s, color: s ? shade : (shade.map((v) => v * 0.55) as [number, number, number]) })
    }
    islands.push({
      sector,
      cx: cells.reduce((a, c) => a + c.x, 0) / (cells.length || 1),
      cy: cells.reduce((a, c) => a + c.y, 0) / (cells.length || 1),
      radius: Math.sqrt(cells.length / Math.PI),
      color,
    })
  })
  return { tiles, islands }
}

// Greedy match of each startup to the free land cell closest to its similarity position.
function assign(members: Startup[], cells: { x: number; y: number }[], positions: Positions, r: () => number) {
  const xs = cells.map((c) => c.x)
  const ys = cells.map((c) => c.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const free = cells.map((c) => ({ ...c, u: (c.x - x0) / (x1 - x0 || 1), v: (c.y - y0) / (y1 - y0 || 1) }))
  const out = new Map<string, Startup>()
  const order = [...members].sort((a, b) => (positions[a.id] ? 0 : 1) - (positions[b.id] ? 0 : 1))
  for (const s of order) {
    const [u, v] = positions[s.id] ?? [0.5 + (r() - 0.5) * 0.6, 0.5 + (r() - 0.5) * 0.6]
    let best = 0
    let bestD = Infinity
    free.forEach((c, k) => {
      const d = (c.u - u) ** 2 + (c.v - v) ** 2
      if (d < bestD) [best, bestD] = [k, d]
    })
    const [c] = free.splice(best, 1)
    if (c) out.set(`${c.x},${c.y}`, s)
  }
  return out
}
