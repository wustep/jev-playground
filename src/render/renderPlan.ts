// ┌──────────────────────────────────────────────────────────────────────────┐
// │  THE SEAM.  CompositionPlan (enum labels from Jev or the stub) → Score.  │
// │  Nothing upstream of this function knows about notes; nothing downstream │
// │  (sheet, playback, MIDI export) knows about Jev.                         │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Pure and deterministic: the same (plan, seed) always yields the same notes.
//
// The order here is the argument of the whole rewrite. The tune is written
// first, over the whole piece, by one writer that knows the register and the
// subdivision the plan asked for. Only then is it accompanied, by a pattern
// that is told where the tune's floor is and may not cross it. Expression —
// velocity, accent, rubato, pedal — is applied last and changes no pitches.

import { barPositions } from '../plan/phrase'
import { BAR_COUNT_VALUES, TEMPO_BPM, type BarCount, type CompositionPlan, type DynamicId, type DynamicShapeId } from '../plan/schema'
import { rng } from '../planner/pick'
import { PEDAL_FOR, writeAccompaniment } from './accompaniment'
import { keyInfo, resolveChord, scaleFor } from './harmony'
import { writeMelody } from './melody'
import { clamp, midiOf } from './pitch'
import { METER_INFO, type Bar, type Note, type Score, type TimedNote, type Voice } from './score'
import { STYLE_VOICES } from './styleVoice'
import { newMemory, type BarView } from './voice'
import type { BarRole } from '../plan/phrase'

const DYNAMIC_VELOCITY: Record<DynamicId, number> = { pp: 36, p: 50, mp: 64, mf: 78, f: 94, ff: 110 }
const DYNAMIC_IDS = Object.keys(DYNAMIC_VELOCITY) as DynamicId[]

/** Velocity offset for bar `index` of `count` under a dynamic shape. */
function shapeOffset(shape: DynamicShapeId, index: number, count: number, role: BarRole): number {
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
      return role === 'climax' || role === 'statement' || role === 'cadence' ? 16 : -16
    case 'waves':
      return index % 2 === 0 ? -6 : 9
    case 'late_surge':
      return t < 0.62 ? -12 : -12 + ((t - 0.62) / 0.38) * 30
    case 'build_then_drop':
      return t < 0.75 ? -12 + (t / 0.75) * 30 : -16
  }
}

/** Dynamic inflection a role adds on top of the shape. */
const ROLE_VELOCITY: Partial<Record<BarRole, number>> = { climax: 8, contrast: -10, half_cadence: -6 }

function nearestDynamic(velocity: number): DynamicId {
  return DYNAMIC_IDS.reduce((best, id) => (Math.abs(DYNAMIC_VELOCITY[id] - velocity) < Math.abs(DYNAMIC_VELOCITY[best] - velocity) ? id : best))
}

