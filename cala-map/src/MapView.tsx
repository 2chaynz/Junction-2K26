import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { DeckGL } from '@deck.gl/react'
import { LinearInterpolator, OrthographicView } from '@deck.gl/core'
import { IconLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { Tile } from './layout'
import { useClock, useVoyage } from './anim'
import { iconUrl } from './icons'
import { sigilUrl } from './Logo'
import { BOUNDS, ISLANDS, SEA, TILES } from './world'

const MAX_ZOOM = 7.5
// Above this zoom every visible tile shows its startup's emblem, like zig-zag's covers.
const EMBLEM_ZOOM = 4.8
const THIS_YEAR = new Date().getFullYear()

const FLY = {
  transitionDuration: 1200,
  transitionInterpolator: new LinearInterpolator({ transitionProps: ['target', 'zoom'] }),
  transitionEasing: (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
}

const boatSvg = (flip: boolean) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 16 16' shape-rendering='crispEdges'><g ${flip ? "transform='translate(16 0) scale(-1 1)'" : ''}><rect x='7' y='1' width='1' height='10' fill='#ddd'/><path d='M8 2h1v1h1v1h1v1h1v1h1v1h1v2H8z' fill='#f4ead2'/><path d='M3 7h4v3H3z' fill='#e8c878'/><path d='M1 11h14v1h-1v1h-1v1H3v-1H2v-1H1z' fill='#8a5a3c'/><path d='M2 14h12v1H2z' fill='#5fa8c8'/></g></svg>`)}`
const BOAT = { right: { url: boatSvg(false), width: 64, height: 64, id: 'boat-r' }, left: { url: boatSvg(true), width: 64, height: 64, id: 'boat-l' } }
const SPRITE = {
  gem: { url: iconUrl('gem', '#f0a0d8'), width: 64, height: 64, id: 'gem' },
  coin: { url: iconUrl('coin', '#ebc878'), width: 64, height: 64, id: 'coin' },
  seed: { url: iconUrl('seed', '#7ee0a0'), width: 64, height: 64, id: 'seed' },
}
const emblem = (t: Tile) => ({ url: sigilUrl(t.startup!.name, t.color), width: 70, height: 70, id: `s-${t.startup!.id}` })

type View = { target: [number, number, number]; zoom: number } & Partial<typeof FLY>
export interface FlyRequest { x: number; y: number; zoom?: number; seq: number }

// Keeps the camera on the archipelago: no zooming out past "everything fits", no drifting off into empty sea.
function clamp(v: View, w: number, h: number): View {
  const worldW = BOUNDS.x1 - BOUNDS.x0
  const worldH = BOUNDS.y1 - BOUNDS.y0
  const minZoom = Math.log2(Math.min(w / worldW, h / worldH))
  const zoom = Math.min(MAX_ZOOM, Math.max(minZoom, v.zoom))
  const scale = 2 ** zoom
  const axis = (c: number, lo: number, hi: number, half: number) => (hi - lo <= half * 2 ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, c)))
  return {
    ...v,
    zoom,
    target: [axis(v.target[0], BOUNDS.x0, BOUNDS.x1, w / 2 / scale), axis(v.target[1], BOUNDS.y0, BOUNDS.y1, h / 2 / scale), 0],
  }
}

interface Props {
  tile: Tile
  visible: Set<string>
  explored: boolean
  discovered: Set<string>
  gems: Set<string>
  fly: FlyRequest
  onPick: (id: string) => void
  onIsland: (sector: string) => void
}

