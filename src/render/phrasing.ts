// Phrase breath and anacrusis. Driven from the closed `phrasing` global
// (on_the_beat | upbeat | breathing | long_breathed). Hand-edited plans that
// omit it keep the character default in `defaultPhrasing` — a lyrical song
// breathes; a perpetual or stormy piece stays on the beat. A stormy ballade
// can still rest if the planner writes `phrasing: breathing`.
//
// Cross-bar ties are out of this cut (Note.dur still stays inside the bar).
// The pickup lives in the rest at the end of the previous bar.

import { themeSources } from '../plan/forms'
import {
  BAR_COUNT_VALUES,
  defaultPhrasing,
  resolveHookBars,
  type BarCount,
  type CharacterId,
  type CompositionPlan,
  type FormId,
  type PhrasingId,
} from '../plan/schema'
import { keyInfo, resolveChord, scaleFor } from './harmony'
import { clamp, ladder, midiOf, nearestIndex, nearestNote } from './pitch'
import type { MeterInfo, Note, Score, Voice } from './score'

export type { PhrasingId }

export function resolvePhrasing(plan: Pick<CompositionPlan, 'character' | 'phrasing'>): PhrasingId {
  return plan.phrasing ?? defaultPhrasing(plan.character)
}

/** Character default, or the plan's `phrasing` when a CompositionPlan is passed. */
export function phrasingOf(input: CharacterId | Pick<CompositionPlan, 'character' | 'phrasing'>): PhrasingId {
  return typeof input === 'string' ? defaultPhrasing(input) : resolvePhrasing(input)
}

export const breathes = (phrasing: PhrasingId) => phrasing !== 'on_the_beat'

/** Last bar of a four-bar slot, or the last bar of the piece. */
export function isPhraseFinalBar(index: number, count: number): boolean {
  return (index + 1) % 4 === 0 || index === count - 1
}

/** How much of the bar's end is air (then, often, a pickup). Never the whole bar. */
export function phraseRestTicks(meter: MeterInfo, phrasing: PhrasingId): number {
  if (phrasing === 'on_the_beat') return 0
  const beats = phrasing === 'long_breathed' && meter.ticksPerBar >= meter.beatTicks * 3 ? 2 : 1
  return Math.min(meter.beatTicks * beats, meter.ticksPerBar - meter.beatTicks)
}

/**
 * Carve a rest out of the end of a bar-filling rhythm: the last sounding
 * value is shortened so the line lands early, holds, and leaves the last
 * beat(s) empty. Rhythms that already rest enough are left alone.
 */
export function withEndRest(rhythm: readonly number[], restTicks: number): number[] {
  if (restTicks <= 0) return [...rhythm]
  const total = rhythm.reduce((sum, value) => sum + Math.abs(value), 0)
  const rest = Math.min(restTicks, Math.max(0, total - 1))
  const cut = total - rest
  if (cut <= 0) return [...rhythm]
  const already = trailingRest(rhythm)
  if (already >= rest) return [...rhythm]
  const out: number[] = []
  let at = 0
  for (const value of rhythm) {
    const abs = Math.abs(value)
    if (at >= cut) break
    if (at + abs <= cut) {
      out.push(value)
      at += abs
      continue
    }
    if (value > 0) {
      const kept = cut - at
      if (kept > 0) out.push(kept)
    }
    at = cut
    break
  }
  if (!out.some((value) => value > 0)) out.unshift(cut)
  out.push(-rest)
  return out
}

function trailingRest(rhythm: readonly number[]): number {
  let rest = 0
  for (let i = rhythm.length - 1; i >= 0 && rhythm[i] < 0; i--) rest += -rhythm[i]
  return rest
}

/** Clip sounding notes that spill into `[restFrom, ticksPerBar)`. */
export function clipVoiceTo(voice: Voice, restFrom: number): void {
  if (restFrom <= 0 || voice.length === 0) return
  const kept = voice.filter((n) => n.start < restFrom)
  if (kept.length === 0) {
    // The whole line sat in the rest: pull the first attack earlier so the bar still sings.
    const first = voice[0]
    voice.splice(0, voice.length, { ...first, start: 0, dur: restFrom })
    return
  }
  const clipped = kept
    .map((n) => (n.start + n.dur > restFrom ? { ...n, dur: restFrom - n.start } : n))
    .filter((n) => n.dur > 0)
    .sort((a, b) => a.start - b.start)
  voice.splice(0, voice.length, ...clipped)
  if (voice.length === 0) {
    const first = kept[0]
    voice.push({ ...first, start: 0, dur: restFrom })
  }
}

function firstMelodyPitch(voice: Voice | undefined): string | undefined {
  if (!voice?.length) return undefined
  return voice[0].pitches[voice[0].pitches.length - 1]
}

function lastMelodyPitch(voice: Voice): string | undefined {
  for (let k = voice.length - 1; k >= 0; k--) {
    const pitch = voice[k].pitches[voice[k].pitches.length - 1]
    if (pitch) return pitch
  }
  return undefined
}

