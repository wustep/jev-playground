import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AudioEngine, type EngineStatus } from './audio/engine'
import { downloadMidi } from './midi/exportMidi'
import { BAR_COUNT_VALUES, INSTRUMENTS, INSTRUMENT_IDS, STYLE_IDS, STYLE_LABELS, type BarCount, type CompositionPlan, type InstrumentId, type StyleId } from './plan/schema'
import { detectJev, heuristicPlanner, type Decision, type JevAvailability, type PlanInput, type PlanResult, type PlannerId, type ScoreResult } from './planner'
import { shadowExchanges } from './planner/HeuristicPlanner'
import { renderPlan } from './render/renderPlan'
import { DebugPanel } from './ui/DebugPanel'
import { Confidence, PlanPanel } from './ui/PlanPanel'
import { SheetView } from './ui/SheetView'
import { STYLE_THEME } from './ui/styleTheme'

const newSeed = () => Math.floor(Math.random() * 99_999) + 1

const initialDebug = () => {
  const value = new URLSearchParams(window.location.search).get('debug')
  return value !== null && value !== '0' && value !== 'false'
}

interface Generated extends PlanResult {
  input: PlanInput
  /** Set when the requested planner failed and the stub stepped in. */
  notice: string | null
}

export function App() {
  const [style, setStyle] = useState<StyleId>('bach')
  const [plannerChoice, setPlannerChoice] = useState<PlannerId>('heuristic')
  const [jev, setJev] = useState<JevAvailability | null>(null)
  const [bars, setBars] = useState<BarCount>(16)
  const [pick, setPick] = useState<PlanInput['pick']>('sample')
  const [brief, setBrief] = useState(true)
  const [seed, setSeed] = useState(newSeed)

  const [generated, setGenerated] = useState<Generated | null>(null)
  const [editedPlan, setEditedPlan] = useState<CompositionPlan | null>(null)
  const [progress, setProgress] = useState<Decision[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [matches, setMatches] = useState<ScoreResult | null>(null)

  const [instrument, setInstrument] = useState<InstrumentId>('grand_piano')
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const [audio, setAudio] = useState<EngineStatus>({ state: 'idle' })
  const [debug, setDebug] = useState(initialDebug)
  const [saved, setSaved] = useState<string | null>(null)

  // One engine for the lifetime of the page; disposed (context closed) on unmount.
  const engine = useMemo(() => new AudioEngine(), [])
  useEffect(() => {
    const unsubscribe = engine.subscribe(setAudio)
    return () => {
      unsubscribe()
      engine.dispose()
    }
  }, [engine])

  // ── planners ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    void detectJev().then((availability) => {
      if (cancelled) return
      setJev(availability)
      if (availability.planner) setPlannerChoice('jev')
    })
    return () => {
      cancelled = true
    }
  }, [])

  const abortRef = useRef<AbortController | null>(null)

  const generate = useCallback(
    async (overrides: Partial<PlanInput> & { planner?: PlannerId } = {}) => {
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort
      const input: PlanInput = { style, bars, pick, brief, seed, ...overrides }
      const wanted = overrides.planner ?? plannerChoice
      const planner = wanted === 'jev' && jev?.planner ? jev.planner : heuristicPlanner

      engine.stop()
      setPlaying(false)
      setError(null)
      setProgress([])
      let result: PlanResult
      let notice: string | null = null
      try {
        result = await planner.plan(input, { signal: abort.signal, onProgress: setProgress })
      } catch (cause) {
        if (abort.signal.aborted) return
        if (planner === heuristicPlanner) {
          setProgress(null)
          setError(cause instanceof Error ? cause.message : String(cause))
          return
        }
        // Never fake a Jev answer: say it failed, then show the stub's plan.
        notice = `Jev request failed (${cause instanceof Error ? cause.message : String(cause)}). Showing the offline stub’s plan instead.`
        result = await heuristicPlanner.plan(input)
      }
      if (abort.signal.aborted) return
      setProgress(null)
      setEditedPlan(null)
      setMatches(null)
      setGenerated({ ...result, input, notice })
      setInstrument(result.plan.defaultInstrument)
    },
    [style, bars, pick, brief, seed, plannerChoice, jev, engine],
  )

  // First paint: something on the stand before anyone clicks.
  const bootedRef = useRef(false)
  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    void generate({ planner: 'heuristic' })
  }, [generate])

  const plan = editedPlan ?? generated?.plan ?? null

  // ── THE SEAM: plan JSON → notes ───────────────────────────────────────────
  // Everything below this line (sheet, playback, MIDI) reads `score` only.
  const score = useMemo(() => (plan && generated ? renderPlan(plan, generated.input.seed) : null), [plan, generated])

  // Optional style-match scoring, with whichever planner made the plan.
  useEffect(() => {
    if (!plan || !generated) return
    const scorer = generated.trace.planner === 'jev' && jev?.planner?.score ? jev.planner : heuristicPlanner
    const abort = new AbortController()
    scorer
      .score?.(plan, STYLE_IDS, { signal: abort.signal })
      .then((result) => !abort.signal.aborted && setMatches(result))
      .catch(() => !abort.signal.aborted && setMatches(null))
    return () => abort.abort()
  }, [plan, generated, jev])

  // ── transport ─────────────────────────────────────────────────────────────

  const play = useCallback(async () => {
    if (!score) return
    setPlaying(true)
    try {
      await engine.play(score, instrument, { loop, onEnd: () => setPlaying(false) })
    } catch {
      setPlaying(false)
    }
  }, [engine, score, instrument, loop])

  const stop = useCallback(() => {
    engine.stop()
    setPlaying(false)
  }, [engine])

  // A new score invalidates whatever is sounding.
  useEffect(() => {
    engine.stop()
    setPlaying(false)
  }, [engine, score])

  const chooseInstrument = (id: InstrumentId) => {
    setInstrument(id)
    // Swap live if the context already exists (we're inside a user gesture).
    if (audio.state !== 'idle' || playing) void engine.setInstrument(id).catch(() => undefined)
  }

  useEffect(() => engine.setLoop(loop), [engine, loop])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.code !== 'Space' || (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))) return
      event.preventDefault()
      if (playing) stop()
      else void play()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing, play, stop])

  const toggleDebug = (on: boolean) => {
    setDebug(on)
    const url = new URL(window.location.href)
    if (on) url.searchParams.set('debug', '1')
    else url.searchParams.delete('debug')
    window.history.replaceState(null, '', url)
  }

  // ── view ──────────────────────────────────────────────────────────────────

  const accent = STYLE_THEME[plan?.style ?? style].accent
  const busy = progress !== null
  const edited = editedPlan !== null
  const exchanges = useMemo(
    () => (generated && plan ? (edited ? shadowExchanges(plan, generated.input.brief) : generated.trace.exchanges) : []),
    [generated, plan, edited],
  )

  const audioLabel =
    audio.state === 'loading'
      ? `Loading ${audio.instrument.replace('_', ' ')} samples${audio.progress.total ? ` ${audio.progress.loaded}/${audio.progress.total}` : '…'}`
      : audio.state === 'error'
        ? `Audio error: ${audio.message}`
        : audio.state === 'ready'
          ? `${audio.instrument.replace('_', ' ')} ready`
          : 'Audio starts on first play'

  return (
    <div className="app" style={{ '--accent': accent } as CSSProperties}>
      <header className="masthead">
        <div>
          <h1>
            Jev Playground <span className="muted">/ music</span>
          </h1>
        </div>
        <div className="masthead-side">
          <span className={`status-chip ${jev?.planner ? 'on' : ''}`} title={jev?.detail ?? 'Checking for a Jev key…'}>
            <span className="dot" />
            {jev === null ? 'Checking Jev…' : jev.planner ? 'Jev connected' : 'Jev offline · stub'}
          </span>
          <label className="switch">
            <input type="checkbox" checked={debug} onChange={(event) => toggleDebug(event.target.checked)} />
            <span>Debug</span>
          </label>
        </div>
      </header>

      <div className="dial" role="radiogroup" aria-label="Style">
        {STYLE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={style === id}
            className={`dial-stop ${style === id ? 'selected' : ''}`}
            style={{ '--stop': STYLE_THEME[id].accent } as CSSProperties}
            onClick={() => {
              const next = newSeed()
              setStyle(id)
              setSeed(next)
              void generate({ style: id, seed: next })
            }}
          >
            <span className="dial-name">{STYLE_LABELS[id]}</span>
            <span className="dial-tag">{STYLE_THEME[id].tagline}</span>
          </button>
        ))}
      </div>

      <div className="controls">
        <label>
          Planner
          <select value={plannerChoice} onChange={(event) => setPlannerChoice(event.target.value as PlannerId)}>
            <option value="heuristic">Heuristic stub (offline)</option>
            <option value="jev" disabled={!jev?.planner}>
              Jev — live{jev?.planner ? '' : ' (no key)'}
            </option>
          </select>
        </label>
        <label className="control-bars">
          Bars
          <select value={bars} onChange={(event) => setBars(Number(event.target.value) as BarCount)}>
            {BAR_COUNT_VALUES.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        <div className="controls-actions">
          <button
            type="button"
            className="primary"
            disabled={busy}
            title="A new piece in this style (new seed)"
            onClick={() => {
              const next = newSeed()
              setSeed(next)
              void generate({ seed: next })
            }}
          >
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      {debug && (
        <form
          className="controls controls-advanced"
          aria-label="Planner policy (debug)"
          onSubmit={(event) => {
            event.preventDefault()
            void generate()
          }}
        >
          <label title="Both planners return a distribution per decision. argmax: always the most probable option. sample: draw from it with the seed.">
            Decide by
            <select value={pick} onChange={(event) => setPick(event.target.value as PlanInput['pick'])}>
              <option value="sample">sampling the distribution</option>
              <option value="argmax">argmax</option>
            </select>
          </label>
          <label title="Jev only: include a prose description of the style in state, or send just the name.">
            Style brief
            <select value={brief ? 'on' : 'off'} onChange={(event) => setBrief(event.target.value === 'on')}>
              <option value="on">name + description</option>
              <option value="off">name only</option>
            </select>
          </label>
          <label>
            Seed
            <input type="number" min={1} value={seed} onChange={(event) => setSeed(Math.max(1, Number(event.target.value) || 1))} />
          </label>
          <div className="controls-actions">
            <button type="submit" className="ghost" disabled={busy} title="Regenerate with exactly this seed and these settings">
              Re-run this seed
            </button>
          </div>
        </form>
      )}

      {busy && progress && progress.length > 0 && (
        <p className="banner" role="status">
          Planning… {progress.length} decisions so far — last: <code>{progress[progress.length - 1].field}</code> ={' '}
          <code>{progress[progress.length - 1].choice}</code>
        </p>
      )}
      {generated?.notice && <p className="banner warn">{generated.notice}</p>}
      {error && <p className="banner warn">{error}</p>}

      {generated && plan && score && (
        <>
          <div className="workbench">
            <section className="panel sheet-panel">
              <div className="transport">
                <button type="button" className={`primary play ${playing ? 'is-playing' : ''}`} onClick={() => (playing ? stop() : void play())} aria-pressed={playing}>
                  {playing ? 'Stop' : 'Play'}
                </button>
                <label className="switch">
                  <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
                  <span>Loop</span>
                </label>
                <label>
                  <span className="sr-only">Instrument</span>
                  <select value={instrument} onChange={(event) => chooseInstrument(event.target.value as InstrumentId)}>
                    {INSTRUMENT_IDS.map((id) => (
                      <option key={id} value={id}>
                        {INSTRUMENTS[id].split(' — ')[0]}
                        {id === plan.defaultInstrument ? '  ← plan' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <span className={`audio-status ${audio.state}`} role="status">
                  {audioLabel}
                </span>
                <button
                  type="button"
                  className="ghost push-right"
                  onClick={() => {
                    setSaved(downloadMidi(score, instrument))
                    setTimeout(() => setSaved(null), 2500)
                  }}
                >
                  {saved ? `Saved ${saved}` : 'Download MIDI'}
                </button>
              </div>
              <SheetView score={score} engine={engine} playing={playing} accent={accent} />
            </section>

            <PlanPanel plan={plan} score={score} decisions={generated.trace.decisions} edited={edited} onApply={setEditedPlan} />
          </div>

          <section className="panel match-panel">
            <header className="panel-head">
              <h2>How well does this plan match each style?</h2>
              <span className="tag">{generated.trace.planner === 'jev' && !generated.notice ? 'Jev Score' : 'stub score'}</span>
            </header>
            <div className="match-row">
              {STYLE_IDS.map((id) => {
                const match = matches?.scores[id]
                return (
                  <div
                    key={id}
                    className={`match ${match ? `match-${match.match}` : ''} ${id === plan.style ? 'target' : ''}`}
                    style={{ '--stop': STYLE_THEME[id].accent } as CSSProperties}
                  >
                    <span className="match-name">{STYLE_LABELS[id]}</span>
                    <span className="match-level">{match ? match.match : '…'}</span>
                    <Confidence value={match?.confidence} />
                  </div>
                )
              })}
            </div>
          </section>

          {debug && (
            <DebugPanel
              plan={plan}
              score={score}
              input={generated.input}
              trace={generated.trace}
              exchanges={exchanges}
              matchExchanges={matches?.exchanges ?? []}
              matches={matches?.scores ?? null}
              edited={edited}
              notice={generated.notice}
            />
          )}
        </>
      )}

    </div>
  )
}
