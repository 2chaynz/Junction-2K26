import { useState } from 'react'
import { BY_ID } from './world'
import { Icon } from './icons'
import { sigilUrl } from './Logo'

export interface Pick { id: string; why: string }
interface Cala { answer?: string; sources?: { name: string; url: string }[]; entities?: { id: string; name: string }[]; error?: string }
interface Answer { answer: string; picks: Pick[]; model: string; cala?: Cala }

// Cala answers in markdown; the card shows plain prose.
const plain = (md: string) => md.replace(/\*\*|__|`|^#+\s*/gm, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()

const EXAMPLES = ['startups doing food and AI', 'seed-stage climate tech in Finland', 'who builds tools for game studios?']

// Natural-language search: the server shortlists by embedding, Gemini picks and explains.
export function AskBox({ current, onAnswer, onPick }: { current: string; onAnswer: (ids: string[]) => void; onPick: (id: string) => void }) {
  const [question, setQuestion] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // Folded keeps the spotlight on the map but hides the card.
  const [folded, setFolded] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Answer | null>(null)
  const [calaOpen, setCalaOpen] = useState(false)

  async function submit(q: string) {
    if (!q.trim() || busy) return
    setQuestion(q)
    setOpen(true)
    setFolded(false)
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? res.statusText)
      setResult(body)
      setCalaOpen(false)
      // Startups Cala names that are on our map light up too.
      const calaIds = (body.cala?.entities ?? []).map((e: { id: string }) => e.id)
      const ids = [...new Set([...body.picks.map((p: Pick) => p.id), ...calaIds])].filter((id) => BY_ID.has(id))
      onAnswer(ids)
      const first = body.picks.find((p: Pick) => BY_ID.has(p.id))?.id ?? ids[0]
      if (first) onPick(first)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function close() {
    setOpen(false)
    setResult(null)
    onAnswer([])
  }

  return (
    <div className={`ask ${open ? 'open' : ''}`}>
      <form onSubmit={(e) => { e.preventDefault(); submit(question) }}>
        <Icon name="spark" size={14} />
        <input
          placeholder="Ask the archipelago… e.g. startups doing food and AI"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && close()}
        />
        {result && <button type="button" className="icon-btn" title={folded ? 'Show the answer' : 'Fold the answer'} onClick={() => setFolded(!folded)}>{folded ? '▾' : '▴'}</button>}
        {open && <button type="button" className="icon-btn" title="Close and clear the answer" onClick={close}>✕</button>}
      </form>
      {open && !folded && (
        <div className="ask-body">
          {busy && <p className="muted">Asking Cala and reading the map…</p>}
          {error && <p className="ask-error">{error}</p>}
          {!busy && !result && !error && (
            <div className="chips">
              {EXAMPLES.map((q) => <button key={q} className="tag" onClick={() => submit(q)}>{q}</button>)}
            </div>
          )}
          {!busy && result?.cala && (
            <section className="cala-live">
              <div className="ask-label"><span className="live-dot" /> Cala knowledge graph, live</div>
              {result.cala.error
                ? <p className="muted">Live answer unavailable ({result.cala.error})</p>
                : (
                  <>
                    <p className={`ask-answer ${calaOpen ? '' : 'clamped'}`} onClick={() => setCalaOpen(!calaOpen)} title={calaOpen ? '' : 'Show the full answer'}>{plain(result.cala.answer ?? '')}</p>
                    {(result.cala.entities ?? []).some((e) => BY_ID.has(e.id)) && (
                      <div className="chips">
                        {result.cala.entities!.filter((e) => BY_ID.has(e.id)).map((e) => <button key={e.id} className="tag" title="On the map: sail there" onClick={() => onPick(e.id)}>{e.name}</button>)}
                      </div>
                    )}
                    {(result.cala.sources ?? []).length > 0 && (
                      <p className="ask-note">sources {result.cala.sources!.map((src) => <a key={src.url} href={src.url} target="_blank" rel="noreferrer">{src.name}</a>)}</p>
                    )}
                  </>
                )}
            </section>
          )}
          {!busy && result && (
            <>
              <div className="ask-label"><Icon name="spark" size={10} /> On the map</div>
              <p className="ask-answer">{result.answer}</p>
              <ul className="track-list">
                {result.picks.filter((p) => BY_ID.has(p.id)).map((p) => {
                  const t = BY_ID.get(p.id)!
                  return (
                    <li key={p.id} className={p.id === current ? 'current' : ''} onClick={() => onPick(p.id)}>
                      <img src={sigilUrl(t.startup!.name, t.color)} alt="" />
                      <span className="pick">
                        <span className="name">{t.startup!.name} <span className="meta">{t.sector}</span></span>
                        <span className="why">{p.why}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
              <p className="ask-note"><Icon name="spark" size={10} /> {result.model}, from Cala data and web summaries</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
