// `/trolley/` — absurd trolley problems, judged by Jev.
//
// The same split as the music demo: Jev makes typed decisions (who is on the
// tracks, what to do, how hard, how absurd — all Choices, Scores and a Noul
// over closed tables); code owns every sentence and every pixel.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { ABSURDITY_WORDS, DIFFICULTY_WORDS, entityEmoji, scenarioText, trackPhrase, verdictText } from './describe'
import { Outcome } from './Outcome'
import { castOffline, castWithJev, jevAvailable, judgeOffline, judgeWithJev, randomTheme, type Exchange, type Verdict } from './play'
import { rng } from '../planner/pick'
import { Diamond } from '../ui/Diamond'
import { CLASSIC, ENTITIES, ENTITY_IDS, MAX_COUNT, MAX_GROUPS_PER_TRACK, THEMES, TRAITS, TRAIT_IDS, TWISTS, TWIST_IDS, type EntityId, type Group, type Scenario, type ThemeId, type TraitId, type TwistId } from './schema'

const newSeed = () => Math.floor(Math.random() * 99_999) + 1
const ACCENT = '#b3261e'

type TrackId = 'ahead' | 'siding'

const initialDebug = () => {
  const value = new URLSearchParams(window.location.search).get('debug')
  return value !== null && value !== '0' && value !== 'false'
}

