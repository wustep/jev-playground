import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AudioEngine, type EngineStatus } from '../audio/engine'
import { downloadMidi } from '../midi/exportMidi'
import { BAR_COUNT_VALUES, GLOBAL_FIELD_IDS, INSTRUMENTS, INSTRUMENT_IDS, STYLE_IDS, STYLE_LABELS, type BarCount, type CompositionPlan, type InstrumentId, type StyleId } from '../plan/schema'
import { BEST_OF_N, detectJev, heuristicPlanner, JevPlanner, selectBestOfN, type Decision, type JevAvailability, type PlanInput, type PlanResult, type PlannerId, type ScoreResult } from '../planner'
import { shadowExchanges } from '../planner/HeuristicPlanner'
import { notePhrasesCoverPlan, renderWithOptionalJevNotes } from '../render/jevNotes'
import { secondsPerTick } from '../render/renderPlan'
import { DebugPanel } from '../ui/DebugPanel'
import { Confidence, PlanPanel } from '../ui/PlanPanel'
import { SheetView } from '../ui/SheetView'
import { STYLE_THEME } from '../ui/styleTheme'
import { DIAL_PLANNER, autoplayAfterStyleSwitch, dialPendingTag, displayedPlanUsesJevScore, generatePlanner, resolveDialPlan } from './dialPolicy'
import { cachedNotesMode, NOTES_MODE_LABELS, NOTES_MODE_TITLES, notesSearchValue, parseNotesSearchParam, type NotesMode } from './notesMode'
import { generateStatusLatencyMs, generatedPlanStatus, planHeuristicSample, readyPlanStatus, restoredPlanStatus, stampGenerateLatency } from './planTiming'
import { styleCache, type Generated } from './styleCache'

const newSeed = () => Math.floor(Math.random() * 99_999) + 1

const initialDebug = () => {
  const value = new URLSearchParams(window.location.search).get('debug')
  return value !== null && value !== '0' && value !== 'false'
}

const initialNotesMode = (): NotesMode => {
  if (!initialDebug()) return 'code'
  return parseNotesSearchParam(new URLSearchParams(window.location.search).get('notes'))
}

