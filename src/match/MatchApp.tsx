// `/match/` — rank fictional nobodies with Jev-shaped questions.
//
// Closed tables for hobbies / looking-for / energy. Code writes every
// hypothesis and reason note. Client heuristic stub only; no /api/jev op.

import { useMemo, useState, type CSSProperties } from 'react'
import { rng } from '../planner/pick'
import { shuffleInPlace } from '../shared/jevMath'
import { rankPeople, toggleIn } from './match'
import { DEFAULT_YOU, PEOPLE } from './people'
import { ENERGIES, HOBBIES, LOOKING_FOR, type Energy, type Hobby, type LookingFor, type Person, type YouProfile } from './types'

const JEV_POST = 'https://typesafe.ai/blog/introducing-system-one-models-and-jev'
const ACCENT = '#5c4a7a'
const SHOW = 8

const pct = (value: number) => `${Math.round(value * 100)}`

function pickPeople(seed: number): Person[] {
  return shuffleInPlace([...PEOPLE], rng(seed)).slice(0, SHOW)
}

export default function MatchApp() {
  const [you, setYou] = useState<YouProfile>(DEFAULT_YOU)
  const [seed, setSeed] = useState(7)
  const people = useMemo(() => pickPeople(seed), [seed])
  const ranked = useMemo(() => rankPeople(you, people), [you, people])

  const patch = (partial: Partial<YouProfile>) => setYou((prev) => ({ ...prev, ...partial }))

  return (
    <div className="app match" style={{ '--accent': ACCENT } as CSSProperties}>
      <header className="masthead">
        <div>
          <h1>
            <a className="home-link" href="/">
              Jev Playground
            </a>{' '}
            <span className="muted">/ match</span>
          </h1>
        </div>
        <div className="masthead-side">
          <span className="status-chip" title="This demo is a client heuristic stub — same pattern as the music planner when there is no key.">
            <span className="dot" />
            Jev offline · stub
          </span>
        </div>
      </header>

      <section className="panel match-intro">
        <p className="match-lede">
          Structured questions over hobbies and looking-for — the <a href={JEV_POST}>Jev</a> shape, not a chatbot. Each nobody gets a hypothesis, a fit score, a
          confidence, and reasons. Edit “you” and the ranking recomputes. Fictional people only.
        </p>
        <div className="match-toolbar">
          <button type="button" className="primary" onClick={() => setSeed((n) => n + 1)}>
            Reshuffle nobodies
          </button>
        </div>
      </section>

      <div className="match-frame">
        <aside className="panel match-you" aria-label="Your profile">
          <header className="panel-head">
            <h2>You</h2>
            <span className="tag">editable</span>
          </header>
          <div className="match-you-body">
            <label htmlFor="you-name">
              Name
              <input id="you-name" type="text" value={you.name} onChange={(event) => patch({ name: event.target.value })} />
            </label>
            <label htmlFor="you-city">
              City
              <input id="you-city" type="text" value={you.city} onChange={(event) => patch({ city: event.target.value })} />
            </label>
            <label htmlFor="you-energy">
              Energy
              <select id="you-energy" value={you.energy} onChange={(event) => patch({ energy: event.target.value as Energy })}>
                {ENERGIES.map((energy) => (
                  <option key={energy} value={energy}>
                    {energy}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="you-bio">
              Bio
              <textarea id="you-bio" value={you.bio} onChange={(event) => patch({ bio: event.target.value })} rows={4} />
            </label>
            <fieldset className="match-chips">
              <legend>Hobbies</legend>
              {HOBBIES.map((hobby) => (
                <button
                  key={hobby}
                  type="button"
                  className={`ghost small ${you.hobbies.includes(hobby) ? 'is-chip-on' : ''}`}
                  aria-pressed={you.hobbies.includes(hobby)}
                  onClick={() => patch({ hobbies: toggleIn(you.hobbies, hobby) as Hobby[] })}
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
                  className={`ghost small ${you.lookingFor.includes(wish) ? 'is-chip-on' : ''}`}
                  aria-pressed={you.lookingFor.includes(wish)}
                  onClick={() => patch({ lookingFor: toggleIn(you.lookingFor, wish) as LookingFor[] })}
                >
                  {wish}
                </button>
              ))}
            </fieldset>
          </div>
        </aside>

        <section className="match-list" aria-label="Ranked nobodies">
          {ranked.map((result) => (
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
          ))}
        </section>
      </div>
    </div>
  )
}
