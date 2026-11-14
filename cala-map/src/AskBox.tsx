import { useState } from 'react'
import { BY_ID } from './world'
import { Icon } from './icons'
import { sigilUrl } from './Logo'

export interface Pick { id: string; why: string }
interface Answer { answer: string; picks: Pick[]; model: string }

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
      const ids = body.picks.map((p: Pick) => p.id).filter((id: string) => BY_ID.has(id))
      onAnswer(ids)
      if (ids[0]) onPick(ids[0])
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
          {busy && <p className="muted">Gemini is reading the map…</p>}
          {error && <p className="ask-error">{error}</p>}
          {!busy && !result && !error && (
            <div className="chips">
              {EXAMPLES.map((q) => <button key={q} className="tag" onClick={() => submit(q)}>{q}</button>)}
            </div>
          )}
          {!busy && result && (
            <>
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
