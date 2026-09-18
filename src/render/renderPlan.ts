// ┌──────────────────────────────────────────────────────────────────────────┐
// │  THE SEAM.  CompositionPlan (enum labels from Jev or the stub) → Score.  │
// │  Nothing upstream of this function knows about notes; nothing downstream │
// │  (sheet, playback, MIDI export) knows about Jev.                         │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Pure and deterministic: the same (plan, seed) always yields the same notes.

import { Note as TonalNote } from 'tonal'
import { themeSources } from '../plan/forms'
import { BAR_COUNT_VALUES, DYNAMIC_IDS, ROLE_BASE, TEMPO_BPM, type BarCount, type BarRoleId, type CharacterId, type CompositionPlan, type DynamicId, type DynamicShapeId } from '../plan/schema'
import { rng } from '../planner/pick'
import { newMemory, type BarContext, type BarNotes, type RenderMemory, type Texture } from './context'
import { applyCadenceOrnament, STYLE_DIALECTS, timingOffsetSeconds } from './dialect'
import { keyInfo, resolveChord, scaleFor, type ResolvedChord } from './harmony'
import { applyPhraseBreath, breathes, isPhraseFinalBar } from './phrasing'
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

/** Roles that never bring a tune back, whatever the form says: a phrase's punctuation and its exits. */
const PUNCTUATION: ReadonlySet<BarRoleId> = new Set<BarRoleId>(['cadence', 'half_cadence', 'surprise', 'dissolve'])

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

// ── two harmonies in one bar ────────────────────────────────────────────────
//
// Textures write a whole bar from one chord, and there are twenty-two of them.
// Rather than teach each one to change harmony mid-bar, a split bar is rendered
// twice — once on each chord, with the SAME random draws and the same memory,
// so both passes make the same choices (rhythm, figure, register) and differ
// only where the harmony differs — and the two are spliced at the split tick.
// Notes that cross the split hold through if every pitch belongs to the second
// chord (a common tone); otherwise they are cut there and the second pass's
// pitches take over.

/** A `rand` that records what it drew, and one that replays those draws before falling back to the live stream. */
function recordingRng(live: () => number): { rand: () => number; drawn: number[] } {
  const drawn: number[] = []
  return { drawn, rand: () => { const value = live(); drawn.push(value); return value } }
}
function replayRng(drawn: readonly number[], live: () => number): () => number {
  let at = 0
  return () => (at < drawn.length ? drawn[at++] : live())
}

function spliceVoice(first: Voice | undefined, second: Voice | undefined, split: number, chord2: ResolvedChord): Voice {
  const chromas = new Set(chord2.pcs.map((pc) => TonalNote.chroma(pc)))
  const inSecond = (pitch: string) => chromas.has(TonalNote.chroma(pitch))
  const out: Note[] = []
  for (const n of first ?? []) {
    if (n.start >= split) continue
    if (n.start + n.dur <= split || n.pitches.every(inSecond)) {
      out.push(n)
      continue
    }
    out.push({ ...n, dur: split - n.start })
    // The second pass's note sounding at the split carries the rest, re-pitched to the new chord.
    const cover = (second ?? []).find((m) => m.start < split && m.start + m.dur > split)
    if (cover) out.push({ ...cover, start: split, dur: n.start + n.dur - split, velocity: n.velocity })
  }
  for (const n of second ?? []) if (n.start >= split) out.push(n)
  return out
}

