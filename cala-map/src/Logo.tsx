import { useState } from 'react'

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

// Mirrored 5x5 pixel sigil, unique per startup, for companies without a known website.
function Sigil({ seed, color }: { seed: string; color: [number, number, number] }) {
  let h = hash(seed)
  const cells: [number, number][] = []
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if (h & 1) cells.push([x, y], [4 - x, y])
      h = (h >>> 1) || hash(seed + y)
    }
  }
  const [r, g, b] = color.map((c) => Math.min(255, c + 90))
  return (
    <svg viewBox="-1 -1 7 7" shapeRendering="crispEdges">
      <rect x="-1" y="-1" width="7" height="7" fill={`rgb(${color.join(',')})`} opacity="0.35" />
      {cells.map(([x, y], i) => <rect key={i} x={x} y={y} width="1" height="1" fill={`rgb(${r},${g},${b})`} />)}
    </svg>
  )
}

export function Logo({ name, website, color }: { name: string; website: string | null; color: [number, number, number] }) {
  const [failed, setFailed] = useState(false)
  const domain = website?.replace(/^https?:\/\//, '').split('/')[0]
  return (
    <div className="hero-logo">
      {domain && !failed
        ? <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`} alt="" onError={() => setFailed(true)} />
        : <Sigil seed={name} color={color} />}
    </div>
  )
}
