import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IS_MOCK, SECTORS, STAGES, STARTUPS, SUMMARIES } from './data/load'
import type { Startup } from './data/types'
import type { Tile } from './layout'
import { useStored } from './useStored'
import { sendMagicLink, signOut, supabase, useSession } from './auth'
import { useClock } from './anim'
import { Icon, type IconName } from './icons'
import { Logo, sigilUrl } from './Logo'
import { MapView, type FlyRequest } from './MapView'
import { BY_ID, ISLANDS, LAND, TILES } from './world'
import './App.css'

const COUNTRIES = [...new Set(STARTUPS.map((s) => s.country))].sort()
const YEARS = [...new Set(STARTUPS.map((s) => s.founded).filter(Boolean) as number[])].sort()
// Stage comes from funding rounds; hide it until Cala details are imported.
const HAS_STAGES = STARTUPS.some((s) => s.stage !== 'Unknown')
const SOFA_SECONDS = 6
const now = () => performance.now() / 1000

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
  const [fly, setFly] = useState<FlyRequest>({ x: start.x, y: start.y, zoom: 4.2, seq: 0 })
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
  const [hopAt, setHopAt] = useState(now)

  const tile = BY_ID.get(selectedId)!
  const selected = tile.startup!
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
    setFly((f) => ({ x, y, zoom, seq: f.seq + 1 }))
  }

  function select(id: string, fly = true) {
    const t = BY_ID.get(id)
    if (!t || id === selectedId) return
    setHistory((h) => [...h, selectedId].slice(-200))
    setSelectedId(id)
    setAddMenu(false)
    if (!discoveredSet.has(id)) setDiscovered([...discovered, id])
    if (fly) flyTo(t.x, t.y)
    setHopAt(now())
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

  const toggleSofa = () => { setHopAt(now()); setSofa((v) => !v) }
  const toggleGem = () => setGems(isGem ? gems.filter((g) => g !== selected.id) : [...gems.filter((g) => BY_ID.has(g)), selected.id])
  const toggleFilter = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: f[k] === v ? '' : v }))

  useEffect(() => {
    window.history.replaceState(null, '', `#${tile.x}~${tile.y}/startup~${selectedId}`)
  }, [selectedId, tile])

  // Sofa mode: hop to the next startup every few seconds.
  const nextRef = useRef(next)
  nextRef.current = next
  useEffect(() => {
    if (!sofa) return
    const id = setInterval(() => nextRef.current(), SOFA_SECONDS * 1000)
    return () => clearInterval(id)
  }, [sofa, hopAt])

  // Stable handlers so the memoised map only re-renders when its data changes.
  const selectRef = useRef(select)
  selectRef.current = select
  const onPick = useCallback((id: string) => selectRef.current(id, false), [])
  const onIsland = useCallback((sector: string) => setFilters((f) => ({ ...f, sector: f.sector === sector ? '' : sector })), [])

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
        ' ': toggleSofa,
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

  const results = query.trim().length > 1
    ? STARTUPS.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 40)
    : []
  const islandMembers = openIsland ? (lists[openIsland] ?? []).map((id) => BY_ID.get(id)?.startup).filter(Boolean) as Startup[] : []
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
          <MapView tile={tile} visible={visible} explored={explored} discovered={discoveredSet} gems={gemSet} fly={fly} onPick={onPick} onIsland={onIsland} />
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
            <button className={`t-btn boat-btn ${sofa ? 'on' : ''}`} title="Sofa mode: sail on autopilot (space)" onClick={toggleSofa}>
              <Icon name="boat" size={22} />
            </button>
            <button className="t-btn wide" title="Next: navigate (n)" onClick={next}><Icon name="next" /><span>navigate</span></button>
            <button className="t-btn" title="Surprise me (s)" onClick={shuffle}><Icon name="compass" /></button>
          </div>
          <SofaBar sofa={sofa} hopAt={hopAt} onToggle={toggleSofa} />
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
          {SUMMARIES[selected.id] ? (
            <>
              <p className="pitch">{SUMMARIES[selected.id].summary}</p>
              <p className="ai-note">
                <Icon name="spark" size={11} /> Gemini, from the web
                {SUMMARIES[selected.id].sources.map((s) => <a key={s.uri} href={s.uri} target="_blank" rel="noreferrer">{s.title}</a>)}
              </p>
              {selected.description && <p className="cala-line"><span>Cala</span> {selected.description}</p>}
            </>
          ) : <p className="pitch">{selected.description || 'No description yet.'}</p>}
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

// Own clock so the progress bar animates without re-rendering the whole app.
function SofaBar({ sofa, hopAt, onToggle }: { sofa: boolean; hopAt: number; onToggle: () => void }) {
  const clock = useClock(sofa ? 20 : 1)
  const progress = sofa ? Math.min(1, Math.max(0, clock - hopAt) / SOFA_SECONDS) : 0
  return (
    <div className="transport-bar">
      <button className="t-mini" onClick={onToggle}><Icon name={sofa ? 'pause' : 'play'} size={10} /></button>
      <span className="time">0:0{Math.floor(progress * SOFA_SECONDS)}</span>
      <div className="bar"><div className="bar-fill" style={{ width: `${progress * 100}%` }} /></div>
      <span className="time">0:0{SOFA_SECONDS}</span>
    </div>
  )
}
