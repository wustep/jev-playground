// Intro and ending bars. The planner picks a closed `opening`; the renderer
// prepends extra Score.bars that are not plan.bars, so the UI's 4/8/16/32/64
// contract stays intact. A 16-bar plan may therefore engrave 17 or 18 bars.
//
//   straight_in  no extra bars
//   vamp_intro   1 bar (4/8) or 2 bars (16/32/64) of the first chord's
//                accompaniment, tune silent
//   pickup       1 extra bar: rest, then a short anacrusis into bar 1
//
// The last body bar always gets cadence air (a rest on the last beat, a
// rolled final sonority) and a ritardando on playback.

import type { OpeningId, StyleId, CharacterId, CompositionPlan } from '../plan/schema'
import { pickupNotes } from './phrasing'
import { keyInfo, resolveChord, scaleFor } from './harmony'
import { clipVoiceTo } from './phrasing'
import type { Bar, Score, Voice } from './score'

export function defaultOpening(style: StyleId, character: CharacterId): OpeningId {
  if (character === 'flowing_perpetual') return 'straight_in'
  switch (style) {
    case 'bach':
      return 'straight_in'
    case 'beethoven':
      return 'straight_in'
    case 'chopin':
      return 'pickup'
    case 'debussy':
    case 'glass':
    case 'hans_zimmer':
    case 'laufey':
    case 'elijah_fox':
      return 'vamp_intro'
  }
}

export function openingOf(plan: CompositionPlan): OpeningId {
  return plan.opening ?? 'straight_in'
}

export function introBarCount(opening: OpeningId, planBars: number): number {
  if (opening === 'straight_in') return 0
  if (opening === 'pickup') return 1
  return planBars >= 16 ? 2 : 1
}

function cloneVoice(voice: Voice): Voice {
  return voice.map((n) => ({ ...n, pitches: [...n.pitches] }))
}

/** Accompaniment of a rendered bar: drop the sung line, keep the rest. */
export function accompanimentOf(bar: Bar): { treble: Voice[]; bass: Voice[] } {
  const bass = bar.bass.map(cloneVoice)
  if (bar.treble.length >= 2) return { treble: bar.treble.slice(1).map(cloneVoice), bass }
  return { treble: [], bass }
}

function firstMelodyPitch(bar: Bar): string | undefined {
  const voice = bar.treble[0]
  if (!voice?.length) return undefined
  return voice[0].pitches[voice[0].pitches.length - 1]
}

function firstBassPitch(bar: Bar): string | undefined {
  for (const voice of bar.bass) {
    if (voice[0]?.pitches[0]) return voice[0].pitches[0]
  }
  return undefined
}

function reindex(score: Score): void {
  score.bars.forEach((bar, i) => {
    bar.index = i
  })
}

function vampBars(score: Score, count: number): Bar[] {
  const source = score.bars[0]
  const accomp = accompanimentOf(source)
  // If the first bar had no separate accompaniment (a chorale, a solo line),
  // hold its last bass sonority — or a rolled right-hand chord — so the vamp
  // is still a bar of music.
  const bass = accomp.bass.length
    ? accomp.bass
    : source.bass.length
      ? source.bass.map(cloneVoice)
      : source.treble[0]?.length
        ? [[
            {
              start: 0,
              dur: score.meter.ticksPerBar,
              pitches: [...source.treble[0][0].pitches],
              velocity: Math.max(1, source.treble[0][0].velocity - 12),
              roll: true,
            },
          ]]
        : []
  const treble = accomp.treble
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    plan: { ...source.plan },
    chordSymbol: source.chordSymbol,
    ...(source.split ? { split: { ...source.split } } : {}),
    treble: treble.map(cloneVoice),
    bass: bass.map(cloneVoice),
    dynamic: source.dynamic,
  }))
}

function firstTunePitch(score: Score, fallback: Bar): string | undefined {
  // Prefer a bar that actually has a sung line (two treble voices). Opening
  // tacet / vamp-like first bars would otherwise aim the pickup at the
  // accompaniment and write it on the treble staff in the wrong octave.
  for (const bar of score.bars) {
    if (bar.treble.length >= 2 && bar.treble[0]?.length) return firstMelodyPitch(bar)
  }
  return firstMelodyPitch(fallback)
}

function pickupBar(score: Score): Bar {
  const source = score.bars[0]
  const meter = score.meter
  const target = firstTunePitch(score, source)
  const from = firstBassPitch(source) ?? target
  const pickupTicks = Math.min(4, meter.beatTicks)
  const restFrom = meter.ticksPerBar - pickupTicks
  const key = keyInfo(score.plan.key)
  const chord = resolveChord(key, source.plan.chord)
  const scale = scaleFor(key, score.plan.palette, chord)
  const treble: Voice[] = []
  if (target && from) {
    const notes = pickupNotes(from, target, restFrom, meter.ticksPerBar, scale, source.treble[0]?.[0]?.velocity ?? 64)
    if (notes.length) treble.push(notes)
  }
  const bassPitch = firstBassPitch(source)
  const bass: Voice[] = bassPitch
    ? [[{ start: 0, dur: meter.beatTicks, pitches: [bassPitch], velocity: Math.max(1, (source.bass[0]?.[0]?.velocity ?? 56) - 6) }]]
    : []
  return {
    index: 0,
    plan: { ...source.plan },
    chordSymbol: source.chordSymbol,
    treble,
    bass,
    dynamic: source.dynamic,
  }
}

/** Prepend vamp or pickup bars. Call after the body (and its post-passes) is on the page. */
export function applyOpening(score: Score): void {
  const opening = openingOf(score.plan)
  const count = introBarCount(opening, score.plan.bars.length)
  if (count === 0 || score.bars.length === 0) {
    score.introBars = 0
    return
  }
  const extra = opening === 'pickup' ? [pickupBar(score)] : vampBars(score, count)
  score.bars = [...extra, ...score.bars]
  score.introBars = extra.length
  reindex(score)
}

/** Cadence air and a rolled last sonority on the final bar. */
export function applyEnding(score: Score): void {
  const last = score.bars[score.bars.length - 1]
  if (!last) return
  const restFrom = score.meter.ticksPerBar - score.meter.beatTicks
  if (last.treble[0]?.length && restFrom > 0) clipVoiceTo(last.treble[0], restFrom)
  for (const voice of [...last.treble, ...last.bass]) {
    const n = voice[voice.length - 1]
    if (n && n.dur >= score.meter.beatTicks / 2) n.roll = true
  }
  score.ritardando = true
}
