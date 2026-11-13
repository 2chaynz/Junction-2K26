import { rng } from './data/mock'
import type { Startup } from './data/types'

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
  color: [number, number, number]
}

const PALETTE: [number, number, number][] = [
  [120, 70, 95], [90, 80, 130], [70, 105, 100], [125, 95, 60], [100, 60, 120], [130, 75, 70],
  [70, 90, 125], [105, 115, 70], [125, 70, 115], [80, 110, 120], [115, 85, 95], [95, 100, 85],
]

// Grows one blob per sector from a seed cell; noisy frontier gives coastline shapes.
export function layoutIslands(startups: Startup[], sectors: string[]) {
  const r = rng(7)
  const taken = new Set<string>()
  const tiles: Tile[] = []
  const islands: Island[] = []
  const cols = Math.ceil(Math.sqrt(sectors.length))
  const spacing = 70

  sectors.forEach((sector, i) => {
    const members = startups.filter((s) => s.sector === sector)
    const color = PALETTE[i % PALETTE.length]
    const cx = (i % cols) * spacing + Math.floor(r() * 20)
    const cy = Math.floor(i / cols) * spacing + Math.floor(r() * 20)
    const target = Math.floor(members.length * 1.4)
    const cells: [number, number][] = []
    const frontier: [number, number][] = [[cx, cy]]
    while (cells.length < target && frontier.length) {
      const [x, y] = frontier.splice(Math.floor(r() * frontier.length), 1)[0]
      const key = `${x},${y}`
      if (taken.has(key)) continue
      taken.add(key)
      cells.push([x, y])
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (r() < 0.85) frontier.push([x + dx, y + dy])
      }
    }
    // Well-funded startups sit near the island centre.
    cells.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))
    const weight = (s: Startup) => s.rounds.length * 3 + s.investors.length
    const ranked = [...members].sort((a, b) => weight(b) - weight(a))
    cells.forEach(([x, y], k) => {
      const jitter = (r() - 0.5) * 40
      const shade = color.map((c) => Math.max(0, Math.min(255, c + jitter))) as [number, number, number]
      tiles.push({ x, y, sector, startup: ranked[k], color: ranked[k] ? shade : (shade.map((c) => c * 0.6) as [number, number, number]) })
    })
    islands.push({ sector, cx, cy, color })
  })
  return { tiles, islands }
}
