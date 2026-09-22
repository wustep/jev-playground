// `/match/` — rank fictional nobodies with Jev-shaped questions.
//
// Closed tables for hobbies / looking-for / energy. Code writes every
// hypothesis and reason note. Live Jev scores those lists when it is reachable;
// otherwise the client stub does. Edits stay local until Save & rank.

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { jevChipPhase, jevStatus, type JevStatus } from '../shared/jevStatus'
import { JevStatusChip, Masthead } from '../ui/Masthead'
import { sameYou, toggleIn } from './match'
import { ensureMatch, initialMatch, peekMatch, pickPeople, rememberMatch } from './play'
import { matchCache, matchCacheKey } from './matchCache'
import { ENERGIES, HOBBIES, LOOKING_FOR, type Energy, type Hobby, type LookingFor, type YouProfile } from './types'

const JEV_POST = 'https://typesafe.ai/blog/introducing-system-one-models-and-jev'
const ACCENT = '#5c4a7a'

const pct = (value: number) => `${Math.round(value * 100)}`

export default function MatchApp() {
  const boot = useMemo(() => initialMatch(), [])
  const [draft, setDraft] = useState<YouProfile>(boot.you)
  const [saved, setSaved] = useState<YouProfile>(boot.you)
  const [seed, setSeed] = useState(boot.seed)
  const [status, setStatus] = useState<JevStatus | null>(null)
  const [requestId, setRequestId] = useState(0)
  const people = useMemo(() => pickPeople(seed), [seed])
  const peeked = peekMatch(saved, people, seed, status)
  const [held, setHeld] = useState(peeked)
  const ranking = peeked ?? held
  const dirty = !sameYou(draft, saved)
  const busy = !peeked && Boolean(status?.available)
  const phase = jevChipPhase({
    status,
    busy,
    source: ranking?.source ?? null,
    notice: busy ? null : (ranking?.notice ?? null),
  })

  const patch = (partial: Partial<YouProfile>) => setDraft((prev) => ({ ...prev, ...partial }))

  useEffect(() => {
    let cancelled = false
    void jevStatus().then((next) => {
      if (!cancelled) setStatus(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // First paint uses the cache. Save deletes that entry so the same profile
  // can be ranked again; drafting does not change `saved`, so this does not run.
  useEffect(() => {
    const current = peekMatch(saved, people, seed, status)
    if (current) {
      rememberMatch(saved, seed, current, people.map((person) => person.id))
      setHeld(current)
      return
    }
    if (!status) return
    let cancelled = false
    void ensureMatch(saved, people, seed).then((run) => {
      if (cancelled) return
      setHeld(run)
    })
    return () => {
      cancelled = true
    }
  }, [saved, people, seed, status, requestId])

  const save = () => {
    const next = draft
    matchCache.delete(matchCacheKey(next, people.map((person) => person.id), seed))
    setSaved(next)
    setRequestId((n) => n + 1)
  }

  return (
    <div className="app match-demo" style={{ '--accent': ACCENT } as CSSProperties}>
      <Masthead name="match">
        <JevStatusChip phase={phase} detail={ranking?.notice ?? status?.detail} />
      </Masthead>

      <section className="panel intro">
        <p className="intro-lede">
          Structured questions over hobbies and looking-for — the <a href={JEV_POST}>Jev</a> shape, not a chatbot. Each nobody gets a hypothesis, a fit score, a
          confidence, and reasons. Edit “you”, then Save &amp; rank — typing does not ask Jev. Fictional people only.
        </p>
        <div className="intro-actions">
          <button type="button" className="ghost" onClick={() => setSeed((n) => n + 1)}>
            🎲 Reshuffle nobodies
          </button>
        </div>
      </section>

      {ranking?.notice && !busy ? <p className="banner warn">{ranking.notice}</p> : null}

      <div className="match-frame">
        <aside className="panel match-you" aria-label="Your profile">
          <header className="panel-head">
            <h2>You</h2>
            <span className="tag">{dirty ? 'unsaved' : 'saved'}</span>
          </header>
          <div className="match-you-body">
            <label htmlFor="you-name">
              Name
              <input id="you-name" type="text" value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
            </label>
            <label htmlFor="you-city">
              City
              <input id="you-city" type="text" value={draft.city} onChange={(event) => patch({ city: event.target.value })} />
            </label>
            <label htmlFor="you-energy">
              Energy
              <select id="you-energy" value={draft.energy} onChange={(event) => patch({ energy: event.target.value as Energy })}>
                {ENERGIES.map((energy) => (
                  <option key={energy} value={energy}>
                    {energy}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="you-bio">
              Bio
              <textarea id="you-bio" value={draft.bio} onChange={(event) => patch({ bio: event.target.value })} rows={4} />
            </label>
            <fieldset className="match-chips">
              <legend>Hobbies</legend>
              {HOBBIES.map((hobby) => (
                <button
                  key={hobby}
                  type="button"
                  className={`ghost small ${draft.hobbies.includes(hobby) ? 'is-on' : ''}`}
                  aria-pressed={draft.hobbies.includes(hobby)}
                  onClick={() => patch({ hobbies: toggleIn(draft.hobbies, hobby) as Hobby[] })}
                >
                  {hobby}
                </button>
              ))}
            </fieldset>
            <fieldset className="match-chips">
              <legend>Looking for</legend>
              {LOOKING_FOR.map((wish) => (
                <button
                  key={wish}
                  type="button"
                  className={`ghost small ${draft.lookingFor.includes(wish) ? 'is-on' : ''}`}
                  aria-pressed={draft.lookingFor.includes(wish)}
                  onClick={() => patch({ lookingFor: toggleIn(draft.lookingFor, wish) as LookingFor[] })}
                >
                  {wish}
                </button>
              ))}
            </fieldset>
            <div className="match-save">
              <button type="button" className="primary" onClick={save} disabled={busy}>
                {busy ? 'Ranking…' : 'Save & rank'}
              </button>
              <span className="muted">{dirty ? 'Edits are not ranked yet.' : 'Ranking matches this profile.'}</span>
            </div>
          </div>
        </aside>

        <section className={`match-list${busy ? ' is-pending' : ''}`} aria-label="Ranked nobodies" aria-busy={busy}>
          {ranking ? (
            ranking.ranked.map((result) => (
            <article key={result.person.id} className="panel match-card">
              <header className="panel-head">
                <h2>{result.person.name}</h2>
                <span className="tag">
                  {result.person.age} · {result.person.city}
                </span>
              </header>
              <div className="match-card-body">
                <p className="match-hypothesis">{result.hypothesis}</p>
                <div className="match-fit-row">
                  <span className="match-fit-num">{pct(result.fit)}</span>
                  <span className="match-fit-track">
                    <span className="match-fit-fill" style={{ transform: `scaleX(${result.fit})` }} />
                  </span>
                  <span className="muted match-fit-conf">{pct(result.confidence)} conf</span>
                </div>
                {result.reasons.map((reason) => (
                  <div key={reason.id} className="match-reason">
                    <span className="match-reason-label">{reason.label}</span>
                    <span className="muted match-reason-score">{pct(reason.score)}</span>
                    <span className="muted match-reason-note">{reason.note}</span>
                  </div>
                ))}
                <p className="muted match-bio">{result.person.bio}</p>
                <div className="match-tags">
                  {result.person.hobbies.map((hobby) => (
                    <span key={hobby} className="tag">
                      {hobby}
                    </span>
                  ))}
                </div>
              </div>
            </article>
            ))
          ) : (
            <p className="muted match-empty">Ranking…</p>
          )}
        </section>
      </div>
    </div>
  )
}
