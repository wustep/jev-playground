// ┌──────────────────────────────────────────────────────────────────────────┐
// │  THE SEAM.  CompositionPlan (enum labels from Jev or the stub) → Score.  │
// │  Nothing upstream of this function knows about notes; nothing downstream │
// │  (sheet, playback, MIDI export) knows about Jev.                         │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Pure and deterministic: the same (plan, seed) always yields the same notes.

import { DYNAMIC_IDS, TEMPO_BPM, type BarRoleId, type CompositionPlan, type DynamicId, type DynamicShapeId } from '../plan/schema'
import { rng } from '../planner/pick'
import type { BarContext, RenderMemory } from './context'
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
      return role === 'climax' || role === 'statement' ? 18 : role === 'cadence' ? 10 : -16
  }
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
  const memory: RenderMemory = { lines: {}, voicings: {}, rhythms: {} }
  const chords = plan.bars.map((bar) => resolveChord(key, bar.chord))
  const baseVelocity = DYNAMIC_VELOCITY[plan.dynamics]

  const bars: Bar[] = plan.bars.map((barPlan, index) => {
    const role = barPlan.role
    const velocity = clamp(
      baseVelocity + shapeOffset(plan.dynamicShape, index, plan.bars.length, role) + (role === 'climax' ? 8 : 0),
      24,
      118,
    )
    const context: BarContext = {
      index,
      count: plan.bars.length,
      isLast: index === plan.bars.length - 1,
      plan: barPlan,
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
      treble: notes.treble.map((voice) => cleanVoice(voice, meter.ticksPerBar)).filter((voice) => voice.length > 0),
      bass: notes.bass.map((voice) => cleanVoice(voice, meter.ticksPerBar)).filter((voice) => voice.length > 0),
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
          const written = n.dur * tick * 0.96
          const duration = sustain ? Math.max(written, barEnd - time + 0.15) : written
          out.push({ midi: midiOf(pitch), time, duration, velocity: n.velocity, bar: bar.index, hand })
        })
      }
    }
  }
  return out.sort((a, b) => a.time - b.time)
}
