// ┌──────────────────────────────────────────────────────────────────────────┐
// │  THE SEAM.  CompositionPlan (enum labels from Jev or the stub) → Score.  │
// │  Nothing upstream of this function knows about notes; nothing downstream │
// │  (sheet, playback, MIDI export) knows about Jev.                         │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Pure and deterministic: the same (plan, seed) always yields the same notes.

import { DYNAMIC_IDS, ROLE_BASE, TEMPO_BPM, type BarRoleId, type CharacterId, type CompositionPlan, type DynamicId, type DynamicShapeId } from '../plan/schema'
import { rng } from '../planner/pick'
import { newMemory, type BarContext } from './context'
import { keyInfo, resolveChord, scaleFor } from './harmony'
import { clamp, midiOf } from './pitch'
import { METER_INFO, type Bar, type Note, type Score, type TimedNote, type Voice } from './score'
import { PEDALLED, TEXTURE_RENDERERS } from './textures'

const DYNAMIC_VELOCITY: Record<DynamicId, number> = { pp: 36, p: 50, mp: 64, mf: 78, f: 94, ff: 110 }

/** Velocity offset for bar `index` of `count` under a dynamic shape. */
function shapeOffset(shape: DynamicShapeId, index: number, count: number, role: BarRoleId): number {
  const t = count === 1 ? 0 : index / (count - 1)
  switch (shape) {
    case 'steady':
      return 0
    case 'crescendo':
      return -14 + 28 * t
    case 'decrescendo':
      return 14 - 28 * t
    case 'arch':
      return -12 + 26 * Math.sin(Math.PI * Math.min(1, t / 0.7) * 0.5) - (t > 0.7 ? ((t - 0.7) / 0.3) * 20 : 0)
    case 'terraced':
      // Two-bar blocks: statement, then its echo a level down.
      return Math.floor(index / 2) % 2 === 0 ? 4 : -14
    case 'sudden_contrast':
      return role === 'climax' || role === 'statement' || role === 'surprise' ? 18 : role === 'cadence' ? 10 : -16
    case 'waves':
      // Two-bar breaths: in, out. The within-bar hairpin below joins them up.
      return index % 2 === 0 ? -6 : 9
    case 'late_surge':
      return t < 0.62 ? -12 : -12 + ((t - 0.62) / 0.38) * 30
    case 'build_then_drop':
      return t < 0.75 ? -12 + (t / 0.75) * 30 : -16
  }
}

/** Dynamic inflection a role adds on top of the shape. */
const ROLE_VELOCITY: Partial<Record<BarRoleId, number>> = { climax: 8, echo: -18, dissolve: -14, surprise: 6 }

/**
 * How a character is *played*, independent of which notes are written:
 * how hard the metre is leaned on, how long short notes are held, and how
 * even the touch is. Small numbers — this is feel, not composition.
 */
interface Feel {
  /** Scales the metric accent (downbeat up, off-beats down). */
  accent: number
  /** Fraction of a short note's written length that sounds when the pedal is up. */
  articulation: number
  /** Peak random velocity deviation, in MIDI units. */
  humanize: number
}
const FEEL: Record<CharacterId, Feel> = {
  lyrical_song: { accent: 0.7, articulation: 1, humanize: 3 },
  stormy_drama: { accent: 1.5, articulation: 0.9, humanize: 3 },
  flowing_perpetual: { accent: 0.8, articulation: 0.96, humanize: 2 },
  solemn_hymn: { accent: 0.6, articulation: 1, humanize: 2 },
  dance_lilt: { accent: 1.6, articulation: 0.8, humanize: 3 },
  playful_wit: { accent: 1.4, articulation: 0.55, humanize: 4 },
  meditative_stillness: { accent: 0.3, articulation: 1, humanize: 3 },
  hypnotic_pulse: { accent: 0.9, articulation: 0.92, humanize: 1 },
  dreamy_haze: { accent: 0.4, articulation: 1, humanize: 4 },
  heroic_bright: { accent: 1.4, articulation: 0.85, humanize: 2 },
  warm_groove: { accent: 1.1, articulation: 0.9, humanize: 5 },
  restless_searching: { accent: 1, articulation: 0.92, humanize: 4 },
}

function nearestDynamic(velocity: number): DynamicId {
  return DYNAMIC_IDS.reduce((best, id) => (Math.abs(DYNAMIC_VELOCITY[id] - velocity) < Math.abs(DYNAMIC_VELOCITY[best] - velocity) ? id : best))
}

/** Sort, drop junk, and trim overlaps so every voice is a clean monophonic line. */
function cleanVoice(voice: Voice, ticksPerBar: number): Voice {
  const sorted = voice
    .filter((n) => n.pitches.length > 0 && n.dur > 0 && n.start >= 0 && n.start < ticksPerBar)
    .map((n) => ({
      ...n,
      start: Math.round(n.start),
      dur: Math.round(n.dur),
      pitches: [...new Set(n.pitches)].sort((a, b) => midiOf(a) - midiOf(b)),
    }))
    .sort((a, b) => a.start - b.start)
  const out: Note[] = []
  for (const n of sorted) {
    const previous = out[out.length - 1]
    if (previous && previous.start + previous.dur > n.start) previous.dur = n.start - previous.start
    if (previous && previous.dur <= 0) out.pop()
    out.push({ ...n, dur: Math.min(n.dur, ticksPerBar - n.start) })
  }
  return out
}