/** One to three short notes stepping into `to`, staying inside the rest. */
export function pickupNotes(
  from: string,
  to: string,
  restFrom: number,
  ticksPerBar: number,
  scale: readonly string[],
  velocity: number,
): Voice {
  const gap = ticksPerBar - restFrom
  if (gap < 2) return []
  const pickupTicks = gap >= 6 ? 4 : gap >= 4 ? 4 : 2
  const start = ticksPerBar - pickupTicks
  const count = pickupTicks >= 4 ? 2 : 1
  const durs = count === 1 ? [pickupTicks] : [Math.floor(pickupTicks / 2), Math.ceil(pickupTicks / 2)]
  // Anacrusis approaches the downbeat, not the basement: fold `from` into the
  // destination octave so a bass C2 → melody C5 does not write C2 on the treble staff.
  const toMidi = midiOf(to)
  let fromMidi = midiOf(from)
  while (fromMidi < toMidi - 9) fromMidi += 12
  while (fromMidi > toMidi + 9) fromMidi -= 12
  const rungs = ladder(scale, Math.min(fromMidi, toMidi) - 14, Math.max(fromMidi, toMidi) + 14)
  const write = (startAt: number, dur: number, pitch: string): Note => ({
    start: startAt,
    dur,
    pitches: [pitch],
    velocity: clamp(Math.round(velocity - 8), 1, 127),
  })
  if (rungs.length === 0) return durs.map((dur, k) => write(start + durs.slice(0, k).reduce((a, b) => a + b, 0), dur, from))
  let fromI = nearestIndex(rungs, fromMidi)
  const toI = nearestIndex(rungs, toMidi)
  if (fromI === toI) fromI = clamp(fromI - count, 0, rungs.length - 1)
  const toward = Math.sign(toI - fromI) || 1
  const path = Array.from({ length: count }, (_, k) => clamp(fromI + toward * (k + 1), 0, rungs.length - 1))
  // Don't land on the next downbeat: stop a step short when we would hit it.
  if (path[path.length - 1] === toI && count > 0) path[path.length - 1] = clamp(toI - toward, 0, rungs.length - 1)
  let at = start
  return durs.map((dur, k) => {
    let pitch = rungs[path[k] ?? fromI]
    // Last guard: never write a pickup more than a seventh below the target.
    if (pitch && midiOf(pitch) < toMidi - 10) {
      const pc = pitch.replace(/-?\d+$/, '')
      try {
        pitch = nearestNote([pc], toMidi - 4, toMidi - 10, toMidi)
      } catch {
        pitch = rungs[toI] ?? pitch
      }
    }
    const written = write(at, dur, pitch)
    at += dur
    return written
  })
}

/**
 * After every body bar is on the page: phrase-final bars of a breathing
 * piece rest the last beat(s), then (except the last phrase) fill that rest
 * with a pickup into the next bar's first pitch — known for returning
 * themes because they have already been sung.
 *
 * A bar the form marks as a return is left alone so the theme stays intact;
 * its source (an earlier phrase-final that was written fresh) already breathed.
 */
export function applyPhraseBreath(score: Score): void {
  const phrasing = resolvePhrasing(score.plan)
  if (phrasing === 'on_the_beat') return
  const { plan, meter } = score
  const barCount = plan.bars.length
  const restTicks = phraseRestTicks(meter, phrasing)
  if (restTicks <= 0) return
  const returns =
    (BAR_COUNT_VALUES as readonly number[]).includes(barCount)
      ? themeSources(plan.form as FormId, barCount as BarCount, resolveHookBars(plan))
      : []
  const key = keyInfo(plan.key)

  for (let i = 0; i < score.bars.length; i++) {
    if (!isPhraseFinalBar(i, barCount)) continue
    if (returns[i] !== undefined) continue
    const bar = score.bars[i]
    const voice = bar.treble[0]
    if (!voice?.length) continue
    const restFrom = meter.ticksPerBar - restTicks
    clipVoiceTo(voice, restFrom)
    if (i >= score.bars.length - 1) continue
    // `upbeat` fills the rest with a pickup. `breathing` / `long_breathed`
    // leave the last beat(s) empty so occupancy can mark them silent.
    if (phrasing !== 'upbeat') continue
    const nextPitch = firstMelodyPitch(score.bars[i + 1]?.treble[0])
    const fromPitch = lastMelodyPitch(voice)
    if (!nextPitch || !fromPitch) continue
    const next = resolveChord(key, score.bars[i + 1].plan.chord)
    const scale = scaleFor(key, plan.palette, next)
    const pitches = pickupNotes(fromPitch, nextPitch, restFrom, meter.ticksPerBar, scale, voice[0]?.velocity ?? 64)
    voice.push(...pitches)
    voice.sort((a, b) => a.start - b.start)
    for (let k = 1; k < voice.length; k++) {
      const previous = voice[k - 1]
      if (previous.start + previous.dur > voice[k].start) previous.dur = voice[k].start - previous.start
    }
    for (let k = voice.length - 1; k >= 0; k--) if (voice[k].dur <= 0) voice.splice(k, 1)
  }
}
