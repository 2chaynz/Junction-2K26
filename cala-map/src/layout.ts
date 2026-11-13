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
const LAND_PER_STARTUP = 1.35

// Land = cells where fractal noise minus distance from the centre is highest,
// so each island keeps its area but gets an organic coastline and a few islets.
function islandCells(cx: number, cy: number, area: number, noise: (x: number, y: number) => number, offset: number) {
  const radius = Math.sqrt(area / Math.PI)
  const reach = Math.ceil(radius * 1.8)
  const scored: { x: number; y: number; s: number }[] = []
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dy = -reach; dy <= reach; dy++) {
      const d = Math.hypot(dx, dy) / radius
      const n = noise((dx / radius) * 1.3 + offset, (dy / radius) * 1.3 + offset)
      scored.push({ x: cx + dx, y: cy + dy, s: n * 0.9 - d })
    }
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, area)
}

export function layoutIslands(startups: Startup[], sectors: string[], positions: Positions = {}) {
  const r = rng(7)
  const noise = perlin(11)
  const tiles: Tile[] = []
  const islands: Island[] = []
  const groups = sectors.map((sector) => startups.filter((s) => s.sector === sector))
  const maxRadius = Math.max(...groups.map((g) => Math.sqrt((g.length * LAND_PER_STARTUP) / Math.PI)))
  const spacing = Math.ceil(maxRadius * 2.5)
  const cols = Math.ceil(Math.sqrt(sectors.length * 1.6))

  sectors.forEach((sector, i) => {
    const members = groups[i]
    const color = PALETTE[i % PALETTE.length]
    // Staggered rows read as an archipelago rather than a grid.
    const row = Math.floor(i / cols)
    const cx = (i % cols) * spacing + (row % 2) * (spacing / 2) + Math.floor((r() - 0.5) * spacing * 0.3)
    const cy = row * spacing * 0.85 + Math.floor((r() - 0.5) * spacing * 0.3)
    const cells = islandCells(Math.round(cx), Math.round(cy), Math.ceil(members.length * LAND_PER_STARTUP), noise, i * 7.3)
    const startupAt = assign(members, cells, positions, r)
    for (const c of cells) {
      const s = startupAt.get(`${c.x},${c.y}`)
      const jitter = (r() - 0.5) * 36
      const shade = color.map((v) => Math.max(0, Math.min(255, v + jitter))) as [number, number, number]
      tiles.push({ x: c.x, y: c.y, sector, startup: s, color: s ? shade : (shade.map((v) => v * 0.55) as [number, number, number]) })
    }
    islands.push({ sector, cx, cy, radius: Math.sqrt((members.length * LAND_PER_STARTUP) / Math.PI), color })
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
