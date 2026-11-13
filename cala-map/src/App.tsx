import { useEffect, useMemo, useState } from 'react'
import { DeckGL } from '@deck.gl/react'
import { OrthographicView } from '@deck.gl/core'
import { PolygonLayer, TextLayer } from '@deck.gl/layers'
import { SECTORS, mockStartups } from './data/mock'
import type { Startup } from './data/types'
import { layoutIslands, type Tile } from './layout'
import { useStored } from './useStored'
import './App.css'

const STARTUPS = mockStartups()
const { tiles: TILES, islands: ISLANDS } = layoutIslands(STARTUPS, SECTORS)
const BY_ID = new Map(TILES.filter((t) => t.startup).map((t) => [t.startup!.id, t]))
const STAGES = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+']
const COUNTRIES = [...new Set(STARTUPS.map((s) => s.country))].sort()

interface Filters { sector: string; stage: string; country: string; model: string; yearMin: string; yearMax: string; raisedMin: string; q: string }
const NO_FILTERS: Filters = { sector: '', stage: '', country: '', model: '', yearMin: '', yearMax: '', raisedMin: '', q: '' }

type Panel = 'map' | 'search' | 'gems' | 'lists'

function matches(s: Startup, f: Filters) {
  return (!f.sector || s.sector === f.sector)
    && (!f.stage || s.stage === f.stage)
    && (!f.country || s.country === f.country)
    && (!f.model || s.model === f.model)
    && (!f.yearMin || s.founded >= +f.yearMin)
    && (!f.yearMax || s.founded <= +f.yearMax)
    && (!f.raisedMin || s.totalRaisedM >= +f.raisedMin)
    && (!f.q || s.name.toLowerCase().includes(f.q.toLowerCase()))
}