export default function MusicApp() {
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
  const [notesMode, setNotesModeState] = useState<NotesMode>(initialNotesMode)
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
  const mountedRef = useRef(true)
  /** Dial switch while sounding: play the new piece once its score is up. */
  const resumePlayRef = useRef(false)
  const playRef = useRef<( ) => Promise<void>>(async () => {})
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  // One finished piece per style — module + sessionStorage so leaving /music
  // (or the browser tab) and coming back still has whatever finished, even if
  // other styles never completed.
  const [pendingStyle, setPendingStyle] = useState<StyleId | null>(null)
  const [pendingAsksJev, setPendingAsksJev] = useState(false)
  const [picking, setPicking] = useState(false)
  const [planStatus, setPlanStatus] = useState<string | null>(null)

  const generate = useCallback(
    async (overrides: Partial<PlanInput> & { planner?: PlannerId } = {}, opts: { cancelPrior?: boolean } = {}) => {
      const started = performance.now()
      if (opts.cancelPrior !== false) abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort
      const input: PlanInput = { style, bars, pick, brief, seed, ...overrides }
      const wanted = generatePlanner(overrides.planner ?? plannerChoice, Boolean(jev?.planner))
      const planner = wanted === 'jev' && jev?.planner ? jev.planner : heuristicPlanner
      const wantJevNotes = debug && notesMode !== 'code' && overrides.planner !== DIAL_PLANNER
      const writeMode = notesMode === 'guide' ? 'guide' : 'line'
      const asksJev = planner !== heuristicPlanner || (wantJevNotes && jev?.planner instanceof JevPlanner)

      if (mountedRef.current) {
        engine.stop()
        setPlaying(false)
        setError(null)
        setPicking(false)
        setProgress([])
        setMatches(null)
        setPendingStyle(input.style)
        setPendingAsksJev(asksJev)
        setPlanStatus('Planning…')
      }
      const settle = { fn: null as null | ((value: Generated | null) => void) }
      const successOnly = new Promise<Generated>((resolve, reject) => {
        settle.fn = (value) => {
          if (value) resolve(value)
          else reject(new DOMException('aborted', 'AbortError'))
        }
      })
      styleCache.setInflight(input.style, successOnly)
      let result: PlanResult
      let notice: string | null = null
      try {
        result = await planner.plan(input, {
          signal: abort.signal,
          onProgress: (decisions) => {
            if (!mountedRef.current) return
            setProgress(decisions)
            const last = decisions[decisions.length - 1]
            setPlanStatus(last ? `Planning… ${decisions.length} decisions` : 'Planning…')
          },
        })
      } catch (cause) {
        if (abort.signal.aborted) {
          settle.fn?.(null)
          return
        }
        if (planner === heuristicPlanner) {
          settle.fn?.(null)
          resumePlayRef.current = false
          if (mountedRef.current) {
            setProgress(null)
            setPendingStyle(null)
            setPendingAsksJev(false)
            setError(cause instanceof Error ? cause.message : String(cause))
          }
          return
        }
        // Never fake a Jev answer: say it failed, then show the stub's plan.
        notice = `Jev request failed (${cause instanceof Error ? cause.message : String(cause)}). Showing the offline stub’s plan instead.`
        result = await heuristicPlanner.plan(input)
      }
      if (abort.signal.aborted) {
        settle.fn?.(null)
        return
      }
      let notePhrases = undefined as Generated['notePhrases']
      let noteExchanges = undefined as Generated['noteExchanges']
      let noteMode = undefined as Generated['noteMode']
      if (wantJevNotes) {
        const writer = jev?.planner instanceof JevPlanner ? jev.planner : null
        if (!writer) {
          notice = [notice, 'Jev notes need a live Jev connection. Using the code renderer’s notes instead.'].filter(Boolean).join(' ')
          notePhrases = []
          noteMode = writeMode
        } else {
          if (mountedRef.current) {
            setPendingAsksJev(true)
            setPlanStatus(writeMode === 'guide' ? 'Jev is guiding the tune…' : 'Jev is writing the singing line…')
          }
          try {
            const written = await writer.writeNotes(result.plan, input, { signal: abort.signal, mode: writeMode })
            if (abort.signal.aborted) {
              settle.fn?.(null)
              return
            }
            notePhrases = written.phrases
            noteExchanges = written.exchanges
            noteMode = writeMode
          } catch (cause) {
            if (abort.signal.aborted) {
              settle.fn?.(null)
              return
            }
            notice = [notice, `Jev notes failed (${cause instanceof Error ? cause.message : String(cause)}). Using the code renderer’s notes instead.`].filter(Boolean).join(' ')
            notePhrases = []
            noteMode = writeMode
          }
        }
      }
      const ended = performance.now()
      const made = stampGenerateLatency({ ...result, input, notice, notePhrases, noteExchanges, noteMode }, started, ended)
      styleCache.set(input.style, made)
      settle.fn?.(made)
      if (!mountedRef.current) return
      setProgress(null)
      setPendingStyle(null)
      setPendingAsksJev(false)
      setEditedPlan(null)
      setMatches(null)
      setGenerated(made)
      setInstrument(result.plan.defaultInstrument)
      // Dial/boot stubs land quietly. Only a user Generate click shows wall-clock seconds.
      setPlanStatus(
        overrides.planner === DIAL_PLANNER
          ? readyPlanStatus(input.bars)
          : generatedPlanStatus(input.bars, generateStatusLatencyMs(ended - started, result.trace.latencyMs)),
      )
    },
    [style, bars, pick, brief, seed, plannerChoice, jev, engine, debug, notesMode],
  )

  /** Cheap heuristic candidates + one score each (Jev when available). */
  const bestOf = useCallback(async () => {
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    const scorer = jev?.planner?.score ? jev.planner : heuristicPlanner
    const inputStyle = style

    if (mountedRef.current) {
      resumePlayRef.current = false
      engine.stop()
      setPlaying(false)
      setError(null)
      setProgress(null)
      setMatches(null)
      setPicking(true)
      setPendingStyle(inputStyle)
      setPendingAsksJev(scorer !== heuristicPlanner)
      setPlanStatus(`Sampling ${BEST_OF_N}…`)
    }

    const settle = { fn: null as null | ((value: Generated | null) => void) }
    const successOnly = new Promise<Generated>((resolve, reject) => {
      settle.fn = (value) => {
        if (value) resolve(value)
        else reject(new DOMException('aborted', 'AbortError'))
      }
    })
    styleCache.setInflight(inputStyle, successOnly)
    const started = performance.now()
    try {
      const picked = await selectBestOfN({
        input: { style: inputStyle, bars, pick: 'sample', brief },
        planner: heuristicPlanner,
        scorer,
        fallback: heuristicPlanner,
        signal: abort.signal,
        onProgress: (scored, n) => {
          if (mountedRef.current) setPlanStatus(`Scoring ${scored} of ${n}…`)
        },
      })
      if (abort.signal.aborted) {
        settle.fn?.(null)
        return
      }
      const made: Generated = {
        ...picked.winner.result,
        input: picked.winner.input,
        notice: null,
        matches: picked.winner.scores,
      }
      styleCache.set(inputStyle, made)
      settle.fn?.(made)
      const seconds = (performance.now() - started) / 1000
      if (!mountedRef.current) return
      setSeed(picked.winner.input.seed)
      setEditedPlan(null)
      setGenerated(made)
      setMatches(picked.winner.scores)
      setInstrument(picked.winner.result.plan.defaultInstrument)
      setPlanStatus(`Picked ${picked.index + 1} of ${picked.n} in ${seconds.toFixed(2)}s`)
    } catch (cause) {
      settle.fn?.(null)
      if (abort.signal.aborted) return
      if (mountedRef.current) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    } finally {
      if (mountedRef.current) {
        setPicking(false)
        setPendingStyle(null)
        setPendingAsksJev(false)
      }
    }
  }, [style, bars, brief, jev, engine])

  // First paint: restore session cache / in-flight plan, else stub once.
  const bootedRef = useRef(false)
  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    const id = style
    const cached = styleCache.get(id)
    if (cached && cached.input.bars === bars) {
      setSeed(cached.input.seed)
      setGenerated(cached)
      setInstrument(cached.plan.defaultInstrument)
      setPlanStatus(restoredPlanStatus(cached.input.bars))
      return
    }
    const pending = styleCache.getInflight(id)
    if (pending) {
      setPendingStyle(id)
      setPlanStatus('Planning…')
      void pending.then((made) => {
        if (!mountedRef.current || made.input.bars !== bars) return
        setSeed(made.input.seed)
        setGenerated(made)
        setInstrument(made.plan.defaultInstrument)
        setPendingStyle(null)
        setPlanStatus(readyPlanStatus(made.input.bars))
      }).catch(() => {
        if (mountedRef.current) void generate({ planner: DIAL_PLANNER }, { cancelPrior: false })
      })
      return
    }
    void generate({ planner: DIAL_PLANNER }, { cancelPrior: false })
  }, [generate, style, bars])

  // Offline heuristic prewarm for every style at 16 bars. Live Jev is cached
  // only when the user clicks Generate — prewarming every style via Jev was
  // ~18 requests each and blew the 90/min rate limit on first paint.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (const id of STYLE_IDS) {
        if (cancelled || styleCache.has(id) || styleCache.getInflight(id)) continue
        const input: PlanInput = { style: id, bars: 16, pick: 'sample', brief: true, seed: newSeed() }
        const work = planHeuristicSample(input).then((made) => {
          if (!styleCache.has(id)) styleCache.set(id, made)
          return styleCache.get(id) ?? made
        })
        styleCache.setInflight(id, work)
        try {
          await work
        } catch {
          /* leave empty; a later dial click will stub-plan */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** Dial click: show cache at once. Never call Jev — only Generate may. */
  const chooseStyle = (id: StyleId) => {
    const keepPlaying = autoplayAfterStyleSwitch(playing)
    resumePlayRef.current = keepPlaying
    setStyle(id)
    const action = resolveDialPlan({ cached: styleCache.get(id), inflight: styleCache.getInflight(id), bars })
    if (action.kind === 'await-inflight') {
      setPendingStyle(id)
      setPendingAsksJev(false)
      setPlanStatus('Planning…')
      void action.inflight.then((cached) => {
        if (!mountedRef.current || cached.input.bars !== bars) return
        setSeed(cached.input.seed)
        setGenerated(cached)
        setInstrument(cached.plan.defaultInstrument)
        setPendingStyle(null)
        setPendingAsksJev(false)
        setPlanStatus(readyPlanStatus(cached.input.bars))
      }).catch(() => {
        /* aborted or superseded */
        if (mountedRef.current) {
          setPendingStyle(null)
          setPendingAsksJev(false)
        }
      })
      return
    }
    if (action.kind === 'use-cache') {
      abortRef.current?.abort()
      engine.stop()
      setPlaying(false)
      setProgress(null)
      setError(null)
      setEditedPlan(null)
      setMatches(null)
      setSeed(action.cached.input.seed)
      setGenerated(action.cached)
      setInstrument(action.cached.plan.defaultInstrument)
      setPlanStatus(readyPlanStatus(action.cached.input.bars))
      setPendingStyle(null)
      setPendingAsksJev(false)
      // Same cached object → score identity does not change, so restart now.
      if (keepPlaying && generated === action.cached) {
        resumePlayRef.current = false
        void playRef.current()
      }
      return
    }
    const next = newSeed()
    setSeed(next)
    void generate({ style: id, seed: next, planner: DIAL_PLANNER })
  }

  const plan = editedPlan ?? generated?.plan ?? null

  // ── THE SEAM: plan JSON → notes ───────────────────────────────────────────
  // Default: labels → renderPlan. Debug + guide/line overlays a validated
  // singing line on every plan bar; renderPlan keeps inner RH voices and
  // the full left-hand texture. Illegal RH falls back to renderPlan.
  // A stale one-bar cache is not applied — the notes pass must cover the piece.
  const applyJevNotes =
    debug &&
    notesMode !== 'code' &&
    !editedPlan &&
    cachedNotesMode(generated ?? {}) === notesMode &&
    notePhrasesCoverPlan(generated?.notePhrases, plan?.bars.length ?? 0)
  const score = useMemo(
    () => (plan && generated ? renderWithOptionalJevNotes(plan, generated.input.seed, applyJevNotes ? generated.notePhrases : null).score : null),
    [plan, generated, applyJevNotes],
  )

  // Toggle / URL / restored cache may want Jev notes without a Generate click.
  // `undefined` = not tried; `[]` = tried and failed (keep the existing notice).
  useEffect(() => {
    if (!debug || notesMode === 'code' || !generated || editedPlan || progress !== null || picking) return
    if (generated.notePhrases !== undefined && cachedNotesMode(generated) === notesMode) return
    if (jev === null) return
    const writeMode = notesMode === 'guide' ? 'guide' : 'line'

    const writer = jev.planner instanceof JevPlanner ? jev.planner : null
    if (!writer) {
      const next: Generated = {
        ...generated,
        notice: [generated.notice, 'Jev notes need a live Jev connection. Using the code renderer’s notes instead.'].filter(Boolean).join(' '),
        notePhrases: [],
        noteMode: writeMode,
      }
      styleCache.set(generated.input.style, next)
      setGenerated(next)
      return
    }

    const abort = new AbortController()
    abortRef.current = abort
    if (mountedRef.current) {
      setPendingAsksJev(true)
      setPlanStatus(writeMode === 'guide' ? 'Jev is guiding the tune…' : 'Jev is writing the singing line…')
    }
    void writer
      .writeNotes(generated.plan, generated.input, { signal: abort.signal, mode: writeMode })
      .then((written) => {
        if (abort.signal.aborted || !mountedRef.current) return
        const next: Generated = { ...generated, notePhrases: written.phrases, noteExchanges: written.exchanges, noteMode: writeMode }
        styleCache.set(generated.input.style, next)
        setGenerated(next)
        setPlanStatus(readyPlanStatus(generated.input.bars))
      })
      .catch((cause) => {
        if (abort.signal.aborted || !mountedRef.current) return
        const next: Generated = {
          ...generated,
          notice: [generated.notice, `Jev notes failed (${cause instanceof Error ? cause.message : String(cause)}). Using the code renderer’s notes instead.`].filter(Boolean).join(' '),
          notePhrases: [],
          noteMode: writeMode,
        }
        styleCache.set(generated.input.style, next)
        setGenerated(next)
      })
      .finally(() => {
        if (mountedRef.current && !abort.signal.aborted) setPendingAsksJev(false)
      })

    return () => abort.abort()
  }, [debug, notesMode, generated, editedPlan, progress, picking, jev])

  // Optional style-match scoring — skip while a plan is in flight so latency stays honest.
  // Jev score only when the displayed plan came from Jev, not because the picker is on Jev.
  // Best-of already scored the winner; reuse that instead of a second request.
  useEffect(() => {
    if (!plan || !generated || progress !== null || picking) return
    if (!editedPlan && generated.matches) {
      setMatches(generated.matches)
      return
    }
    const scorer = displayedPlanUsesJevScore(generated.trace.planner) && jev?.planner?.score ? jev.planner : heuristicPlanner
    const abort = new AbortController()
    scorer
      .score?.(plan, STYLE_IDS, { signal: abort.signal })
      .then((result) => !abort.signal.aborted && setMatches(result))
      .catch(() => !abort.signal.aborted && setMatches(null))
    return () => abort.abort()
  }, [plan, generated, jev, progress, picking, editedPlan])

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
  playRef.current = play

  /** A click on bar N: jump there if sounding, otherwise start playing from there. */
  const seekBar = useCallback(
    async (index: number) => {
      if (!score) return
      const from = index * score.meter.ticksPerBar * secondsPerTick(score)
      if (engine.seek(from)) return
      setPlaying(true)
      try {
        await engine.play(score, instrument, { loop, from, onEnd: () => setPlaying(false) })
      } catch {
        setPlaying(false)
      }
    },
    [engine, score, instrument, loop],
  )

  const stop = useCallback(() => {
    engine.stop()
    setPlaying(false)
  }, [engine])

  // A new score invalidates whatever is sounding. Dial-switch can ask us to
  // start the replacement (resumePlayRef) — same as hitting Play, so follow re-enables.
  useEffect(() => {
    engine.stop()
    setPlaying(false)
  }, [engine, score])

  useEffect(() => {
    if (!score || !resumePlayRef.current) return
    resumePlayRef.current = false
    void play()
  }, [score, play])

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
    if (!on) {
      url.searchParams.delete('notes')
      if (notesMode !== 'code') setNotesModeState('code')
    } else {
      const value = notesSearchValue(notesMode)
      if (value) url.searchParams.set('notes', value)
      else url.searchParams.delete('notes')
    }
    window.history.replaceState(null, '', url)
  }

  const setNotesMode = (mode: NotesMode) => {
    setNotesModeState(mode)
    const url = new URL(window.location.href)
    const value = notesSearchValue(mode)
    if (value) {
      setDebug(true)
      url.searchParams.set('debug', '1')
      url.searchParams.set('notes', value)
    } else {
      url.searchParams.delete('notes')
    }
    window.history.replaceState(null, '', url)
    // Re-run the notes pass when the cache is missing, partial, or the other Jev mode.
    if (mode !== 'code' && generated && (cachedNotesMode(generated) !== mode || !notePhrasesCoverPlan(generated.notePhrases, generated.plan.bars.length))) {
      const next: Generated = { ...generated, notePhrases: undefined, noteExchanges: undefined, noteMode: undefined }
      styleCache.set(generated.input.style, next)
      setGenerated(next)
    }
  }

  // ── view ──────────────────────────────────────────────────────────────────

  const accent = STYLE_THEME[plan?.style ?? style].accent
  const busy = progress !== null || picking
  // Decisions landed so far over the number a plan of this length makes (globals + role/chord/contour per bar).
  const planProgress = busy ? Math.min(1, (progress?.length ?? 0) / (GLOBAL_FIELD_IDS.length + bars * 3)) : 0
  const edited = editedPlan !== null
  const exchanges = useMemo(() => {
    if (!generated || !plan) return []
    if (edited) return shadowExchanges(plan, generated.input.brief)
    return [...generated.trace.exchanges, ...(generated.noteExchanges ?? [])]
  }, [generated, plan, edited])

  const audioLabel =
    audio.state === 'loading'
      ? `Loading ${audio.instrument.replace('_', ' ')} samples${audio.progress.total ? ` ${audio.progress.loaded}/${audio.progress.total}` : '…'}`
      : audio.state === 'error'
        ? `Audio error: ${audio.message}`
        : audio.state === 'ready'
          ? 'ready'
          : 'Audio starts on first play'

  return (
    <div className="app" style={{ '--accent': accent } as CSSProperties}>
      <header className="masthead">
        <div>
          <h1>
            <a className="home-link" href="/">Jev Playground</a> <span className="muted">/ music</span>
          </h1>
        </div>
        <div className="masthead-side">
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
            className={`dial-stop ${style === id ? 'selected' : ''} ${pendingStyle === id ? 'is-loading' : ''}`}
            style={{ '--stop': STYLE_THEME[id].accent, '--progress': pendingStyle === id ? planProgress : 0 } as CSSProperties}
            aria-busy={pendingStyle === id}
            onClick={() => chooseStyle(id)}
          >
            <span className="dial-name">{STYLE_LABELS[id]}</span>
            <span className="dial-tag">{pendingStyle === id ? dialPendingTag(pendingAsksJev, planProgress) : STYLE_THEME[id].tagline}</span>
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
        <label
          className="control-notes"
          title="How the singing line is written. Default Generate stays Code writes the tune (renderPlan). Guide and Line need live Jev and turn Debug on so the notes exchanges show; illegal RH falls back to renderPlan."
        >
          Notes
          <select value={notesMode} onChange={(event) => setNotesMode(event.target.value as NotesMode)}>
            <option value="code" title={NOTES_MODE_TITLES.code}>
              {NOTES_MODE_LABELS.code}
            </option>
            <option value="guide" title={NOTES_MODE_TITLES.guide} disabled={!jev?.planner}>
              {NOTES_MODE_LABELS.guide}
              {jev?.planner ? '' : ' (no key)'}
            </option>
            <option value="line" title={NOTES_MODE_TITLES.line} disabled={!jev?.planner}>
              {NOTES_MODE_LABELS.line}
              {jev?.planner ? '' : ' (no key)'}
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
        {planStatus && (
          <span className="plan-status" role="status">
            {planStatus}
          </span>
        )}
        <div className="controls-actions">
          <button
            type="button"
            className="primary"
            disabled={busy}
            title="A new piece in this style (new seed)"
            onClick={() => {
              resumePlayRef.current = false
              const next = newSeed()
              setSeed(next)
              // Uses plannerChoice — live Jev when available. Dial clicks never take this path.
              void generate({ seed: next })
            }}
          >
            {progress !== null && !picking ? 'Generating…' : 'Generate'}
          </button>
          <button
            type="button"
            className="ghost best-of"
            disabled={busy}
            title={`Sample ${BEST_OF_N} plans for this style and keep the one that matches it most — and the others least — and is most like a song`}
            aria-label={`Best of ${BEST_OF_N}: pick the plan that best matches this style and is most like a song`}
            onClick={() => void bestOf()}
          >
            Best
          </button>
        </div>
      </div>

      {debug && (
        <form
          className="controls controls-advanced"
          aria-label="Planner policy (debug)"
          onSubmit={(event) => {
            event.preventDefault()
            resumePlayRef.current = false
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

      {generated?.notice && <p className="banner warn">{generated.notice}</p>}
      {error && <p className="banner warn">{error}</p>}

      {generated && plan && score && (
        <>
          <div className="workbench">
            <section className={`panel sheet-panel ${busy ? 'is-stale' : ''}`} aria-busy={busy}>
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
                      </option>
                    ))}
                  </select>
                </label>
                <span className={`audio-status ${audio.state}`} role="status">
                  {audioLabel}
                </span>
                <button
                  type="button"
                  className={`ghost icon-button push-right ${saved ? 'is-saved' : ''}`}
                  title={saved ? `Saved ${saved}` : 'Download MIDI'}
                  aria-label={saved ? `Saved ${saved}` : 'Download MIDI'}
                  onClick={() => {
                    setSaved(downloadMidi(score, instrument))
                    setTimeout(() => setSaved(null), 2500)
                  }}
                >
                  {saved ? (
                    <span className="icon-check" aria-hidden="true">✓</span>
                  ) : (
                    <svg className="icon-download" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3v12" />
                      <path d="m7 10 5 5 5-5" />
                      <path d="M5 21h14" />
                    </svg>
                  )}
                </button>
              </div>
              <SheetView score={score} engine={engine} playing={playing} accent={accent} onSeekBar={(index) => void seekBar(index)} />
            </section>

            <PlanPanel plan={plan} score={score} decisions={generated.trace.decisions} edited={edited} onApply={setEditedPlan} debug={debug} />
          </div>

          <section className="panel match-panel">
            <header className="panel-head">
              <h2>How well does this plan match each style?</h2>
              <span className="tag">{displayedPlanUsesJevScore(generated.trace.planner) && !generated.notice ? 'Jev Score' : 'stub score'}</span>
            </header>
            <div className="match-row">
              {STYLE_IDS.map((id) => {
                const match = matches?.scores[id]
                return (
                  <div
                    key={id}
                    className={`match ${match ? `match-${match.match}` : ''} ${id === plan.style ? 'target' : ''}`}
                    style={{ '--stop': STYLE_THEME[id].accent } as CSSProperties}
                    title={
                      match
                        ? `${STYLE_LABELS[id]}: ${match.match} — ${Math.round(match.confidence * 100)}% confident in that rating`
                        : undefined
                    }
                  >
                    <span className="match-name">{STYLE_LABELS[id]}</span>
                    <span className="match-level">{match ? match.match : '…'}</span>
                    <Confidence value={match?.confidence} caption="confidence" />
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
              songQuality={matches?.songQuality ?? null}
              edited={edited}
              notice={generated.notice}
              notes={notesMode}
            />
          )}
        </>
      )}

    </div>
  )
}