export function renderPlan(plan: CompositionPlan, seed: number): Score {
  const meter = METER_INFO[plan.meter]
  const key = keyInfo(plan.key)
  const texture = TEXTURE_RENDERERS[plan.texture]
  const rand = rng(seed ^ 0x9e3779b9)
  // A second stream for touch, so adding expression never reshuffles the notes.
  const touch = rng(seed ^ 0x51ed270b)
  const feel = FEEL[plan.character]
  const memory = newMemory()
  const chords = plan.bars.map((bar) => resolveChord(key, bar.chord))
  const baseVelocity = DYNAMIC_VELOCITY[plan.dynamics]
  const velocities = plan.bars.map((barPlan, index) =>
    clamp(baseVelocity + shapeOffset(plan.dynamicShape, index, plan.bars.length, barPlan.role) + (ROLE_VELOCITY[barPlan.role] ?? 0), 24, 118),
  )

  /** Phrase the bar: lean toward the next bar's level, lean on the metre, and never play two notes identically. */
  const shape = (voice: Voice, index: number): Voice => {
    const towards = (velocities[index + 1] ?? velocities[index]) - velocities[index]
    return voice.map((n) => {
      const onBeat = n.start % meter.beatTicks === 0
      const metric = (n.start === 0 ? 3 : onBeat ? 1 : -2) * feel.accent
      const hairpin = towards * (n.start / meter.ticksPerBar) * 0.6
      const jitter = (touch() * 2 - 1) * feel.humanize
      return { ...n, velocity: clamp(Math.round(n.velocity + metric + hairpin + jitter), 1, 127) }
    })
  }

  const bars: Bar[] = plan.bars.map((barPlan, index) => {
    const velocity = velocities[index]
    const context: BarContext = {
      index,
      count: plan.bars.length,
      isLast: index === plan.bars.length - 1,
      plan: barPlan,
      role: ROLE_BASE[barPlan.role],
      character: plan.character,
      chord: chords[index],
      next: chords[index + 1],
      scale: scaleFor(key, plan.palette, chords[index]),
      palette: plan.palette,
      velocity,
      meter,
      key,
      rand,
      memory,
    }
    const notes = texture(context)
    return {
      index,
      plan: barPlan,
      chordSymbol: chords[index].symbol,
      treble: notes.treble.map((voice) => shape(cleanVoice(voice, meter.ticksPerBar), index)).filter((voice) => voice.length > 0),
      bass: notes.bass.map((voice) => shape(cleanVoice(voice, meter.ticksPerBar), index)).filter((voice) => voice.length > 0),
      dynamic: nearestDynamic(velocity),
    }
  })

  return {
    plan,
    seed,
    keySignature: key.signature,
    meter,
    bpm: TEMPO_BPM[plan.tempo],
    bars,
    pedal: PEDALLED.has(plan.texture),
    articulation: feel.articulation,
  }
}

// ── Score → absolute time ───────────────────────────────────────────────────

export const secondsPerTick = (score: Score) => 60 / score.bpm / 4

export function scoreDuration(score: Score): number {
  return score.bars.length * score.meter.ticksPerBar * secondsPerTick(score)
}

/** Seconds between successive notes of a rolled chord. */
const ROLL_SPREAD = 0.028

/**
 * Flatten to sounding notes. With `sustain` (default: the score's pedal flag)
 * notes ring to the end of their bar regardless of written length — the sheet
 * still shows what's written. MIDI export passes `sustain: false` and writes
 * real CC64 pedal events instead.
 */
export function timeline(score: Score, options: { sustain?: boolean } = {}): TimedNote[] {
  const sustain = options.sustain ?? score.pedal
  const tick = secondsPerTick(score)
  const out: TimedNote[] = []
  for (const bar of score.bars) {
    const barStart = bar.index * score.meter.ticksPerBar * tick
    const barEnd = barStart + score.meter.ticksPerBar * tick
    const voices = [...bar.treble.map((voice) => ['right', voice] as const), ...bar.bass.map((voice) => ['left', voice] as const)]
    for (const [hand, voice] of voices) {
      for (const n of voice) {
        n.pitches.forEach((pitch, k) => {
          const time = barStart + n.start * tick + (n.roll ? k * ROLL_SPREAD : 0)
          // Character touch: short notes are clipped (staccato wit) or held (legato song); long ones always sing.
          const held = n.dur <= score.meter.beatTicks / 2 ? score.articulation : Math.max(score.articulation, 0.9)
          const written = n.dur * tick * 0.96 * held
          const duration = sustain ? Math.max(written, barEnd - time + 0.15) : written
          out.push({ midi: midiOf(pitch), time, duration, velocity: n.velocity, bar: bar.index, hand })
        })
      }
    }
  }
  return out.sort((a, b) => a.time - b.time)
}