/** Sort, drop junk, and trim overlaps so every voice is a clean monophonic line. */
function cleanVoice(voice: Voice, ticksPerBar: number): Voice {
  const sorted = voice
    .filter((n) => n.pitches.length > 0 && n.dur > 0 && n.start >= 0 && n.start < ticksPerBar)
    .map((n) => ({ ...n, start: Math.round(n.start), dur: Math.round(n.dur), pitches: [...new Set(n.pitches)].sort((a, b) => midiOf(a) - midiOf(b)) }))
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
  const voice = STYLE_VOICES[plan.style]
  const rand = rng(seed ^ 0x9e3779b9)
  // A second stream for touch, so adding expression never reshuffles the notes,
  // and a third for holding the tune over a barline.
  const touch = rng(seed ^ 0x51ed270b)
  const hold = rng(seed ^ 0x2545f491)
  const memory = newMemory()

  const barCount = plan.bars.length as BarCount
  const positions = barPositions(plan.form, (BAR_COUNT_VALUES as readonly number[]).includes(barCount) ? barCount : 16)
  const chords = plan.bars.map((bar) => resolveChord(key, bar.chord))
  const seconds = plan.bars.map((bar) => (bar.chord2 ? resolveChord(key, bar.chord2) : undefined))
  const base = DYNAMIC_VELOCITY[plan.dynamics]
  const velocities = plan.bars.map((_, index) =>
    clamp(base + shapeOffset(plan.dynamicShape, index, plan.bars.length, positions[index]?.role ?? 'continuation') + (ROLE_VELOCITY[positions[index]?.role ?? 'continuation'] ?? 0), 24, 118),
  )

  const views: BarView[] = plan.bars.map((barPlan, index) => {
    const position = positions[index] ?? { role: 'continuation', ornamentReturn: false, phraseFinal: false, phraseEnd: 'open', phrase: 0 }
    return {
      index,
      count: plan.bars.length,
      isLast: index === plan.bars.length - 1,
      position,
      ornament: position.returnsFrom !== undefined && (position.ornamentReturn || voice.answers === 'dressed'),
      contour: barPlan.contour,
      chord: chords[index],
      chord2: seconds[index],
      next: chords[index + 1],
      scale: scaleFor(key, plan.palette, chords[index]),
      scale2: seconds[index] ? scaleFor(key, plan.palette, seconds[index]!) : undefined,
      palette: plan.palette,
      key,
      meter,
      velocity: velocities[index],
      rand,
      memory,
    }
  })

  // 1. The tune, whole, first.
  const melody = writeMelody(plan, views, hold)
  // 2. Then what holds it up, told where its floor is — and, for a bar where
  //    the tune is silent, where it last sang.
  let lastSung: number | undefined
  const accompaniment = views.map((view, index) => {
    const bar = writeAccompaniment(plan, view, melody[index], lastSung)
    const last = melody[index].notes[melody[index].notes.length - 1]
    if (last) lastSung = midiOf(last.pitches[last.pitches.length - 1])
    return bar
  })

  /**
   * Where a running bar of the tune is accented instead of on the beat: the
   * start of each group in the style's grouping, one grouping a bar in turn.
   * Only for a line that really runs — twelve or more attacks, in a bar the
   * grouping exactly fills.
   */
  const groupStarts = (line: Voice, index: number): Set<number> | undefined => {
    const groupings = voice.grouping?.filter((groups) => groups.reduce((a, b) => a + b, 0) === meter.ticksPerBar)
    if (!groupings?.length || line.length < 12) return undefined
    const groups = groupings[index % groupings.length]
    return new Set(groups.map((_, g) => groups.slice(0, g).reduce((a, b) => a + b, 0)))
  }

  /** Lean toward the next bar's level, lean on the metre, never play two notes identically. */
  const shape = (line: Voice, index: number, tune = false): Voice => {
    const towards = (velocities[index + 1] ?? velocities[index]) - velocities[index]
    const grouped = tune ? groupStarts(line, index) : undefined
    return line.map((n) => {
      const onBeat = n.start % meter.beatTicks === 0
      const metric = (grouped ? (grouped.has(n.start) ? 3 : -1.5) : n.start === 0 ? 3 : onBeat ? 1 : -2) * voice.accent
      const hairpin = towards * (n.start / meter.ticksPerBar) * 0.6
      const jitter = (touch() * 2 - 1) * voice.humanize
      return { ...n, velocity: clamp(Math.round(n.velocity + metric + hairpin + jitter), 1, 127) }
    })
  }

  const bars: Bar[] = plan.bars.map((barPlan, index) => {
    // The treble staff is the tune's alone: `treble[0]` is the melody by
    // construction, which is what the compare metrics read it as.
    const treble = [melody[index].notes]
    const bass = accompaniment[index].bass
    return {
      index,
      plan: barPlan,
      role: positions[index]?.role ?? 'continuation',
      chordSymbol: chords[index].symbol,
      ...(seconds[index] ? { split: { tick: meter.splitTick, chordSymbol: seconds[index]!.symbol } } : {}),
      treble: treble.map((line, v) => shape(cleanVoice(line, meter.ticksPerBar), index, v === 0)).filter((line) => line.length > 0),
      bass: bass.map((line) => shape(cleanVoice(line, meter.ticksPerBar), index)).filter((line) => line.length > 0),
      dynamic: nearestDynamic(velocities[index]),
    }
  })

  return {
    plan,
    seed,
    keySignature: key.signature,
    meter,
    bpm: TEMPO_BPM[plan.tempo],
    bars,
    pedal: PEDAL_FOR[plan.accompaniment],
    articulation: voice.articulation,
    ritardando: true,
  }
}

