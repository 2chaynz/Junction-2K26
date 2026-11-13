import { useEffect, useMemo, useState } from 'react'
import { DeckGL } from '@deck.gl/react'
import { LinearInterpolator, OrthographicView } from '@deck.gl/core'
import { IconLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { useClock, useVoyage } from './anim'
import { Logo } from './Logo'
import { IS_MOCK, POSITIONS, SECTORS, STAGES, STARTUPS } from './data/load'
import type { Startup } from './data/types'
import { layoutIslands, type Tile } from './layout'
import { useStored } from './useStored'
import { sendMagicLink, signOut, supabase, useSession } from './auth'
import './App.css'

const { tiles: TILES, islands: ISLANDS } = layoutIslands(STARTUPS, SECTORS, POSITIONS)
const BY_ID = new Map(TILES.filter((t) => t.startup).map((t) => [t.startup!.id, t]))
const COUNTRIES = [...new Set(STARTUPS.map((s) => s.country))].sort()
const FLY = { transitionDuration: 1200, transitionInterpolator: new LinearInterpolator({ transitionProps: ['target', 'zoom'] }), transitionEasing: (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2) }

// Glints on open water, scattered once around the archipelago.
const LAND = new Set(TILES.map((t) => `${t.x},${t.y}`))
const SEA = (() => {
  const xs = TILES.map((t) => t.x)
  const ys = TILES.map((t) => t.y)
  const [x0, x1, y0, y1] = [Math.min(...xs) - 30, Math.max(...xs) + 30, Math.min(...ys) - 30, Math.max(...ys) + 30]
  const pts: { p: [number, number]; phase: number; speed: number }[] = []
  for (let i = 0; pts.length < 900 && i < 5000; i++) {
    const p: [number, number] = [Math.round(x0 + Math.random() * (x1 - x0)), Math.round(y0 + Math.random() * (y1 - y0))]
    if (!LAND.has(`${p[0]},${p[1]}`)) pts.push({ p, phase: Math.random() * 6.28, speed: 0.4 + Math.random() * 1.2 })
  }
  return pts
})()

const boatSvg = (flip: boolean) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 16 16' shape-rendering='crispEdges'><g ${flip ? "transform='translate(16 0) scale(-1 1)'" : ''}><rect x='7' y='1' width='1' height='10' fill='#ddd'/><path d='M8 2h1v1h1v1h1v1h1v1h1v1h1v2H8z' fill='#f4ead2'/><path d='M3 7h4v3H3z' fill='#e8c878'/><path d='M1 11h14v1h-1v1h-1v1H3v-1H2v-1H1z' fill='#8a5a3c'/><path d='M2 14h12v1H2z' fill='#5fa8c8'/></g></svg>`)}`
const BOAT = { right: { url: boatSvg(false), width: 64, height: 64, id: 'boat-r' }, left: { url: boatSvg(true), width: 64, height: 64, id: 'boat-l' } }
// Stage comes from funding rounds; hide the filter until Cala details are imported.
const HAS_STAGES = STARTUPS.some((s) => s.stage !== 'Unknown')

interface Filters { sector: string; stage: string; country: string; investor: string; yearMin: string; yearMax: string; q: string }
const NO_FILTERS: Filters = { sector: '', stage: '', country: '', investor: '', yearMin: '', yearMax: '', q: '' }

type Panel = 'map' | 'search' | 'gems' | 'lists'

function matches(s: Startup, f: Filters) {
  return (!f.sector || s.sector === f.sector)
    && (!f.stage || s.stage === f.stage)
    && (!f.country || s.country === f.country)
    && (!f.investor || s.investors.some((i) => i.id === f.investor))
    && (!f.yearMin || (s.founded ?? 0) >= +f.yearMin)
    && (!f.yearMax || (s.founded ?? 9999) <= +f.yearMax)
    && (!f.q || s.name.toLowerCase().includes(f.q.toLowerCase()))
}

function readHash(): { x: number; y: number; id?: string } | null {
  const m = location.hash.match(/^#(-?\d+)~(-?\d+)(?:\/startup~(\w+))?/)
  return m ? { x: +m[1], y: +m[2], id: m[3] } : null
}

export default function App() {
  const initial = readHash()
  const start = BY_ID.get(initial?.id ?? STARTUPS[0].id)
  const [view, setView] = useState<{ target: [number, number, number]; zoom: number } & Partial<typeof FLY>>({ target: [initial?.x ?? start?.x ?? 0, initial?.y ?? start?.y ?? 0, 0] as [number, number, number], zoom: 2 })
  const [selectedId, setSelectedId] = useState<string | undefined>(initial?.id ?? STARTUPS[0].id)
  const [history, setHistory] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [moreFilters, setMoreFilters] = useState(true)
  const [panel, setPanel] = useState<Panel>('map')
  const [collapsed, setCollapsed] = useState(false)
  const session = useSession()
  const uid = session?.user.id
  const [gems, setGems] = useStored<string[]>('gems', [], uid, 'gems')
  const [lists, setLists] = useStored<Record<string, string[]>>('lists', {}, uid, 'lists')
  const [discovered, setDiscovered] = useStored<string[]>('discovered', [], uid, 'discovered')
  const [savedFilters, setSavedFilters] = useStored<Filters[]>('savedFilters', [], uid, 'saved_filters')
  const [loginOpen, setLoginOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [loginMsg, setLoginMsg] = useState('')
  const [sofa, setSofa] = useState(false)
  const [explored, setExplored] = useState(false)

  const selected = selectedId ? BY_ID.get(selectedId)?.startup : undefined
  const selectedTile = selectedId ? BY_ID.get(selectedId) : undefined
  const clock = useClock()
  const voyage = useVoyage(selectedTile ? [selectedTile.x, selectedTile.y] : undefined, clock)
  const visible = useMemo(() => new Set(STARTUPS.filter((s) => matches(s, filters)).map((s) => s.id)), [filters])
  const discoveredSet = useMemo(() => new Set(discovered), [discovered])
  const filtering = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)

  function select(id: string, fly = true) {
    const t = BY_ID.get(id)
    if (!t) return
    if (selectedId && selectedId !== id) setHistory((h) => [...h, selectedId])
    setSelectedId(id)
    if (!discoveredSet.has(id)) setDiscovered([...discovered, id])
    if (fly) setView((v) => ({ ...v, ...FLY, target: [t.x, t.y, 0], zoom: Math.max(v.zoom, 3) }))
  }

  // Next = nearest unvisited startup on the same island that passes the filters.
  function next() {
    const cur = selectedId ? BY_ID.get(selectedId) : undefined
    const pool = TILES.filter((t) => t.startup && visible.has(t.startup.id) && t.startup.id !== selectedId && !discoveredSet.has(t.startup.id))
    const same = cur ? pool.filter((t) => t.sector === cur.sector) : pool
    const from = same.length ? same : pool
    if (!from.length) return
    const best = cur ? from.reduce((a, b) => (Math.hypot(a.x - cur.x, a.y - cur.y) < Math.hypot(b.x - cur.x, b.y - cur.y) ? a : b)) : from[0]
    select(best.startup!.id)
  }

  function shuffle() {
    const pool = STARTUPS.filter((s) => visible.has(s.id))
    if (pool.length) select(pool[Math.floor(Math.random() * pool.length)].id)
  }

  function previous() {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory((h) => h.slice(0, -1))
    setSelectedId(prev)
    const t = BY_ID.get(prev)!
    setView((v) => ({ ...v, ...FLY, target: [t.x, t.y, 0] }))
  }

  useEffect(() => {
    const t = selectedId ? BY_ID.get(selectedId) : undefined
    const [x, y] = t ? [t.x, t.y] : view.target
    window.history.replaceState(null, '', `#${Math.round(x)}~${Math.round(y)}${selectedId ? `/startup~${selectedId}` : ''}`)
  }, [selectedId, view.target, history.length])

  useEffect(() => {
    if (!sofa) return
    const id = setInterval(next, 6000)
    return () => clearInterval(id)
  })

  // Choosing a sector flies the camera to its island.
  useEffect(() => {
    const island = ISLANDS.find((i) => i.sector === filters.sector)
    if (island) setView((v) => ({ ...v, ...FLY, target: [island.cx, island.cy, 0], zoom: Math.max(v.zoom, 2.5) }))
  }, [filters.sector])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return
      const actions: Record<string, () => void> = {
        n: next, ArrowRight: next, p: previous, ArrowLeft: previous, s: shuffle,
        g: () => selected && setGems(gems.includes(selected.id) ? gems.filter((x) => x !== selected.id) : [...gems, selected.id]),
        '/': () => setPanel('search'),
        Escape: () => setPanel('map'),
      }
      const action = actions[e.key]
      if (action) {
        e.preventDefault()
        action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const layers = [
    new ScatterplotLayer<(typeof SEA)[number]>({
      id: 'sea',
      data: SEA,
      getPosition: (d) => d.p,
      getRadius: 0.12,
      radiusMinPixels: 0.6,
      getFillColor: (d) => [120, 170, 200, 25 + 70 * Math.sin(clock * d.speed + d.phase) ** 8],
      updateTriggers: { getFillColor: Math.floor(clock * 10) },
    }),
    new PolygonLayer<Tile>({
      id: 'tiles',
      data: TILES,
      getPolygon: (t) => [[t.x - 0.46, t.y - 0.46], [t.x + 0.46, t.y - 0.46], [t.x + 0.46, t.y + 0.46], [t.x - 0.46, t.y + 0.46]],
      getFillColor: (t) => {
        const on = !t.startup || visible.has(t.startup.id)
        const dim = explored && t.startup && !discoveredSet.has(t.startup.id) ? 0.35 : 1
        const a = on ? 255 : 50
        if (t.startup?.id === selectedId) return [235, 200, 120, 255]
        if (t.startup && gems.includes(t.startup.id)) return [210, 120, 200, a]
        return [t.color[0] * dim, t.color[1] * dim, t.color[2] * dim, a]
      },
      stroked: false,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 230, 170, 140],
      transitions: { getFillColor: 400 },
      updateTriggers: { getFillColor: [visible, selectedId, gems, explored, discovered] },
      onClick: ({ object }) => object?.startup && select(object.startup.id, false),
    }),
    new TextLayer({
      id: 'labels',
      data: ISLANDS,
      getPosition: (i) => [i.cx, i.cy],
      getText: (i) => i.sector,
      getColor: [240, 160, 200, 230],
      // World units, so labels grow and shrink with the island like a map.
      getSize: (i) => Math.max(4, i.radius * 0.55),
      sizeUnits: 'common',
      sizeMinPixels: 9,
      sizeMaxPixels: 64,
      fontFamily: 'Georgia, serif',
      fontSettings: { sdf: true },
      outlineWidth: 2,
      outlineColor: [0, 0, 0, 255],
      pickable: true,
      onClick: ({ object }) => object && setFilters((f) => ({ ...f, sector: f.sector === object.sector ? '' : object.sector })),
    }),
    new ScatterplotLayer<[number, number]>({
      id: 'wake',
      data: voyage.wake,
      getPosition: (p) => p,
      getRadius: (_, { index }) => 0.15 + (index / Math.max(1, voyage.wake.length)) * 0.35,
      getFillColor: (_, { index }) => [180, 220, 240, 30 + (index / Math.max(1, voyage.wake.length)) * 150],
      updateTriggers: { getRadius: clock, getFillColor: clock },
    }),
    new IconLayer({
      id: 'boat',
      data: selectedTile ? [0] : [],
      // Bobs at anchor, steadier while under sail.
      getPosition: () => [voyage.pos[0], voyage.pos[1] - 1.1 + Math.sin(clock * 2.2) * (voyage.sailing ? 0.05 : 0.15)],
      getIcon: () => (voyage.heading < 0 ? BOAT.left : BOAT.right),
      getSize: 3.2,
      sizeUnits: 'common',
      sizeMinPixels: 18,
      sizeMaxPixels: 56,
      updateTriggers: { getPosition: clock, getIcon: voyage.heading },
    }),
  ]

  const set = (k: keyof Filters) => (e: { target: { value: string } }) => setFilters((f) => ({ ...f, [k]: e.target.value }))
  const isGem = !!selected && gems.includes(selected.id)
  const backers = selected?.investors ?? []
  const inLists = selected ? Object.entries(lists).filter(([, ids]) => ids.includes(selected.id)).map(([n]) => n) : []

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <aside className="left">
        <div className="brand">
          <span className="logo">unicorn~isles</span>
          <button className="icon" title="Collapse sidebar" onClick={() => setCollapsed(!collapsed)}>{collapsed ? '▸' : '◂'}</button>
        </div>
        <nav>
          <button className={panel === 'search' ? 'on' : ''} onClick={() => setPanel(panel === 'search' ? 'map' : 'search')}><i>⌕</i><span>Search</span></button>
          <button className={panel === 'gems' ? 'on' : ''} onClick={() => setPanel(panel === 'gems' ? 'map' : 'gems')}><i>◇</i><span>Watchlist</span><b>{gems.length || ''}</b></button>
          <button onClick={shuffle}><i>✶</i><span>Surprise me</span></button>
        </nav>
        <div className="section">
          <div className="section-head">
            <span>my islands</span>
            <button className="icon" title="Create island" onClick={() => {
              const name = prompt('Island name (e.g. "Nordic seed fintech")')
              if (name && !lists[name]) setLists({ ...lists, [name]: [] })
            }}>+</button>
          </div>
          {Object.keys(lists).length === 0 && <p className="muted">no islands yet...</p>}
          {Object.entries(lists).map(([name, ids]) => (
            <button key={name} className="list-row" onClick={() => setPanel('lists')}>{name}<b>{ids.length}</b></button>
          ))}
        </div>
        {loginOpen && !session && (
          <form className="login" onSubmit={async (e) => {
            e.preventDefault()
            setLoginMsg('sending…')
            const err = await sendMagicLink(email)
            setLoginMsg(err ?? 'Check your inbox for the sign-in link.')
          }}>
            <input type="email" required placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit">send sign-in link</button>
            {loginMsg && <p className="muted">{loginMsg}</p>}
          </form>
        )}
        <div className="profile">
          <div className="avatar" />
          <div className="profile-text">
            <div className="who">{session?.user.email?.split('@')[0] ?? 'guest investor'}</div>
            <div className="muted">{discovered.length} discovered · {gems.length} gemmed</div>
          </div>
          {supabase && (session
            ? <button className="icon" title="Sign out" onClick={() => signOut()}>⏻</button>
            : <button className="icon" title="Sign in" onClick={() => setLoginOpen(!loginOpen)}>⇥</button>)}
        </div>
      </aside>

      <main className="map">
        <DeckGL
          views={new OrthographicView({ flipY: true })}
          viewState={view}
          controller
          onViewStateChange={({ viewState }) => setView(viewState as typeof view)}
          layers={layers}
          getTooltip={({ object }) => {
            const s = (object as Tile)?.startup
            return s ? { html: `<b>${s.name}</b><div>${s.sector} · ${s.country}${s.founded ? ` · ${s.founded}` : ''}</div>`, className: 'map-tip', style: {} } : null
          }}
          style={{ background: '#000' }}
        />
        <div className="map-top">
          <span className="coords">{Math.round(view.target[0])}~{Math.round(view.target[1])}</span>
          <button className={explored ? 'on' : ''} onClick={() => setExplored(!explored)}>Exploration map ▾</button>
        </div>

        {panel !== 'map' && (
          <div className="drawer">
            {panel === 'search' && (
              <>
                <input autoFocus placeholder="type..." value={filters.q} onChange={set('q')} />
                <ul>{STARTUPS.filter((s) => filters.q && matches(s, filters)).slice(0, 30).map((s) => (
                  <li key={s.id} onClick={() => select(s.id)}>{s.name} <span className="muted">{s.sector} · {s.country}</span></li>
                ))}</ul>
              </>
            )}
            {panel === 'gems' && (
              <ul>{gems.length === 0 && <li className="muted">nothing gemmed yet</li>}
                {gems.map((id) => BY_ID.get(id)?.startup).filter(Boolean).map((s) => (
                  <li key={s!.id} onClick={() => select(s!.id)}>{s!.name} <span className="muted">{s!.stage}</span></li>
                ))}</ul>
            )}
            {panel === 'lists' && Object.entries(lists).map(([name, ids]) => (
              <div key={name}>
                <h4>{name}</h4>
                <ul>{ids.map((id) => BY_ID.get(id)?.startup).filter(Boolean).map((s) => (
                  <li key={s!.id} onClick={() => select(s!.id)}>{s!.name}</li>
                ))}</ul>
              </div>
            ))}
          </div>
        )}

        <div className="filters">
          <button className="chip" onClick={() => setMoreFilters(!moreFilters)}>{moreFilters ? '▾ less filters' : '▸ filters'}</button>
          {filtering && <span className="chip count">{visible.size} startups</span>}
          {filtering && <button className="chip" onClick={() => setFilters(NO_FILTERS)}>clear</button>}
          {filtering && <button className="chip" title="Saved filters" onClick={() => setSavedFilters([...savedFilters, filters])}>save</button>}
          {savedFilters.map((f, i) => <button key={i} className="chip" onClick={() => setFilters(f)}>saved {i + 1}</button>)}
          {moreFilters && (
            <>
              <select className="chip" value={filters.sector} onChange={set('sector')}><option value="">sector</option>{SECTORS.map((s) => <option key={s}>{s}</option>)}</select>
              {HAS_STAGES && <select className="chip" value={filters.stage} onChange={set('stage')}><option value="">stage</option>{STAGES.map((s) => <option key={s}>{s}</option>)}</select>}
              <select className="chip" value={filters.country} onChange={set('country')}><option value="">places</option>{COUNTRIES.map((s) => <option key={s}>{s}</option>)}</select>
              <span className="chip range">founded <input placeholder="from" value={filters.yearMin} onChange={set('yearMin')} /> <input placeholder="to" value={filters.yearMax} onChange={set('yearMax')} /></span>
            </>
          )}
        </div>

        <footer className="transport">
          <button title="Previous (p)" onClick={previous} disabled={!history.length}>«</button>
          <button className={`big ${sofa ? 'on' : ''}`} title="sofa mode" onClick={() => setSofa(!sofa)}>⛵ {sofa ? 'sailing…' : 'sofa mode'}</button>
          <button className="wide" title="Next: navigate (n)" onClick={next}>» navigate</button>
        </footer>
      </main>

      <aside className="right">
        {selected ? (
          <div className="card" key={selected.id}>
            <div className="hero">
              <Logo name={selected.name} website={selected.website} color={selectedTile?.color ?? [90, 90, 90]} />
              <div>
                <h2>{selected.name}</h2>
                <div className="muted">{selected.sector} · {selected.country} · est. {selected.founded}</div>
              </div>
            </div>
            <div className="actions">
              <button className={isGem ? 'on' : ''} title="Gem" onClick={() => setGems(isGem ? gems.filter((g) => g !== selected.id) : [...gems, selected.id])}>◆ {isGem ? 'gemmed' : 'gem'}</button>
              <select title="add to island" value="" onChange={(e) => {
                const n = e.target.value
                if (n) setLists({ ...lists, [n]: [...new Set([...lists[n], selected.id])] })
              }}>
                <option value="">add to island</option>
                {Object.keys(lists).map((n) => <option key={n}>{n}</option>)}
              </select>
              <button title="shuffle" onClick={shuffle}>⇄ shuffle</button>
            </div>
            <p className="pitch">{selected.description}</p>
            <dl>
              <dt>stage</dt><dd>{selected.stage} <span className="muted">({selected.rounds.length} rounds)</span></dd>
              {selected.funding && <><dt>raised</dt><dd>{selected.funding}</dd></>}
              {selected.hq && <><dt>hq</dt><dd>{selected.hq}</dd></>}
              {selected.website && <><dt>web</dt><dd><a href={`https://${selected.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer">{selected.website}</a></dd></>}
              {selected.founders.length > 0 && <><dt>founders</dt><dd>{selected.founders.map((f) => f.name).join(', ')}</dd></>}
            </dl>
            <h4>Backed by</h4>
            <div className="chips">
              {backers.length === 0 && <span className="muted">no investors on record</span>}
              {backers.map((b) => (
                <span key={b.id} className={`tag ${filters.investor === b.id ? 'on' : ''}`} title="Show this investor's portfolio"
                  onClick={() => setFilters((f) => ({ ...f, investor: f.investor === b.id ? '' : b.id }))}>{b.name}</span>
              ))}
            </div>
            <h4>In islands</h4>
            <div className="chips">
              <span className="tag" onClick={() => setFilters({ ...NO_FILTERS, sector: selected.sector })}>{selected.sector}</span>
              {inLists.map((n) => <span key={n} className="tag">{n}</span>)}
            </div>
            <h4>Rounds</h4>
            <ul className="rounds">
              {selected.rounds.length === 0 && <li className="muted">none on record</li>}
              {selected.rounds.map((r) => <li key={r.id}>funding round · {r.date ?? 'date unknown'}</li>)}
            </ul>
            <div className="source">
              {IS_MOCK ? 'Mock data' : 'Data from Cala'}
              {selected.sources.slice(0, 3).map((s) => <div key={s}><a href={s} target="_blank" rel="noreferrer">{s.replace(/^https?:\/\//, '').slice(0, 45)}</a></div>)}
            </div>
          </div>
        ) : <p className="muted">select a startup</p>}
      </aside>
    </div>
  )
}