function TrackEditor({ id, title, hint, groups, onChange }: { id: TrackId; title: string; hint: string; groups: Group[]; onChange: (groups: Group[]) => void }) {
  const update = (index: number, patch: Partial<Group>) => onChange(groups.map((group, i) => (i === index ? { ...group, ...patch } : group)))
  const unused = ENTITY_IDS.find((entity) => !groups.some((group) => group.entity === entity)) ?? 'stranger'
  return (
    <section className={`panel track track-${id}`} aria-label={title}>
      <header className="panel-head">
        <h2>{title}</h2>
        <span className="tag">{hint}</span>
      </header>
      <p className="track-summary">
        <span className="track-emoji" aria-hidden="true">
          {groups.length ? groups.map((group) => entityEmoji(group.entity).repeat(Math.min(group.count, 5))).join(' ') : '∅'}
        </span>
        {trackPhrase(groups)}
      </p>
      <ul className="group-list">
        {groups.map((group, index) => (
          <li key={index} className="group-row">
            <input
              type="number"
              min={1}
              max={MAX_COUNT}
              value={group.count}
              aria-label="How many"
              onChange={(event) => update(index, { count: Math.max(1, Math.min(MAX_COUNT, Math.round(Number(event.target.value)) || 1)) })}
            />
            <select value={group.entity} aria-label="Who or what" onChange={(event) => update(index, { entity: event.target.value as EntityId })}>
              {ENTITY_IDS.map((entity) => (
                <option key={entity} value={entity}>
                  {entityEmoji(entity)} {ENTITIES[entity]}
                </option>
              ))}
            </select>
            <select value={group.trait} aria-label="Detail" onChange={(event) => update(index, { trait: event.target.value as TraitId })}>
              {TRAIT_IDS.map((trait) => (
                <option key={trait} value={trait}>
                  {TRAITS[trait]}
                </option>
              ))}
            </select>
            <button type="button" className="ghost small" aria-label="Remove" onClick={() => onChange(groups.filter((_, i) => i !== index))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="ghost" disabled={groups.length >= MAX_GROUPS_PER_TRACK} onClick={() => onChange([...groups, { entity: unused, count: 1, trait: 'plain' }])}>
        + Add to this track
      </button>
    </section>
  )
}

function Meter({ label, value, max, word }: { label: string; value: number; max: number; word: string }) {
  return (
    <div className="meter">
      <span className="meter-label">{label}</span>
      <span className="meter-bar">
        <span className="meter-fill" style={{ width: `${Math.round((value / max) * 100)}%` }} />
      </span>
      <span className="meter-word">{word}</span>
    </div>
  )
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="json-block">
      <div className="json-head">
        <span>{label}</span>
      </div>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </div>
  )
}

export default function TrolleyApp() {
  const [scenario, setScenario] = useState<Scenario>(CLASSIC)
  const [theme, setTheme] = useState<ThemeId | null>(null)
  const [jev, setJev] = useState<{ available: boolean; model?: string } | null>(null)
  const [useJev, setUseJev] = useState(true)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [castExchange, setCastExchange] = useState<Exchange | null>(null)
  const [busy, setBusy] = useState<'cast' | 'judge' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [verdictCount, setVerdictCount] = useState(0)
  const [debug, setDebug] = useState(initialDebug)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    void jevAvailable().then((status) => !cancelled && setJev(status))
    return () => {
      cancelled = true
    }
  }, [])

  const live = Boolean(jev?.available) && useJev

  // Editing the tracks invalidates the verdict: it was about a different dilemma.
  const edit = (next: Scenario) => {
    setScenario(next)
    setVerdict(null)
    setNotice(null)
  }

  const randomize = useCallback(async () => {
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    const seed = newSeed()
    const premise = randomTheme(rng(seed))
    setBusy('cast')
    setNotice(null)
    setVerdict(null)
    setTheme(premise)
    try {
      const cast = live ? await castWithJev(premise, seed, abort.signal) : castOffline(premise, seed)
      if (abort.signal.aborted) return
      setScenario(cast.scenario)
      setCastExchange(cast.exchange)
    } catch (cause) {
      if (abort.signal.aborted) return
      // Never pass a stub off as Jev: say so.
      setNotice(`Jev could not cast this one (${cause instanceof Error ? cause.message : String(cause)}). Showing an offline draw instead.`)
      const cast = castOffline(premise, seed)
      setScenario(cast.scenario)
      setCastExchange(cast.exchange)
    } finally {
      if (!abort.signal.aborted) setBusy(null)
    }
  }, [live])

  const judge = useCallback(async () => {
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    setBusy('judge')
    setNotice(null)
    let result: Verdict
    try {
      result = live ? await judgeWithJev(scenario, abort.signal) : judgeOffline(scenario)
    } catch (cause) {
      if (abort.signal.aborted) return
      setNotice(`Jev could not judge this one (${cause instanceof Error ? cause.message : String(cause)}). Showing the offline stub’s arithmetic instead.`)
      result = judgeOffline(scenario)
    }
    if (abort.signal.aborted) return
    setVerdict(result)
    setVerdictCount((n) => n + 1)
    setBusy(null)
  }, [live, scenario])

  const toggleDebug = (on: boolean) => {
    setDebug(on)
    const url = new URL(window.location.href)
    if (on) url.searchParams.set('debug', '1')
    else url.searchParams.delete('debug')
    window.history.replaceState(null, '', url)
  }

  const pullPercent = verdict ? Math.round(verdict.pull * 100) : null

  return (
    <div className="app trolley" style={{ '--accent': ACCENT } as CSSProperties}>
      <header className="masthead">
        <div>
          <h1>
            <a className="home-link" href="/">Jev Playground</a> <span className="muted">/ trolley</span>
          </h1>
        </div>
        <div className="masthead-side">
          <span className={`status-chip ${jev?.available ? 'on' : ''}`}>
            <span className="dot" />
            {jev === null ? 'Checking Jev…' : jev.available ? 'Jev connected' : 'Jev offline · stub'}
          </span>
          <label className="switch">
            <input type="checkbox" checked={debug} onChange={(event) => toggleDebug(event.target.checked)} />
            <span>Debug</span>
          </label>
        </div>
      </header>

      <section className="panel dilemma" aria-live="polite" aria-busy={busy === 'cast'}>
        <p className={`dilemma-text ${busy === 'cast' ? 'is-stale' : ''}`}>{scenarioText(scenario)}</p>
        <div className="dilemma-actions">
          <button type="button" className="ghost" disabled={busy !== null} onClick={() => void randomize()}>
            {busy === 'cast' ? <><Diamond className="diamond" aria-label="Casting" /> Casting…</> : '🎲 Randomize'}
          </button>
          <button type="button" className="ghost" disabled={busy !== null} onClick={() => edit(CLASSIC)}>
            Classic
          </button>
          <button type="button" className="primary" disabled={busy !== null} onClick={() => void judge()}>
            {busy === 'judge' ? <><Diamond className="diamond" aria-label="Asking" /> Asking…</> : live ? 'What would Jev do?' : 'What would the stub do?'}
          </button>
        </div>
        {theme && <p className="muted dilemma-theme">Premise drawn by code: {THEMES[theme]}.</p>}
      </section>

      {notice && <p className="banner warn">{notice}</p>}

      {busy === 'judge' && !verdict && (
        <section className="panel verdict verdict-pending" aria-busy="true">
          <header className="panel-head">
            <h2>
              <Diamond className="diamond diamond-lg" /> {live ? 'Asking Jev…' : 'Working it out…'}
            </h2>
          </header>
        </section>
      )}

      {verdict && (
        <section className={`panel verdict ${busy === 'judge' ? 'is-stale' : ''} verdict-${verdict.decision}`} aria-live="polite">
          <header className="panel-head">
            <h2>{verdictText(verdict.decision, Math.max(verdict.pull, 1 - verdict.pull))}</h2>
            <span className={`tag ${verdict.source === 'jev' ? 'tag-live' : ''}`}>{verdict.source === 'jev' ? 'Jev' : 'offline stub'}</span>
          </header>
          <div className="verdict-body">
            <div className="lever-bar" role="img" aria-label={`Pull the lever ${pullPercent}%, do nothing ${100 - (pullPercent ?? 0)}%`}>
              <span className="lever-pull" style={{ width: `${pullPercent}%` }}>
                {(pullPercent ?? 0) >= 24 ? `pull ${pullPercent}%` : ''}
              </span>
              <span className="lever-stay">{100 - (pullPercent ?? 0) >= 30 ? `leave it ${100 - (pullPercent ?? 0)}%` : ''}</span>
            </div>
            <Meter label="Confidence" value={verdict.confidence} max={1} word={`${Math.round(verdict.confidence * 100)}%`} />
            <Meter label="How hard" value={verdict.difficulty} max={3} word={DIFFICULTY_WORDS[Math.round(Math.max(0, Math.min(3, verdict.difficulty)))]} />
            <Meter label="How absurd" value={verdict.absurdity} max={3} word={ABSURDITY_WORDS[Math.round(Math.max(0, Math.min(3, verdict.absurdity)))]} />
            <Meter label="Most people would pull" value={verdict.mostPeoplePull} max={1} word={`${Math.round(verdict.mostPeoplePull * 100)}%`} />
            {/* Keyed by the verdict so the little scene replays for every new decision. */}
            <Outcome key={verdictCount} scenario={scenario} decision={verdict.decision} />
          </div>
        </section>
      )}

      <div className="tracks">
        <TrackEditor id="ahead" title="Straight ahead" hint="if you do nothing" groups={scenario.ahead} onChange={(ahead) => edit({ ...scenario, ahead })} />
        <TrackEditor id="siding" title="Side track" hint="if you pull the lever" groups={scenario.siding} onChange={(siding) => edit({ ...scenario, siding })} />
      </div>

      <div className="controls trolley-controls">
        <label>
          Twist
          <select value={scenario.twist} onChange={(event) => edit({ ...scenario, twist: event.target.value as TwistId })}>
            {TWIST_IDS.map((twist) => (
              <option key={twist} value={twist}>
                {TWISTS[twist]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Judge
          <select value={live ? 'jev' : 'stub'} onChange={(event) => setUseJev(event.target.value === 'jev')}>
            <option value="jev" disabled={!jev?.available}>
              Jev — live{jev?.available ? '' : ' (no key)'}
            </option>
            <option value="stub">Offline stub</option>
          </select>
        </label>
      </div>

      {debug && (
        <section className="panel debug-panel" aria-label="Engineer debug view">
          <header className="panel-head">
            <h2>Debug</h2>
            <span className="tag">{live ? 'live Jev' : 'offline stub'}</span>
          </header>
          <h3>Payloads <span className="muted">— Jev only ever sees option tables and descriptions; every sentence above is assembled by code</span></h3>
          <div className="exchanges">
            {[castExchange, verdict?.exchange].filter((exchange): exchange is Exchange => Boolean(exchange)).map((exchange, i) => (
              <details key={`${exchange.label}-${i}`} className="exchange" open={exchange === verdict?.exchange}>
                <summary>
                  <span className="exchange-label">{exchange.label}</span>
                  <span className="muted">
                    {Object.keys(exchange.request.questions).length} questions
                    {exchange.response ? ` · ${exchange.response.usage?.input_tokens ?? '?'} tok` : ''}
                    {exchange.latencyMs != null ? ` · ${(exchange.latencyMs / 1000).toFixed(2)} s` : ''}
                  </span>
                  <span className={`tag ${exchange.sent ? 'tag-live' : ''}`}>{exchange.sent ? 'sent' : 'not sent — stub'}</span>
                </summary>
                <JsonBlock label="POST /v1/systemone — request body (built on the server from the op below)" value={exchange.request} />
                <JsonBlock label="POST /api/jev — what the browser sends" value={exchange.op} />
                {exchange.response ? <JsonBlock label="response" value={exchange.response} /> : <p className="muted json-note">No response: decided offline. This is the payload Jev would be sent.</p>}
              </details>
            ))}
            {!castExchange && !verdict && <p className="muted">Randomize or ask for a verdict to see the requests.</p>}
          </div>
        </section>
      )}
    </div>
  )
}