// ── Score → absolute time ───────────────────────────────────────────────────

export const secondsPerTick = (score: Score) => 60 / score.bpm / 4

export function scoreDuration(score: Score): number {
  const tick = secondsPerTick(score)
  const body = score.bars.length * score.meter.ticksPerBar * tick
  // Ritardando stretches the last bar; a little ring after the last attack.
  return score.ritardando ? body + score.meter.ticksPerBar * tick * 0.28 + 0.35 : body
}

/** Seconds between successive notes of a rolled chord. */
const ROLL_SPREAD = 0.028

/** Style rubato: how much the middle of a bar leans, in fractions of a tick. */
function timingOffsetSeconds(score: Score, startTick: number, tick: number): number {
  const rubato = STYLE_VOICES[score.plan.style].rubato
  if (rubato === 'even') return 0
  const t = startTick / score.meter.ticksPerBar
  if (rubato === 'swung') {
    // Off-beats delay, and the whole line sits a shade behind the beat.
    const off = startTick % score.meter.beatTicks !== 0
    return (off ? 0.28 : 0.06) * tick
  }
  if (rubato === 'two_against_three') {
    // Duple subdivisions lean toward triplets; compound metres already are.
    if (score.meter.beatTicks !== 4) return 0
    const inBeat = startTick % 4
    return (inBeat === 2 ? 0.33 : inBeat === 1 || inBeat === 3 ? 0.12 : 0) * tick
  }
  // light: a small sine leans the middle of the bar; barlines stay put.
  return Math.sin(Math.PI * t) * 0.18 * tick
}

/**
 * Flatten to sounding notes. The score's pedal level holds notes past their
 * written length (half overlaps, full rings to the barline). MIDI export
 * passes `sustain: false` and writes real CC64 events instead.
 */
export function timeline(score: Score, options: { sustain?: boolean } = {}): TimedNote[] {
  const pedal = options.sustain === false ? 'dry' : options.sustain === true ? 'full' : score.pedal
  const tick = secondsPerTick(score)
  const lastIndex = score.bars.length - 1
  const stretch = score.ritardando ? 1.28 : 1
  const out: TimedNote[] = []
  // The note each voice last struck per pitch, and the bar it was sounding
  // in, so a note tied over the barline lengthens it instead of striking again.
  const ringing = new Map<string, { note: TimedNote; bar: number }>()
  for (const bar of score.bars) {
    const barStart = bar.index * score.meter.ticksPerBar * tick
    const localTick = bar.index === lastIndex ? tick * stretch : tick
    const barEnd = barStart + score.meter.ticksPerBar * localTick
    const voices = [...bar.treble.map((line, v) => ['right', v, line] as const), ...bar.bass.map((line, v) => ['left', v, line] as const)]
    for (const [hand, v, line] of voices) {
      for (const n of line) {
        n.pitches.forEach((pitch, k) => {
          const time = barStart + n.start * localTick + (n.roll ? k * ROLL_SPREAD : 0) + timingOffsetSeconds(score, n.start, tick)
          // Short notes are clipped or held by the style's touch; long ones always sing.
          const held = n.dur <= score.meter.beatTicks / 2 ? score.articulation : Math.max(score.articulation, 0.9)
          const written = n.dur * localTick * 0.96 * held
          const remain = barEnd - time
          const duration = pedal === 'dry' ? written : pedal === 'half' ? Math.max(written, written + Math.max(0, remain) * 0.5) : Math.max(written, remain + 0.15)
          const key = `${hand}:${v}:${midiOf(pitch)}`
          const tiedFrom = n.tied ? ringing.get(key) : undefined
          if (tiedFrom && tiedFrom.bar === bar.index - 1) {
            tiedFrom.note.duration = Math.max(tiedFrom.note.duration, time + duration - tiedFrom.note.time)
            tiedFrom.bar = bar.index
            return
          }
          const timed: TimedNote = { midi: midiOf(pitch), time, duration, velocity: n.velocity, bar: bar.index, hand }
          out.push(timed)
          ringing.set(key, { note: timed, bar: bar.index })
        })
      }
    }
  }
  return out.sort((a, b) => a.time - b.time)
}
