// One AudioContext, one way out.
//
//   smplr instrument ─┬────────────────▶ master gain ─▶ limiter ─▶ destination
//                     └─▶ reverb send ─▶
//
// Rules this file keeps (borrowed from stagebench):
//  • exactly one AudioContext, created lazily on a user gesture
//  • every node reaches the speakers through master → limiter; nothing else
//    connects to context.destination
//  • status is truthful: idle / loading (with progress) / ready / error
//  • stop() silences every voice we started; dispose() disconnects every node,
//    closes the context and returns to idle, so React StrictMode's
//    mount → cleanup → mount cycle is safe
//
// Scheduling is a small two-clock lookahead (setInterval wakes up, the
// AudioContext clock places notes), so stop / instrument swap / loop are
// instant and nothing is ever queued more than LOOKAHEAD seconds ahead.

import { ElectricPiano, Reverb, Soundfont, SplendidGrandPiano } from 'smplr'
import type { InstrumentId } from '../plan/schema'
import { scoreDuration, timeline } from '../render/renderPlan'
import type { Score, TimedNote } from '../render/score'

/** The slice of smplr's instrument surface the engine relies on. */
interface Sampler {
  readonly ready: Promise<void>
  readonly output: { addEffect(name: string, effect: { input: AudioNode }, mix: number): void }
  start(event: { note: number; velocity: number; time: number; duration: number }): unknown
  stop(): void
  dispose(): void
}

interface InstrumentSpec {
  create(context: AudioContext, options: { destination: AudioNode; onLoadProgress: (p: LoadProgress) => void }): Sampler
  reverb: number
}

export interface LoadProgress {
  loaded: number
  total: number
}

const INSTRUMENT_SPECS: Record<InstrumentId, InstrumentSpec> = {
  grand_piano: { create: (ctx, o) => SplendidGrandPiano(ctx, { ...o, volume: 100 }), reverb: 0.16 },
  electric_piano: { create: (ctx, o) => ElectricPiano(ctx, { ...o, instrument: 'WurlitzerEP200', volume: 92 }), reverb: 0.2 },
  harpsichord: { create: (ctx, o) => Soundfont(ctx, { ...o, instrument: 'harpsichord', volume: 96 }), reverb: 0.14 },
  // Sustained instruments load loop points so whole-bar notes at largo don't run out of sample.
  church_organ: { create: (ctx, o) => Soundfont(ctx, { ...o, instrument: 'church_organ', loadLoopData: true, volume: 84 }), reverb: 0.3 },
  strings: { create: (ctx, o) => Soundfont(ctx, { ...o, instrument: 'string_ensemble_1', loadLoopData: true, volume: 96 }), reverb: 0.28 },
  choir: { create: (ctx, o) => Soundfont(ctx, { ...o, instrument: 'choir_aahs', loadLoopData: true, volume: 100 }), reverb: 0.32 },
}

export type EngineStatus =
  | { state: 'idle' }
  | { state: 'loading'; instrument: InstrumentId; progress: LoadProgress }
  | { state: 'ready'; instrument: InstrumentId }
  | { state: 'error'; instrument: InstrumentId; message: string }

const LOOKAHEAD = 0.18 // seconds of audio handed to smplr ahead of the clock
const WAKE_MS = 25
const START_DELAY = 0.12
/** A note this late (throttled background tab) is skipped, not played in a burst. */
const TOO_LATE = 0.06

interface Playback {
  notes: TimedNote[]
  cursor: number
  startedAt: number
  duration: number
  loop: boolean
  laps: number
  onEnd: () => void
}

/** Index of the first note sounding at or after `seconds` (notes are sorted by time). */
function firstNoteAt(notes: readonly TimedNote[], seconds: number): number {
  const index = notes.findIndex((n) => n.time >= seconds - 1e-6)
  return index === -1 ? notes.length : index
}

export class AudioEngine {
  private context?: AudioContext
  private master?: GainNode
  private limiter?: DynamicsCompressorNode
  private reverb?: InstanceType<typeof Reverb>
  private readonly samplers = new Map<InstrumentId, Sampler>()
  private readonly pending = new Map<InstrumentId, Promise<Sampler>>()
  private active?: { id: InstrumentId; sampler: Sampler }
  private playback?: Playback
  private timer?: ReturnType<typeof setInterval>
  private status: EngineStatus = { state: 'idle' }
  private readonly listeners = new Set<(status: EngineStatus) => void>()
  private disposed = false

  // ── status ────────────────────────────────────────────────────────────────

  getStatus(): EngineStatus {
    return this.status
  }

