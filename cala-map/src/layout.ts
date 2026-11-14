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

// Startup that also belongs to another sector; the map joins the two islands through it.
export interface BridgeLink { id: string; to: string }
export interface Bridge { from: Tile; to: Tile }

// Drops an island at the free spot nearest `anchor` along random bearings: a scattered
// archipelago with uneven straits instead of rows and columns.
function place(cells: { x: number; y: number }[], blocked: Set<number>, r: () => number, anchor: [number, number]) {
  for (let ring = 0; ; ring++) {
    for (let k = 0; k < 10; k++) {
      const a = r() * Math.PI * 2
      // Wider than tall, to suit landscape screens.
      const ox = Math.round(anchor[0] + Math.cos(a) * ring * 2.4)
      const oy = Math.round(anchor[1] + Math.sin(a) * ring * 1.5)
      if (cells.every((c) => !blocked.has(key(c.x + ox, c.y + oy)))) return { ox, oy }
    }
  }
}

export function layoutIslands(startups: Startup[], sectors: string[], positions: Positions = {}, links: BridgeLink[] = []) {
  const r = rng(23)
  const noise = perlin(11)
  const blocked = new Set<number>()
  const sectorOf = new Map(startups.map((s) => [s.id, s.sector]))
  const weight = new Map<string, number>()
  const pairKey = (a: string, b: string) => [a, b].sort().join('|')
  for (const l of links) {
    const from = sectorOf.get(l.id)
    if (from) weight.set(pairKey(from, l.to), (weight.get(pairKey(from, l.to)) ?? 0) + 1)
  }
  const pending = sectors.map((sector, i) => ({ sector, color: PALETTE[i % PALETTE.length], members: startups.filter((s) => s.sector === sector) }))
  const placed: { sector: string; color: Tile['color']; members: Startup[]; cells: { x: number; y: number }[]; cx: number; cy: number }[] = []

  // Biggest island first, then always the one most bridged to what is already placed, dropped
  // next to its partners: shared themes become neighbouring shores.
  while (pending.length) {
    const ties = (g: (typeof pending)[number]) => placed.reduce((a, p) => a + (weight.get(pairKey(g.sector, p.sector)) ?? 0), 0)
    pending.sort((a, b) => ties(b) - ties(a) || b.members.length - a.members.length)
    const g = pending.shift()!
    const partners = placed.map((p) => ({ p, w: weight.get(pairKey(g.sector, p.sector)) ?? 0 })).filter((x) => x.w)
    const total = partners.reduce((a, x) => a + x.w, 0)
    const anchor: [number, number] = total
      ? [partners.reduce((a, x) => a + x.p.cx * x.w, 0) / total, partners.reduce((a, x) => a + x.p.cy * x.w, 0) / total]
      : [0, 0]
    const local = islandCells(Math.ceil(g.members.length * LAND_PER_STARTUP), randomShape(r), noise, placed.length * 7.3)
    const { ox, oy } = place(local, blocked, r, anchor)
    const cells = local.map((c) => ({ x: c.x + ox, y: c.y + oy }))
    const strait = 5 + Math.floor(r() * 6)
    for (const c of cells) {
      for (let dx = -strait; dx <= strait; dx++) for (let dy = -strait; dy <= strait; dy++) blocked.add(key(c.x + dx, c.y + dy))
    }
    placed.push({ ...g, cells, cx: cells.reduce((a, c) => a + c.x, 0) / cells.length, cy: cells.reduce((a, c) => a + c.y, 0) / cells.length })
  }

  const tiles: Tile[] = []
  const islands: Island[] = []
  const centre = new Map(placed.map((p) => [p.sector, [p.cx, p.cy] as const]))
  const linkOf = new Map(links.map((l) => [l.id, l.to]))
  for (const { sector, color, members, cells, cx, cy } of placed) {
    const startupAt = assign(members, cells, positions, r, (id) => centre.get(linkOf.get(id) ?? ''))
    for (const c of cells) {
      const s = startupAt.get(`${c.x},${c.y}`)
      const jitter = (r() - 0.5) * 36
      const shade = color.map((v) => Math.max(0, Math.min(255, v + jitter))) as [number, number, number]
      tiles.push({ x: c.x, y: c.y, sector, startup: s, color: s ? shade : (shade.map((v) => v * 0.55) as [number, number, number]) })
    }
    islands.push({ sector, cx, cy, radius: Math.sqrt(cells.length / Math.PI), color })
  }

  // Each bridge lands on the nearest shore of the partner island.
  const byId = new Map(tiles.filter((t) => t.startup).map((t) => [t.startup!.id, t]))
  const bridges: Bridge[] = links.flatMap((l) => {
    const from = byId.get(l.id)
    if (!from) return []
    const shore = tiles.filter((t) => t.sector === l.to)
    if (!shore.length) return []
    const to = shore.reduce((a, b) => (Math.hypot(a.x - from.x, a.y - from.y) <= Math.hypot(b.x - from.x, b.y - from.y) ? a : b))
    return [{ from, to }]
  })
  return { tiles, islands, bridges }
}

// Bridge startups take the coast cell facing their partner island; the rest go to the free
// cell closest to their similarity position.
function assign(members: Startup[], cells: { x: number; y: number }[], positions: Positions, r: () => number, partner: (id: string) => readonly [number, number] | undefined) {
  const xs = cells.map((c) => c.x)
  const ys = cells.map((c) => c.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const free = cells.map((c) => ({ ...c, u: (c.x - x0) / (x1 - x0 || 1), v: (c.y - y0) / (y1 - y0 || 1) }))
  const out = new Map<string, Startup>()
  const take = (s: Startup, cost: (c: (typeof free)[number]) => number) => {
    let best = 0
    let bestD = Infinity
    free.forEach((c, k) => {
      const d = cost(c)
      if (d < bestD) [best, bestD] = [k, d]
    })
    const [c] = free.splice(best, 1)
    if (c) out.set(`${c.x},${c.y}`, s)
  }
  const rest: Startup[] = []
  for (const s of members) {
    const p = partner(s.id)
    if (p) take(s, (c) => Math.hypot(c.x - p[0], c.y - p[1]))
    else rest.push(s)
  }
  rest.sort((a, b) => (positions[a.id] ? 0 : 1) - (positions[b.id] ? 0 : 1))
  for (const s of rest) {
    const [u, v] = positions[s.id] ?? [0.5 + (r() - 0.5) * 0.6, 0.5 + (r() - 0.5) * 0.6]
    take(s, (c) => (c.u - u) ** 2 + (c.v - v) ** 2)
  }
  return out
}