function renderSplitBar(texture: Texture, base: Omit<BarContext, 'chord' | 'next' | 'scale' | 'rand' | 'memory'>, chords: [ResolvedChord, ResolvedChord], next: ResolvedChord | undefined, live: () => number, memory: RenderMemory): BarNotes {
  const [first, second] = chords
  const { key, palette, meter } = base
  const before = structuredClone(memory)
  const recorder = recordingRng(live)
  const onFirst = texture({ ...base, chord: first, next: second, scale: scaleFor(key, palette, first), rand: recorder.rand, memory })
  const memoryAfterFirst = structuredClone(memory)
  // Second pass from the same starting memory and the same draws.
  Object.assign(memory, before)
  const onSecond = texture({ ...base, chord: second, next, scale: scaleFor(key, palette, second), rand: replayRng(recorder.drawn, live), memory })
  // The bar ends on the second chord, so its memory stands — except a motif stated in this bar, which the first pass heard on the downbeat chord.
  for (const [line, motif] of Object.entries(memoryAfterFirst.motifs)) if (!before.motifs[line]) memory.motifs[line] = motif
  // Likewise the theme remembers this bar as it began: over its downbeat chord.
  for (const [line, figures] of Object.entries(memoryAfterFirst.figures)) if (figures[base.index]) (memory.figures[line] ??= {})[base.index] = figures[base.index]
  const splice = (a: Voice[], b: Voice[]) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => spliceVoice(a[i], b[i], meter.splitTick, second))
  return { treble: splice(onFirst.treble, onSecond.treble), bass: splice(onFirst.bass, onSecond.bass) }
}

export function renderPlan(plan: CompositionPlan, seed: number): Score {
  const meter = METER_INFO[plan.meter]
  const key = keyInfo(plan.key)
  const texture = TEXTURE_RENDERERS[plan.texture]
  const rand = rng(seed ^ 0x9e3779b9)
  // A second stream for touch, so adding expression never reshuffles the notes.
  const touch = rng(seed ^ 0x51ed270b)
  const feel = FEEL[plan.character]
  const dialect = STYLE_DIALECTS[plan.style]
  const memory = newMemory()
  const chords = plan.bars.map((bar) => resolveChord(key, bar.chord))
  const seconds = plan.bars.map((bar) => (bar.chord2 ? resolveChord(key, bar.chord2) : undefined))
  const baseVelocity = DYNAMIC_VELOCITY[plan.dynamics]
  // Which bars bring an earlier bar's tune back: the form's returning phrases.
  // A hand-edited plan may disagree with its form label, so a bar only returns
  // while its role still allows it (a cadence is always written fresh).
  const barCount = plan.bars.length as BarCount
  const returns = (BAR_COUNT_VALUES as readonly number[]).includes(barCount) ? themeSources(plan.form, barCount) : []
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
    const base = {
      index,
      count: plan.bars.length,
      isLast: index === plan.bars.length - 1,
      plan: barPlan,
      returns: PUNCTUATION.has(barPlan.role) ? undefined : returns[index],
      phraseFinal: isPhraseFinalBar(index, plan.bars.length),
      breathes: breathes(plan.character),
      arrangement: 2 as const,
      role: ROLE_BASE[barPlan.role],
      character: plan.character,
      palette: plan.palette,
      velocity,
      meter,
      key,
      dialect,
    }
    const second = seconds[index]
    const raw = second
      ? renderSplitBar(texture, base, [chords[index], second], chords[index + 1], rand, memory)
      : texture({ ...base, chord: chords[index], next: chords[index + 1], scale: scaleFor(key, plan.palette, chords[index]), rand, memory })
    const notes = applyCadenceOrnament(raw, { ...base, chord: chords[index], next: chords[index + 1], scale: scaleFor(key, plan.palette, second ?? chords[index]), rand, memory })
    return {
      index,
      plan: barPlan,
      chordSymbol: chords[index].symbol,
      ...(second ? { split: { tick: meter.splitTick, chordSymbol: second.symbol } } : {}),
      treble: notes.treble.map((voice) => shape(cleanVoice(voice, meter.ticksPerBar), index)).filter((voice) => voice.length > 0),
      bass: notes.bass.map((voice) => shape(cleanVoice(voice, meter.ticksPerBar), index)).filter((voice) => voice.length > 0),
      dynamic: nearestDynamic(velocity),
    }
  })

  const score: Score = {
    plan,
    seed,
    keySignature: key.signature,
    meter,
    bpm: TEMPO_BPM[plan.tempo],
    bars,
    pedal: PEDALLED.has(plan.texture),
    articulation: feel.articulation,
  }
  applyPhraseBreath(score)
  return score
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
          const time = barStart + n.start * tick + (n.roll ? k * ROLL_SPREAD : 0) + timingOffsetSeconds(score, n.start, tick)
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
