import { useEffect, useMemo, useRef, useState } from 'react'
import { DeckGL } from '@deck.gl/react'
import { LinearInterpolator, OrthographicView } from '@deck.gl/core'
import { IconLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { IS_MOCK, POSITIONS, SECTORS, STAGES, STARTUPS } from './data/load'
import type { Startup } from './data/types'
import { layoutIslands, type Tile } from './layout'
import { useStored } from './useStored'
import { sendMagicLink, signOut, supabase, useSession } from './auth'
import { useClock, useVoyage } from './anim'
import { Icon, iconUrl, type IconName } from './icons'
import { Logo, sigilUrl } from './Logo'
import './App.css'

const { tiles: TILES, islands: ISLANDS } = layoutIslands(STARTUPS, SECTORS, POSITIONS)
const BY_ID = new Map(TILES.filter((t) => t.startup).map((t) => [t.startup!.id, t]))
const LAND = new Map(TILES.map((t) => [`${t.x},${t.y}`, t]))
const COUNTRIES = [...new Set(STARTUPS.map((s) => s.country))].sort()
const YEARS = [...new Set(STARTUPS.map((s) => s.founded).filter(Boolean) as number[])].sort()
// Stage comes from funding rounds; hide it until Cala details are imported.
const HAS_STAGES = STARTUPS.some((s) => s.stage !== 'Unknown')
const SOFA_SECONDS = 6
const THIS_YEAR = new Date().getFullYear()

const FLY = {
  transitionDuration: 1200,
  transitionInterpolator: new LinearInterpolator({ transitionProps: ['target', 'zoom'] }),
  transitionEasing: (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
}

// Glints on open water, scattered once around the archipelago.
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
const SPRITE = {
  gem: { url: iconUrl('gem', '#f0a0d8'), width: 64, height: 64, id: 'gem' },
  coin: { url: iconUrl('coin', '#ebc878'), width: 64, height: 64, id: 'coin' },
  seed: { url: iconUrl('seed', '#7ee0a0'), width: 64, height: 64, id: 'seed' },
}

interface Filters { sector: string; stage: string; country: string; investor: string; year: string; funded: string }
const NO_FILTERS: Filters = { sector: '', stage: '', country: '', investor: '', year: '', funded: '' }
type Drawer = 'none' | 'search' | 'gems' | 'island'

function matches(s: Startup, f: Filters) {
  return (!f.sector || s.sector === f.sector)
    && (!f.stage || s.stage === f.stage)
    && (!f.country || s.country === f.country)
    && (!f.investor || s.investors.some((i) => i.id === f.investor))
    && (!f.year || s.founded === +f.year)
    && (!f.funded || !!s.funding || s.rounds.length > 0)
}

function readHash(): { x: number; y: number; id?: string } | null {
  const m = location.hash.match(/^#(-?\d+)~(-?\d+)(?:\/startup~([\w-]+))?/)
  return m ? { x: +m[1], y: +m[2], id: m[3] } : null
}

const dist = (a: Tile, b: Tile) => Math.hypot(a.x - b.x, a.y - b.y)

export default function App() {
  const initial = readHash()
  const startId = initial?.id && BY_ID.has(initial.id) ? initial.id : STARTUPS[0].id
  const start = BY_ID.get(startId)!
  const [view, setView] = useState<{ target: [number, number, number]; zoom: number } & Partial<typeof FLY>>({ target: [start.x, start.y, 0], zoom: 4.2 })
  const [selectedId, setSelectedId] = useState(startId)
  const [history, setHistory] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [showFilters, setShowFilters] = useState(true)
  const [drawer, setDrawer] = useState<Drawer>('none')
  const [openIsland, setOpenIsland] = useState('')
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const session = useSession()
  const uid = session?.user.id
  const [gems, setGems] = useStored<string[]>('gems', [], uid, 'gems')
  const [lists, setLists] = useStored<Record<string, string[]>>('lists', {}, uid, 'lists')
  const [discovered, setDiscovered] = useStored<string[]>('discovered', [], uid, 'discovered')
  const [savedFilters, setSavedFilters] = useStored<Filters[]>('savedFilters', [], uid, 'saved_filters')
  const [newIsland, setNewIsland] = useState<string | null>(null)
  const [addMenu, setAddMenu] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [loginMsg, setLoginMsg] = useState('')
  const [sofa, setSofa] = useState(false)
  const [explored, setExplored] = useState(false)
  const [copied, setCopied] = useState(false)
  const lastHop = useRef(0)

  const clock = useClock()
  const tile = BY_ID.get(selectedId)!
  const selected = tile.startup!
  const voyage = useVoyage([tile.x, tile.y], clock)
  const visible = useMemo(() => new Set(STARTUPS.filter((s) => matches(s, filters)).map((s) => s.id)), [filters])
  const discoveredSet = useMemo(() => new Set(discovered), [discovered])
  const gemSet = useMemo(() => new Set(gems.filter((g) => BY_ID.has(g))), [gems])
  const filtering = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)
  const isGem = gemSet.has(selected.id)

  // Closest startups on the same island: the "album" around the current one.
  const neighbours = useMemo(() => TILES
    .filter((t) => t.startup && t.sector === tile.sector)
    .sort((a, b) => dist(a, tile) - dist(b, tile))
    .slice(0, 6)
    .map((t) => t.startup!), [tile])

  function flyTo(x: number, y: number, zoom?: number) {
    setView((v) => ({ ...v, ...FLY, target: [x, y, 0], zoom: zoom ?? Math.max(v.zoom, 3.6) }))
  }

  function select(id: string, fly = true) {
    const t = BY_ID.get(id)
    if (!t || id === selectedId) return
    setHistory((h) => [...h, selectedId].slice(-200))
    setSelectedId(id)
    setAddMenu(false)
    if (!discoveredSet.has(id)) setDiscovered([...discovered, id])
    if (fly) flyTo(t.x, t.y)
    lastHop.current = clock
  }

  // Next = nearest unseen startup that passes the filters, preferring this island.
  function next() {
    const pool = TILES.filter((t) => t.startup && t.startup.id !== selectedId && visible.has(t.startup.id))
    const unseen = pool.filter((t) => !discoveredSet.has(t.startup!.id))
    const candidates = unseen.length ? unseen : pool
    const sameIsland = candidates.filter((t) => t.sector === tile.sector)
    const from = sameIsland.length ? sameIsland : candidates
    if (!from.length) return
    select(from.reduce((a, b) => (dist(a, tile) <= dist(b, tile) ? a : b)).startup!.id)
  }

  function shuffle() {
    const pool = STARTUPS.filter((s) => visible.has(s.id) && s.id !== selectedId)
    if (pool.length) select(pool[Math.floor(Math.random() * pool.length)].id)
  }

  function previous() {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory((h) => h.slice(0, -1))
    setSelectedId(prev)
    const t = BY_ID.get(prev)!
    flyTo(t.x, t.y)
  }

  const toggleGem = () => setGems(isGem ? gems.filter((g) => g !== selected.id) : [...gems.filter((g) => BY_ID.has(g)), selected.id])
  const toggleFilter = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: f[k] === v ? '' : v }))

  // The canvas only gets its final size after the first layout pass.
  useEffect(() => {
    const id = setTimeout(() => flyTo(start.x, start.y, 4.2), 150)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    window.history.replaceState(null, '', `#${tile.x}~${tile.y}/startup~${selectedId}`)
  }, [selectedId, tile])

  // Sofa mode: hop to the next startup every few seconds.
  useEffect(() => {
    if (sofa && clock - lastHop.current > SOFA_SECONDS) {
      lastHop.current = clock
      next()
    }
  })

  useEffect(() => {
    const island = ISLANDS.find((i) => i.sector === filters.sector)
    if (island) flyTo(island.cx, island.cy, 2.5)
  }, [filters.sector])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return
      const actions: Record<string, () => void> = {
        n: next, ArrowRight: next, p: previous, ArrowLeft: previous, s: shuffle, g: toggleGem,
        '/': () => setDrawer('search'),
        r: () => flyTo(tile.x, tile.y),
        ' ': () => { lastHop.current = clock; setSofa((v) => !v) },
        Escape: () => setDrawer('none'),
      }
      if (actions[e.key]) {
        e.preventDefault()
        actions[e.key]()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const zoomedIn = view.zoom >= 3
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
      getPolygon: (t) => [[t.x - 0.47, t.y - 0.47], [t.x + 0.47, t.y - 0.47], [t.x + 0.47, t.y + 0.47], [t.x - 0.47, t.y + 0.47]],
      getFillColor: (t) => {
        const on = !t.startup || visible.has(t.startup.id)
        const dim = explored && t.startup && !discoveredSet.has(t.startup.id) ? 0.3 : 1
        const a = on ? 255 : 45
        return [t.color[0] * dim, t.color[1] * dim, t.color[2] * dim, a]
      },
      stroked: false,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 50],
      transitions: { getFillColor: 400 },
      updateTriggers: { getFillColor: [visible, explored, discovered] },
      onClick: ({ object }) => object?.startup && select(object.startup.id, false),
    }),
    new IconLayer<Tile>({
      id: 'sprites',
      data: zoomedIn ? TILES.filter((t) => t.startup && t.startup.id !== selectedId && (gemSet.has(t.startup.id) || t.startup.funding || (t.startup.founded ?? 0) >= THIS_YEAR - 2)) : [],
      getPosition: (t) => [t.x + 0.22, t.y - 0.22],
      getIcon: (t) => (gemSet.has(t.startup!.id) ? SPRITE.gem : t.startup!.funding ? SPRITE.coin : SPRITE.seed),
      getSize: 0.5,
      sizeUnits: 'common',
      updateTriggers: { getIcon: gems },
    }),
    new IconLayer<Tile>({
      id: 'cover',
      data: [tile],
      getPosition: (t) => [t.x, t.y],
      getIcon: (t) => ({ url: sigilUrl(t.startup!.name, t.color), width: 70, height: 70, id: `s-${t.startup!.id}` }),
      getSize: 1.15,
      sizeUnits: 'common',
      sizeMinPixels: 6,
    }),
    new TextLayer({
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
      characterSet: 'auto',
      fontSettings: { sdf: true },
      outlineWidth: 3,
      outlineColor: [10, 9, 9, 220],
      pickable: true,
      onClick: ({ object }) => object && toggleFilter('sector', object.sector),
    }),
    new ScatterplotLayer<[number, number]>({
      id: 'wake',
      data: voyage.wake,
      getPosition: (p) => p,
      getRadius: (_, { index }) => 0.12 + (index / Math.max(1, voyage.wake.length)) * 0.3,
      getFillColor: (_, { index }) => [190, 225, 240, 30 + (index / Math.max(1, voyage.wake.length)) * 160],
      updateTriggers: { getRadius: clock, getFillColor: clock },
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
      sizeMaxPixels: 60,
      updateTriggers: { getPosition: clock, getIcon: voyage.heading },
    }),
  ]

  const results = query.trim().length > 1
    ? STARTUPS.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 40)
    : []
  const islandMembers = openIsland ? (lists[openIsland] ?? []).map((id) => BY_ID.get(id)?.startup).filter(Boolean) as Startup[] : []
  const sofaProgress = sofa ? Math.min(1, (clock - lastHop.current) / SOFA_SECONDS) : 0
  const funded = !!selected.funding || selected.rounds.length > 0

  const filterRows: { key: keyof Filters; label: string; options: string[]; value: string | null }[] = [
    { key: 'sector', label: 'sector', options: SECTORS, value: selected.sector },
    { key: 'country', label: 'places', options: COUNTRIES, value: selected.country },
    { key: 'year', label: 'founded', options: YEARS.map(String), value: selected.founded ? String(selected.founded) : null },
    ...(HAS_STAGES ? [{ key: 'stage' as const, label: 'stage', options: STAGES, value: selected.stage }] : []),
    { key: 'funded', label: 'funding', options: ['funded'], value: funded ? 'funded' : null },
  ]

  const iconButtons: { icon: IconName; title: string; on?: boolean; act: () => void; disabled?: boolean }[] = [
    { icon: 'island', title: `Only ${selected.sector}`, on: filters.sector === selected.sector, act: () => toggleFilter('sector', selected.sector) },
    { icon: 'flag', title: `Only ${selected.country}`, on: filters.country === selected.country, act: () => toggleFilter('country', selected.country) },
    { icon: 'calendar', title: selected.founded ? `Only founded in ${selected.founded}` : 'Founding year unknown', on: !!filters.year && filters.year === String(selected.founded), act: () => { if (selected.founded) toggleFilter('year', String(selected.founded)) }, disabled: !selected.founded },
    { icon: 'coin', title: 'Only funded startups', on: !!filters.funded, act: () => toggleFilter('funded', 'funded') },
    { icon: 'target', title: 'Recenter (r)', act: () => flyTo(tile.x, tile.y) },
    { icon: 'link', title: copied ? 'Link copied' : 'Copy link to this startup', on: copied, act: () => { navigator.clipboard?.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1500) } },
    { icon: 'dots', title: explored ? 'Show all tiles' : 'Dim startups you have not seen', on: explored, act: () => setExplored(!explored) },
  ]

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <nav className="left">
        <section className="block nav-block">
          <div className="brand">
            <span className="logo">unicorn~isles</span>
            <button className="icon-btn" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}>{collapsed ? '▸' : '◂'}</button>
          </div>
          <button className={`nav-item ${drawer === 'search' ? 'on' : ''}`} onClick={() => setDrawer(drawer === 'search' ? 'none' : 'search')}><Icon name="search" /><span>Search</span></button>
          <button className={`nav-item ${drawer === 'gems' ? 'on' : ''}`} onClick={() => setDrawer(drawer === 'gems' ? 'none' : 'gems')}><Icon name="gem" /><span>Gems</span>{gemSet.size > 0 && <b className="badge">{gemSet.size}</b>}</button>
          <button className="nav-item" onClick={shuffle}><Icon name="compass" /><span>Surprise me</span></button>
          <button className="nav-item" disabled title="Coming soon"><Icon name="chat" /><span>Messages</span></button>
        </section>

        <section className="block islands-block">
          <div className="block-head">
            <span>islands</span>
            <button className="icon-btn" title="Create island" onClick={() => setNewIsland('')}><Icon name="plus" size={12} /></button>
          </div>
          <button className={`nav-item ${!filters.sector ? 'on' : ''}`} onClick={() => setFilters((f) => ({ ...f, sector: '' }))}><Icon name="island" /><span>All islands</span></button>
          {newIsland !== null && (
            <form className="inline-form" onSubmit={(e) => {
              e.preventDefault()
              const name = newIsland.trim()
              if (name && !lists[name]) setLists({ ...lists, [name]: [] })
              setNewIsland(null)
            }}>
              <input autoFocus placeholder="island name, e.g. Nordic seed fintech" value={newIsland} onChange={(e) => setNewIsland(e.target.value)} onBlur={() => !newIsland && setNewIsland(null)} />
            </form>
          )}
          {Object.entries(lists).map(([name, ids]) => (
            <button key={name} className={`nav-item sub ${drawer === 'island' && openIsland === name ? 'on' : ''}`} onClick={() => { setOpenIsland(name); setDrawer('island') }}>
              <span className="dot" /><span>{name}</span><b className="count-badge">{ids.length}</b>
            </button>
          ))}
          {Object.keys(lists).length === 0 && newIsland === null && <p className="muted pad">no islands yet... collect startups into your own islands</p>}
        </section>

        <section className="block profile">
          <img className="avatar" src={sigilUrl(session?.user.email ?? 'guest', [110, 80, 150])} alt="" />
          <div className="profile-text">
            <div className="who">{session?.user.email?.split('@')[0] ?? 'guest sailor'}</div>
            <div className="muted"><Icon name="boat" size={10} /> {discovered.length} startups discovered</div>
          </div>
        </section>
        {loginOpen && !session && (
          <form className="block login" onSubmit={async (e) => {
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
        <section className="block bottom-row">
          <button className="nav-item small" onClick={() => { setFilters(NO_FILTERS); setExplored(false) }}><Icon name="gear" size={12} /><span>Reset view</span></button>
          {supabase && (session
            ? <button className="nav-item small" onClick={() => signOut()}><Icon name="door" size={12} /><span>Sign out</span></button>
            : <button className="nav-item small" onClick={() => setLoginOpen(!loginOpen)}><Icon name="door" size={12} /><span>Sign in</span></button>)}
        </section>
      </nav>

      <main className="map">
        <div className="map-canvas">
          <DeckGL
            views={new OrthographicView({ flipY: true })}
            viewState={view}
            controller={{ inertia: 400 }}
            onViewStateChange={({ viewState }) => setView(viewState as typeof view)}
            layers={layers}
            getCursor={({ isHovering }) => (isHovering ? 'pointer' : 'grab')}
            getTooltip={({ object }) => {
              const s = (object as Tile)?.startup
              return s ? { html: `<b>${s.name}</b><div>${s.sector} · ${s.country}${s.founded ? ` · ${s.founded}` : ''}</div>`, className: 'map-tip', style: {} } : null
            }}
          />
          <header className="map-head">
            <span className="coords">{tile.x}~{tile.y}</span>
            <button className={`map-title ${explored ? 'on' : ''}`} onClick={() => setExplored(!explored)} title="Dim startups you have not seen">
              <Icon name="target" /> {explored ? 'Exploration map' : 'Archipelago'} <Icon name="down" size={10} />
            </button>
            <button className="recenter" title="Recenter (r)" onClick={() => flyTo(tile.x, tile.y)}><Icon name="boat" size={18} /><span>Recenter</span></button>
          </header>

          {drawer !== 'none' && (
            <div className="drawer">
              <div className="drawer-head">
                <span>{drawer === 'search' ? 'search' : drawer === 'gems' ? 'gems' : openIsland}</span>
                <button className="icon-btn" onClick={() => setDrawer('none')}>✕</button>
              </div>
              {drawer === 'search' && (
                <>
                  <input autoFocus placeholder="startup name or keyword…" value={query} onChange={(e) => setQuery(e.target.value)} />
                  <StartupList items={results} current={selectedId} onPick={select} empty={query.trim().length > 1 ? 'no match' : 'type at least 2 letters'} />
                </>
              )}
              {drawer === 'gems' && <StartupList items={[...gemSet].map((id) => BY_ID.get(id)!.startup!)} current={selectedId} onPick={select} empty="nothing gemmed yet, press g on a startup" />}
              {drawer === 'island' && (
                <>
                  <StartupList items={islandMembers} current={selectedId} onPick={select} empty="empty island, use “add to island” on a startup" />
                  <button className="danger" onClick={() => { setLists(Object.fromEntries(Object.entries(lists).filter(([n]) => n !== openIsland))); setDrawer('none') }}>delete island</button>
                </>
              )}
            </div>
          )}

          <div className={`filters ${showFilters ? '' : 'folded'}`}>
            <div className="filter-tools">
              <button className="chip ghost" title={showFilters ? 'Hide filters' : 'Show filters'} onClick={() => setShowFilters(!showFilters)}><Icon name="down" size={10} /></button>
              {filtering && <span className="chip count">{visible.size} startups</span>}
              {filtering && <button className="chip ghost" onClick={() => setFilters(NO_FILTERS)}>clear</button>}
              {filtering && <button className="chip ghost" title="Save these filters" onClick={() => setSavedFilters([...savedFilters, filters])}><Icon name="save" size={11} /></button>}
              {savedFilters.map((f, i) => (
                <button key={i} className="chip ghost" title={Object.values(f).filter(Boolean).join(' · ')} onClick={() => setFilters(f)}>★{i + 1}</button>
              ))}
            </div>
            {showFilters && filterRows.map((row) => (
              <div key={row.key} className="filter-row">
                <label className={`chip label ${filters[row.key] ? 'active' : ''}`}>
                  <select value={filters[row.key]} onChange={(e) => setFilters((f) => ({ ...f, [row.key]: e.target.value }))}>
                    <option value="">{row.label}</option>
                    {row.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <span>{filters[row.key] || row.label}</span>
                </label>
                {row.value && (
                  <button className={`chip value ${filters[row.key] === row.value ? 'active' : ''}`} title={`Only ${row.value}`} onClick={() => toggleFilter(row.key, row.value!)}>{row.value}</button>
                )}
              </div>
            ))}
            {filters.investor && (
              <div className="filter-row">
                <span className="chip label active">investor</span>
                <button className="chip value active" onClick={() => toggleFilter('investor', filters.investor)}>{STARTUPS.flatMap((s) => s.investors).find((i) => i.id === filters.investor)?.name ?? 'investor'} ✕</button>
              </div>
            )}
          </div>
        </div>

        <footer className="transport">
          <div className="transport-main">
            <button className="t-btn" title="Previous (p)" onClick={previous} disabled={!history.length}><Icon name="prev" /></button>
            <button className={`t-btn boat-btn ${sofa ? 'on' : ''}`} title="Sofa mode: sail on autopilot (space)" onClick={() => { lastHop.current = clock; setSofa(!sofa) }}>
              <Icon name="boat" size={22} />
            </button>
            <button className="t-btn wide" title="Next: navigate (n)" onClick={next}><Icon name="next" /><span>navigate</span></button>
            <button className="t-btn" title="Surprise me (s)" onClick={shuffle}><Icon name="compass" /></button>
          </div>
          <div className="transport-bar">
            <button className="t-mini" onClick={() => { lastHop.current = clock; setSofa(!sofa) }}><Icon name={sofa ? 'pause' : 'play'} size={10} /></button>
            <span className="time">{sofa ? `0:0${Math.floor(sofaProgress * SOFA_SECONDS)}` : '0:00'}</span>
            <div className="bar"><div className="bar-fill" style={{ width: `${sofaProgress * 100}%` }} /></div>
            <span className="time">0:0{SOFA_SECONDS}</span>
          </div>
        </footer>
      </main>

      <aside className="right">
        <section className="block cover" key={selected.id}>
          <div className="postcard">
            {[-3, -2, -1, 0, 1, 2, 3].map((dy) => [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((dx) => {
              const t = LAND.get(`${tile.x + dx},${tile.y + dy}`)
              return <i key={`${dx},${dy}`} style={{ background: t ? `rgb(${t.color.join(',')})` : 'transparent' }} />
            }))}
            <Logo name={selected.name} website={selected.website} color={tile.color} className="postcard-logo" />
          </div>
          <div className="cover-text">
            <h2>{selected.name}</h2>
            <div className="muted">{selected.sector} · {selected.country}{selected.founded ? ` · est. ${selected.founded}` : ''}</div>
          </div>
        </section>

        <section className="actions">
          <button className={`a-btn gem-btn ${isGem ? 'on' : ''}`} title="Gem (g)" onClick={toggleGem}><Icon name="gem" /><small>{isGem ? 1 : 0}</small></button>
          <div className="add-wrap">
            <button className="a-btn wide" onClick={() => setAddMenu(!addMenu)}><Icon name="save" /><span>add to island</span></button>
            {addMenu && (
              <div className="menu">
                {Object.keys(lists).map((n) => {
                  const inIt = lists[n].includes(selected.id)
                  return <button key={n} className={inIt ? 'on' : ''} onClick={() => setLists({ ...lists, [n]: inIt ? lists[n].filter((x) => x !== selected.id) : [...lists[n], selected.id] })}>{inIt ? '✓ ' : ''}{n}</button>
                })}
                <button className="muted" onClick={() => { setAddMenu(false); setNewIsland('') }}>+ new island</button>
              </div>
            )}
          </div>
          <button className="a-btn" title="Next (n)" onClick={next}><Icon name="next" /></button>
        </section>

        <section className="icon-row">
          {iconButtons.map((b) => (
            <button key={b.icon} className={`i-btn ${b.on ? 'on' : ''}`} title={b.title} disabled={b.disabled} onClick={b.act}><Icon name={b.icon} size={16} /></button>
          ))}
        </section>

        <section className="block">
          <div className="section-title">Island <b>{selected.sector}</b></div>
          <StartupList items={neighbours} current={selectedId} onPick={select} meta={(s) => s.country} />
        </section>

        <section className="block about card-in" key={`about-${selected.id}`}>
          <div className="section-title">About</div>
          <p className="pitch">{selected.description || 'No description yet.'}</p>
          <dl>
            {selected.funding && <><dt>raised</dt><dd>{selected.funding}</dd></>}
            {HAS_STAGES && <><dt>stage</dt><dd>{selected.stage}</dd></>}
            {selected.hq && <><dt>hq</dt><dd>{selected.hq}</dd></>}
            {selected.founders.length > 0 && <><dt>founders</dt><dd>{selected.founders.map((f) => f.name).join(', ')}</dd></>}
          </dl>
          <div className="section-title">Backed by</div>
          <div className="chips">
            {selected.investors.length === 0 && <span className="muted">no investors on record yet</span>}
            {selected.investors.map((b) => (
              <button key={b.id} className={`tag ${filters.investor === b.id ? 'on' : ''}`} title="Light up this investor's portfolio" onClick={() => toggleFilter('investor', b.id)}>{b.name}</button>
            ))}
          </div>
          {selected.rounds.length > 0 && (
            <>
              <div className="section-title">Rounds</div>
              <ul className="rounds">{selected.rounds.map((r) => <li key={r.id}>funding round · {r.date ?? 'date unknown'}</li>)}</ul>
            </>
          )}
        </section>

        <section className="block footer-link">
          {selected.website
            ? <a href={`https://${selected.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer"><Icon name="link" size={12} /> Visit {selected.website}</a>
            : <span className="muted"><Icon name="link" size={12} /> {IS_MOCK ? 'Mock data' : 'Data from Cala'}</span>}
          {selected.sources.slice(0, 3).map((s) => <a key={s} className="source" href={s} target="_blank" rel="noreferrer">{s.replace(/^https?:\/\//, '').slice(0, 40)}</a>)}
        </section>
      </aside>
    </div>
  )
}

function StartupList({ items, current, onPick, meta, empty }: { items: Startup[]; current: string; onPick: (id: string) => void; meta?: (s: Startup) => string; empty?: string }) {
  if (!items.length) return <p className="muted pad">{empty}</p>
  return (
    <ul className="track-list">
      {items.map((s) => {
        const t = BY_ID.get(s.id)!
        return (
          <li key={s.id} className={s.id === current ? 'current' : ''} onClick={() => onPick(s.id)}>
            <img src={sigilUrl(s.name, t.color)} alt="" />
            <span className="name">{s.name}</span>
            <span className="meta">{meta ? meta(s) : s.sector}</span>
          </li>
        )
      })}
    </ul>
  )
}