function readHash(): { x: number; y: number; id?: string } | null {
  const m = location.hash.match(/^#(-?\d+)~(-?\d+)(?:\/startup~(\w+))?/)
  return m ? { x: +m[1], y: +m[2], id: m[3] } : null
}

export default function App() {
  const initial = readHash()
  const start = BY_ID.get(initial?.id ?? STARTUPS[0].id)
  const [view, setView] = useState({ target: [initial?.x ?? start?.x ?? 0, initial?.y ?? start?.y ?? 0, 0] as [number, number, number], zoom: 2 })
  const [selectedId, setSelectedId] = useState<string | undefined>(initial?.id ?? STARTUPS[0].id)
  const [history, setHistory] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [moreFilters, setMoreFilters] = useState(true)
  const [panel, setPanel] = useState<Panel>('map')
  const [collapsed, setCollapsed] = useState(false)
  const [gems, setGems] = useStored<string[]>('gems', [])
  const [lists, setLists] = useStored<Record<string, string[]>>('lists', {})
  const [discovered, setDiscovered] = useStored<string[]>('discovered', [])
  const [savedFilters, setSavedFilters] = useStored<Filters[]>('savedFilters', [])
  const [sofa, setSofa] = useState(false)
  const [explored, setExplored] = useState(false)

  const selected = selectedId ? BY_ID.get(selectedId)?.startup : undefined
  const visible = useMemo(() => new Set(STARTUPS.filter((s) => matches(s, filters)).map((s) => s.id)), [filters])
  const discoveredSet = useMemo(() => new Set(discovered), [discovered])
  const filtering = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)

  function select(id: string, fly = true) {
    const t = BY_ID.get(id)
    if (!t) return
    if (selectedId && selectedId !== id) setHistory((h) => [...h, selectedId])
    setSelectedId(id)
    if (!discoveredSet.has(id)) setDiscovered([...discovered, id])
    if (fly) setView((v) => ({ ...v, target: [t.x, t.y, 0], zoom: Math.max(v.zoom, 3) }))
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
    setView((v) => ({ ...v, target: [t.x, t.y, 0] }))
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

  const layers = [
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
      updateTriggers: { getFillColor: [visible, selectedId, gems, explored, discovered] },
      onClick: ({ object }) => object?.startup && select(object.startup.id, false),
    }),
    new TextLayer({
      id: 'labels',
      data: ISLANDS,
      getPosition: (i) => [i.cx, i.cy - 8],
      getText: (i) => i.sector,
      getColor: [240, 160, 200, 230],
      getSize: 26,
      fontFamily: 'Georgia, serif',
      fontSettings: { sdf: true },
      outlineWidth: 2,
      outlineColor: [0, 0, 0, 255],
      pickable: true,
      onClick: ({ object }) => object && setFilters((f) => ({ ...f, sector: f.sector === object.sector ? '' : object.sector })),
    }),
    new TextLayer({
      id: 'boat',
      data: selected ? [BY_ID.get(selected.id)!] : [],
      getPosition: (t) => [t.x, t.y - 1.2],
      getText: () => '⛵',
      characterSet: ['⛵'],
      getSize: 22,
    }),
  ]

  const set = (k: keyof Filters) => (e: { target: { value: string } }) => setFilters((f) => ({ ...f, [k]: e.target.value }))
  const isGem = !!selected && gems.includes(selected.id)
  const backers = selected ? [...new Set(selected.rounds.flatMap((r) => r.investors))] : []
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
        <div className="profile">
          <div className="avatar" />
          <div>
            <div className="who">investor</div>
            <div className="muted">{discovered.length} discovered · {gems.length} gemmed</div>
          </div>
        </div>
      </aside>

      <main className="map">
        <DeckGL
          views={new OrthographicView({ flipY: true })}
          viewState={view}
          controller
          onViewStateChange={({ viewState }) => setView(viewState as typeof view)}
          layers={layers}
          getTooltip={({ object }) => (object as Tile)?.startup ? `${(object as Tile).startup!.name} · ${(object as Tile).startup!.stage}` : null}
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
          {filtering && <button className="chip" onClick={() => setFilters(NO_FILTERS)}>clear</button>}
          {filtering && <button className="chip" title="Saved filters" onClick={() => setSavedFilters([...savedFilters, filters])}>save</button>}
          {savedFilters.map((f, i) => <button key={i} className="chip" onClick={() => setFilters(f)}>saved {i + 1}</button>)}
          {moreFilters && (
            <>
              <select className="chip" value={filters.sector} onChange={set('sector')}><option value="">sector</option>{SECTORS.map((s) => <option key={s}>{s}</option>)}</select>
              <select className="chip" value={filters.stage} onChange={set('stage')}><option value="">stage</option>{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
              <select className="chip" value={filters.model} onChange={set('model')}><option value="">model</option>{['B2B', 'B2C', 'B2B2C'].map((s) => <option key={s}>{s}</option>)}</select>
              <select className="chip" value={filters.country} onChange={set('country')}><option value="">places</option>{COUNTRIES.map((s) => <option key={s}>{s}</option>)}</select>
              <span className="chip range">founded <input placeholder="from" value={filters.yearMin} onChange={set('yearMin')} /> <input placeholder="to" value={filters.yearMax} onChange={set('yearMax')} /></span>
              <span className="chip range">raised ≥ <input placeholder="€M" value={filters.raisedMin} onChange={set('raisedMin')} /></span>
            </>
          )}
        </div>

        <footer className="transport">
          <button title="Previous" onClick={previous} disabled={!history.length}>«</button>
          <button className={`big ${sofa ? 'on' : ''}`} title="sofa mode" onClick={() => setSofa(!sofa)}>⛵ {sofa ? 'sailing…' : 'sofa mode'}</button>
          <button className="wide" title="Next: navigate" onClick={next}>» navigate</button>
        </footer>
      </main>

      <aside className="right">
        {selected ? (
          <>
            <div className="hero">
              <div className="hero-logo">{selected.name.slice(0, 2)}</div>
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
            <p className="pitch">{selected.pitch}</p>
            <dl>
              <dt>stage</dt><dd>{selected.stage}</dd>
              <dt>raised</dt><dd>€{selected.totalRaisedM}M</dd>
              <dt>model</dt><dd>{selected.model}</dd>
              <dt>web</dt><dd><a href={selected.website} target="_blank" rel="noreferrer">{selected.website.replace('https://', '')}</a></dd>
            </dl>
            <h4>Backed by</h4>
            <div className="chips">{backers.map((b) => <span key={b} className="tag">{b}</span>)}</div>
            <h4>In islands</h4>
            <div className="chips">
              <span className="tag" onClick={() => setFilters({ ...NO_FILTERS, sector: selected.sector })}>{selected.sector}</span>
              {inLists.map((n) => <span key={n} className="tag">{n}</span>)}
            </div>
            <h4>Rounds</h4>
            <ul className="rounds">{selected.rounds.map((r, i) => <li key={i}><b>{r.stage}</b> €{r.amountM}M · {r.year}<div className="muted">{r.investors.join(', ')}</div></li>)}</ul>
            <div className="source">Data from Cala</div>
          </>
        ) : <p className="muted">select a startup</p>}
      </aside>
    </div>
  )
}