export const MapView = memo(function MapView({ tile, visible, explored, discovered, gems, fly, onPick, onIsland }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [view, setView] = useState<View>({ target: [tile.x, tile.y, 0], zoom: 4.2 })
  const clock = useClock()
  const voyage = useVoyage([tile.x, tile.y], clock)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    setView((v) => clamp({ ...v, ...FLY, target: [fly.x, fly.y, 0], zoom: fly.zoom ?? Math.max(v.zoom, 3.6) }, size.w, size.h))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly.seq])

  useEffect(() => setView((v) => clamp(v, size.w, size.h)), [size])

  const zoomedIn = view.zoom >= 3
  // Viewport in tile units, rounded so the emblem set only changes when a new row/column scrolls in.
  const half = { x: Math.ceil(size.w / 2 / 2 ** view.zoom) + 1, y: Math.ceil(size.h / 2 / 2 ** view.zoom) + 1 }
  const cx = Math.round(view.target[0])
  const cy = Math.round(view.target[1])
  const showEmblems = view.zoom >= EMBLEM_ZOOM

  const tilesLayer = useMemo(() => new PolygonLayer<Tile>({
    id: 'tiles',
    data: TILES,
    getPolygon: (t) => [[t.x - 0.47, t.y - 0.47], [t.x + 0.47, t.y - 0.47], [t.x + 0.47, t.y + 0.47], [t.x - 0.47, t.y + 0.47]],
    getFillColor: (t) => {
      const on = !t.startup || visible.has(t.startup.id)
      const dim = explored && t.startup && !discovered.has(t.startup.id) ? 0.3 : 1
      return [t.color[0] * dim, t.color[1] * dim, t.color[2] * dim, on ? 255 : 45]
    },
    stroked: false,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 50],
    transitions: { getFillColor: 400 },
    updateTriggers: { getFillColor: [visible, explored, discovered] },
    onClick: ({ object }) => object?.startup && onPick(object.startup.id),
  }), [visible, explored, discovered, onPick])

  const labelsLayer = useMemo(() => new TextLayer({
    id: 'labels',
    data: ISLANDS,
    getPosition: (i) => [i.cx, i.cy],
    getText: (i) => i.sector,
    getColor: [236, 170, 205, 235],
    // World units, so labels grow and shrink with the island like a map.
    getSize: (i) => Math.max(4, i.radius * 0.5),
    sizeUnits: 'common',
    sizeMinPixels: 10,
    sizeMaxPixels: 58,
    fontFamily: '"IM Fell English", Georgia, serif',
    fontSettings: { sdf: true },
    outlineWidth: 3,
    outlineColor: [10, 9, 9, 220],
    pickable: true,
    onClick: ({ object }) => object && onIsland(object.sector),
  }), [onIsland])

  const emblemsLayer = useMemo(() => new IconLayer<Tile>({
    id: 'emblems',
    data: showEmblems
      ? TILES.filter((t) => t.startup && Math.abs(t.x - cx) <= half.x && Math.abs(t.y - cy) <= half.y && (!visible.size || visible.has(t.startup.id)))
      : [tile],
    getPosition: (t) => [t.x, t.y],
    getIcon: emblem,
    getSize: (t) => (t === tile ? 1.15 : 0.82),
    sizeUnits: 'common',
    sizeMinPixels: 6,
    updateTriggers: { getSize: tile },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [showEmblems, cx, cy, half.x, half.y, tile, visible])

  const spritesLayer = useMemo(() => new IconLayer<Tile>({
    id: 'sprites',
    data: zoomedIn ? TILES.filter((t) => t.startup && t !== tile && (gems.has(t.startup.id) || t.startup.funding || (t.startup.founded ?? 0) >= THIS_YEAR - 2)) : [],
    getPosition: (t) => [t.x + 0.24, t.y - 0.24],
    getIcon: (t) => (gems.has(t.startup!.id) ? SPRITE.gem : t.startup!.funding ? SPRITE.coin : SPRITE.seed),
    getSize: 0.45,
    sizeUnits: 'common',
    updateTriggers: { getIcon: gems },
  }), [zoomedIn, gems, tile])

  // Only these change every frame: water glints, wake and boat.
  const layers = [
    new ScatterplotLayer<(typeof SEA)[number]>({
      id: 'sea',
      data: SEA,
      getPosition: (d) => d.p,
      getRadius: 0.12,
      radiusMinPixels: 0.6,
      getFillColor: (d) => [120, 170, 200, 25 + 70 * Math.sin(clock * d.speed + d.phase) ** 8],
      updateTriggers: { getFillColor: Math.floor(clock * 8) },
    }),
    tilesLayer,
    emblemsLayer,
    spritesLayer,
    labelsLayer,
    new ScatterplotLayer<[number, number]>({
      id: 'wake',
      data: voyage.wake,
      getPosition: (p) => p,
      getRadius: (_, { index }) => 0.12 + (index / Math.max(1, voyage.wake.length)) * 0.3,
      getFillColor: (_, { index }) => [190, 225, 240, 30 + (index / Math.max(1, voyage.wake.length)) * 160],
      updateTriggers: { getRadius: voyage.wake.length, getFillColor: voyage.wake.length },
    }),
    new IconLayer({
      id: 'boat',
      data: [0],
      // Bobs at anchor, steadier while under sail.
      getPosition: () => [voyage.pos[0], voyage.pos[1] - 1.15 + Math.sin(clock * 2.2) * (voyage.sailing ? 0.05 : 0.14)],
      getIcon: () => (voyage.heading < 0 ? BOAT.left : BOAT.right),
      getSize: 2.4,
      sizeUnits: 'common',
      sizeMinPixels: 22,
      sizeMaxPixels: 64,
      updateTriggers: { getPosition: clock, getIcon: voyage.heading },
    }),
  ]

  return (
    <div ref={box} className="deck-box">
      <DeckGL
        views={new OrthographicView({ flipY: true })}
        viewState={view}
        controller={{ inertia: 300 }}
        // Drop the flight transition, or every scroll and drag would replay a 1.2s animation.
        onViewStateChange={({ viewState }) => {
          const v = viewState as View
          setView(clamp({ target: v.target, zoom: v.zoom }, size.w, size.h))
        }}
        layers={layers}
        getCursor={({ isHovering, isDragging }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
        getTooltip={({ object }) => {
          const s = (object as Tile)?.startup
          return s ? { html: `<b>${s.name}</b><div>${s.sector} · ${s.country}${s.founded ? ` · ${s.founded}` : ''}</div>`, className: 'map-tip', style: {} } : null
        }}
      />
    </div>
  )
})