  subscribe(listener: (status: EngineStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setStatus(status: EngineStatus) {
    this.status = status
    this.listeners.forEach((listener) => listener(status))
  }

  // ── graph ─────────────────────────────────────────────────────────────────

  /** Idempotent. Must first be called from a user gesture. */
  ensureStarted(): AudioContext {
    this.disposed = false
    if (!this.context) {
      const context = new AudioContext({ latencyHint: 'interactive' })
      const master = context.createGain()
      master.gain.value = 0.85
      // A true limiter pose: normal material passes untouched, only peaks are caught.
      const limiter = context.createDynamicsCompressor()
      limiter.threshold.value = -3
      limiter.knee.value = 3
      limiter.ratio.value = 20
      limiter.attack.value = 0.002
      limiter.release.value = 0.15
      master.connect(limiter)
      limiter.connect(context.destination)
      this.context = context
      this.master = master
      this.limiter = limiter
      try {
        const reverb = Reverb(context)
        reverb.connect(master)
        this.reverb = reverb
      } catch {
        this.reverb = undefined // no AudioWorklet: play dry rather than not at all
      }
    }
    if (this.context.state === 'suspended') void this.context.resume()
    return this.context
  }

  /** Load (once) and select an instrument. Safe to call while playing. */
  async setInstrument(id: InstrumentId): Promise<void> {
    const context = this.ensureStarted()
    const master = this.master!
    const cached = this.samplers.get(id)
    if (!cached) this.setStatus({ state: 'loading', instrument: id, progress: { loaded: 0, total: 0 } })

    let loading = this.pending.get(id)
    if (!cached && !loading) {
      loading = (async () => {
        const spec = INSTRUMENT_SPECS[id]
        const sampler = spec.create(context, {
          destination: master,
          onLoadProgress: (progress) => {
            if (this.status.state === 'loading' && this.status.instrument === id) {
              this.setStatus({ state: 'loading', instrument: id, progress })
            }
          },
        })
        await sampler.ready
        if (this.reverb) sampler.output.addEffect('reverb', this.reverb, spec.reverb)
        return sampler
      })()
      this.pending.set(id, loading)
    }

    try {
      const sampler = cached ?? (await loading!)
      this.pending.delete(id)
      if (this.disposed) {
        sampler.dispose()
        return
      }
      this.samplers.set(id, sampler)
      // Hand over mid-phrase: silence the old instrument, the scheduler simply
      // continues on the new one.
      if (this.active && this.active.sampler !== sampler) this.active.sampler.stop()
      this.active = { id, sampler }
      this.setStatus({ state: 'ready', instrument: id })
    } catch (error) {
      this.pending.delete(id)
      this.setStatus({ state: 'error', instrument: id, message: error instanceof Error ? error.message : 'Could not load samples' })
      throw error
    }
  }

  // ── transport ─────────────────────────────────────────────────────────────

  /** `from` = seconds into the piece to start at (a bar the listener clicked). */
  async play(score: Score, instrument: InstrumentId, options: { loop: boolean; onEnd: () => void; from?: number }): Promise<void> {
    this.stop()
    await this.setInstrument(instrument)
    const context = this.context
    if (!context || this.disposed) return
    if (context.state === 'suspended') await context.resume()
    const notes = timeline(score)
    const from = Math.max(0, Math.min(options.from ?? 0, scoreDuration(score) - 0.01))
    this.playback = {
      notes,
      cursor: firstNoteAt(notes, from),
      startedAt: context.currentTime + START_DELAY - from,
      duration: scoreDuration(score),
      loop: options.loop,
      laps: 0,
      onEnd: options.onEnd,
    }
    this.timer = setInterval(() => this.pump(), WAKE_MS)
    this.pump()
  }

  /** Jump to `seconds` into the piece while playing. Returns false when nothing is playing. */
  seek(seconds: number): boolean {
    const { context, playback } = this
    if (!context || !playback) return false
    const to = Math.max(0, Math.min(seconds, playback.duration - 0.01))
    // Nothing is queued beyond LOOKAHEAD, so silencing the voices clears the old position.
    for (const sampler of this.samplers.values()) {
      try {
        sampler.stop()
      } catch {
        /* already disposed */
      }
    }
    playback.cursor = firstNoteAt(playback.notes, to)
    playback.startedAt = context.currentTime + START_DELAY - to
    this.pump()
    return true
  }

  setLoop(loop: boolean) {
    if (this.playback) this.playback.loop = loop
  }

  private pump() {
    const { context, playback, active } = this
    if (!context || !playback || !active) return
    const now = context.currentTime
    const horizon = now + LOOKAHEAD
    while (playback.cursor < playback.notes.length) {
      const next = playback.notes[playback.cursor]
      const at = playback.startedAt + next.time
      if (at > horizon) break
      if (at >= now - TOO_LATE) {
        active.sampler.start({ note: next.midi, velocity: next.velocity, time: Math.max(at, now), duration: next.duration })
      }
      playback.cursor += 1
    }
    if (playback.cursor >= playback.notes.length) {
      if (playback.loop) {
        if (playback.startedAt + playback.duration <= horizon) {
          playback.startedAt += playback.duration
          playback.cursor = 0
          playback.laps += 1
        }
      } else if (now > playback.startedAt + playback.duration + 0.6) {
        const { onEnd } = playback
        this.clearTransport()
        onEnd()
      }
    }
  }

  /** Seconds into the piece (wraps when looping), or null when stopped. */
  position(): number | null {
    if (!this.context || !this.playback) return null
    const elapsed = this.context.currentTime - this.playback.startedAt
    // The scheduler moves `startedAt` to the next lap LOOKAHEAD early; until the
    // clock catches up we are still audibly at the end of the previous lap.
    if (elapsed < 0 && this.playback.laps > 0) return elapsed + this.playback.duration
    // Past the last note (the short tail before onEnd fires) the position is the end — never a wrap to the start.
    return Math.min(Math.max(0, elapsed), this.playback.duration)
  }

  get isPlaying(): boolean {
    return Boolean(this.playback)
  }

  private clearTransport() {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
    this.playback = undefined
  }

  stop() {
    this.clearTransport()
    // Nothing is queued beyond LOOKAHEAD, so stopping voices is a full stop.
    for (const sampler of this.samplers.values()) {
      try {
        sampler.stop()
      } catch {
        /* already disposed */
      }
    }
  }

  dispose() {
    this.disposed = true
    this.stop()
    for (const sampler of this.samplers.values()) {
      try {
        sampler.dispose()
      } catch {
        /* already disposed */
      }
    }
    this.samplers.clear()
    this.pending.clear()
    this.active = undefined
    for (const node of [this.master, this.limiter]) {
      try {
        node?.disconnect()
      } catch {
        /* detached */
      }
    }
    void this.context?.close().catch(() => undefined)
    this.context = undefined
    this.master = undefined
    this.limiter = undefined
    this.reverb = undefined
    this.setStatus({ state: 'idle' })
  }
}
