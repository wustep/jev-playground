#!/usr/bin/env npx tsx
/**
 * Quality audit: the phrase-level and dialect defects the ear catches and the
 * register/density audit (`audit-samples.ts`) does not. Same sampling as that
 * audit — heuristic stub, `pick: sample`, seeds 1..N, 16 bars — so the two
 * tables read side by side.
 *
 *   npx --yes tsx scripts/quality-audit.ts            # 24 seeds
 *   npx --yes tsx scripts/quality-audit.ts --seeds 48
 *
 * Columns:
 *   seq=   sequence bars that sing their model's pitches unchanged, of sequence bars
 *   dead   runs of three bars in a row with the same tune, per 100 bars
 *   stut   notes a moved bar (return, sequence) strikes twice where its source moved, per 100 moved notes
 *   off%   notes on a stressed slot that are not a tone of the chord under them
 *   xrel   notes a letter away from a chord tone they contradict (C over C♯), per 1000 notes
 *   walk   moves by step in walking tunes, in two-beat bars (2/4, 6/8) · in the rest
 *   7th%   broken-figure bars over a seventh chord that never sound the seventh
 *   lilt%  compound two-note beats played long–short rather than even
 *   osti%  pulse bars whose repeated-chord subdivision differs from the bar before
 */
import { STYLE_IDS, type BarCount, type CompositionPlan } from '../src/plan/schema'
import { HeuristicPlanner } from '../src/planner/HeuristicPlanner'
import { barPositions } from '../src/plan/phrase'
import { renderPlan } from '../src/render/renderPlan'
import { keyInfo, resolveChord, scaleFor, type ResolvedChord } from '../src/render/harmony'
import { stressed } from '../src/render/melody'
import { midiOf } from '../src/render/pitch'
import type { Note, Score } from '../src/render/score'

const arg = (name: string, fallback: number) => {
  const at = process.argv.indexOf(name)
  return at >= 0 ? Number(process.argv[at + 1]) || fallback : fallback
}
const SEEDS = arg('--seeds', 24)
const BARS = 16 as BarCount

const chroma = (pitch: string) => midiOf(pitch) % 12
const letterOf = (pitch: string) => pitch[0]

interface Tally {
  seqBars: number
  seqSame: number
  bars: number
  dead: number
  movedNotes: number
  stutter: number
  stressedNotes: number
  offChord: number
  notes: number
  crossRelations: number
  walkShort: [number, number]
  walkLong: [number, number]
  brokenSevenths: number
  brokenMissing: number
  compoundPairs: number
  compoundUneven: number
  pulsePairs: number
  pulseSwitches: number
}

const empty = (): Tally => ({
  seqBars: 0,
  seqSame: 0,
  bars: 0,
  dead: 0,
  movedNotes: 0,
  stutter: 0,
  stressedNotes: 0,
  offChord: 0,
  notes: 0,
  crossRelations: 0,
  walkShort: [0, 0],
  walkLong: [0, 0],
  brokenSevenths: 0,
  brokenMissing: 0,
  compoundPairs: 0,
  compoundUneven: 0,
  pulsePairs: 0,
  pulseSwitches: 0,
})

const tune = (score: Score, i: number): Note[] => score.bars[i]?.treble[0] ?? []
const printOf = (notes: Note[]) => notes.map((n) => `${n.start}:${n.dur}:${n.pitches.join()}`).join('|')
const pitchesOf = (notes: Note[]) => notes.map((n) => n.pitches[0])

function audit(plan: CompositionPlan, score: Score, t: Tally) {
  const key = keyInfo(plan.key)
  const positions = barPositions(plan.form, BARS)
  const meter = score.meter
  const twoBeat = Math.round(meter.ticksPerBar / meter.beatTicks) === 2
  let pulseStep: number | undefined
  score.bars.forEach((bar, i) => {
    const position = positions[i]
    const notes = tune(score, i)
    const chord = resolveChord(key, bar.plan.chord)
    const chord2 = bar.plan.chord2 ? resolveChord(key, bar.plan.chord2) : undefined
    const chordAt = (tick: number): ResolvedChord => (chord2 && tick >= meter.splitTick ? chord2 : chord)
    const scaleAt = (tick: number) => scaleFor(key, plan.palette, chordAt(tick))
    t.bars++

    if (i >= 2 && notes.length && printOf(notes) === printOf(tune(score, i - 1)) && printOf(notes) === printOf(tune(score, i - 2))) t.dead++

    // A sequence (the stub gives it its model's contour) that sings its model unchanged.
    if (position.role === 'sequence' && i > 0 && bar.plan.contour === score.bars[i - 1].plan.contour && notes.length) {
      t.seqBars++
      if (pitchesOf(notes).join() === pitchesOf(tune(score, i - 1)).join()) t.seqSame++
    }

    // Moved bars: the same slots as their source, so note k answers note k.
    const source = position.returnsFrom ?? (position.role === 'sequence' && bar.plan.contour === score.bars[i - 1]?.plan.contour ? i - 1 : undefined)
    if (source !== undefined) {
      const from = tune(score, source)
      if (from.length === notes.length && from.every((n, k) => n.start === notes[k].start || k === 0)) {
        for (let k = 1; k < notes.length; k++) {
          t.movedNotes++
          if (notes[k].tied) continue
          const here = midiOf(notes[k].pitches[0]) === midiOf(notes[k - 1].pitches[0])
          const there = midiOf(from[k].pitches[0]) === midiOf(from[k - 1].pitches[0])
          if (here && !there) t.stutter++
        }
      }
    }

    for (const n of notes) {
      if (n.tied) continue
      const pitch = n.pitches[0]
      const under = chordAt(n.start)
      t.notes++
      const chordChromas = new Set(under.pcs.map((pc) => midiOf(`${pc}4`) % 12))
      if (stressed({ meter, chord2 }, { start: n.start, dur: n.dur })) {
        t.stressedNotes++
        if (!chordChromas.has(chroma(pitch))) t.offChord++
      }
      const scale = new Set(scaleAt(n.start).map((pc) => midiOf(`${pc}4`) % 12))
      if (!chordChromas.has(chroma(pitch)) && !scale.has(chroma(pitch)) && under.pcs.some((pc) => pc[0] === letterOf(pitch))) t.crossRelations++
    }

    if (plan.motion === 'walking') {
      const line = notes.filter((n) => !n.tied).map((n) => midiOf(n.pitches[0]))
      const bucket = twoBeat ? t.walkShort : t.walkLong
      for (let k = 1; k < line.length; k++) {
        const move = Math.abs(line[k] - line[k - 1])
        if (!move) continue
        bucket[1]++
        if (move <= 2) bucket[0]++
      }
    }

    if (plan.accompaniment === 'broken' && !chord2 && chord.core.length === 4) {
      const figure = bar.bass[bar.bass.length - 1] ?? []
      const seventh = midiOf(`${chord.core[3]}4`) % 12
      t.brokenSevenths++
      if (!figure.some((n) => n.pitches.some((p) => chroma(p) === seventh))) t.brokenMissing++
    }

    if (meter.beatTicks === 6) {
      for (let beat = 0; beat < meter.ticksPerBar; beat += 6) {
        const inBeat = notes.filter((n) => !n.tied && n.start >= beat && n.start < beat + 6)
        if (inBeat.length !== 2 || inBeat[0].start !== beat) continue
        t.compoundPairs++
        if (inBeat[1].start - beat !== 3) t.compoundUneven++
      }
    }

    if (plan.accompaniment === 'pulse' && bar.bass.length >= 2 && !chord2) {
      const chords = bar.bass[bar.bass.length - 1]
      const step = chords.length >= 2 ? chords[1].start - chords[0].start : undefined
      if (step !== undefined && pulseStep !== undefined && i < score.bars.length - 1) {
        t.pulsePairs++
        if (step !== pulseStep) t.pulseSwitches++
      }
      pulseStep = step ?? pulseStep
    }
  })
}

const pct = (a: number, b: number, scale = 100, digits = 0) => (b ? ((scale * a) / b).toFixed(digits) : '—')

async function main() {
  const planner = new HeuristicPlanner()
  console.log(`${SEEDS} seeds × ${BARS} bars, pick=sample\n`)
  const header = ['seq=', 'dead', 'stut', 'off%', 'xrel', 'walk 2b·4b', '7th%', 'lilt%', 'osti%']
  const widths = [6, 6, 6, 6, 6, 12, 6, 7, 7]
  console.log(''.padEnd(13) + header.map((h, i) => h.padStart(widths[i])).join(''))
  for (const style of STYLE_IDS) {
    const t = empty()
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { plan } = await planner.plan({ style, bars: BARS, pick: 'sample', seed, brief: true })
      audit(plan, renderPlan(plan, seed), t)
    }
    const cells = [
      pct(t.seqSame, t.seqBars),
      pct(t.dead, t.bars, 100, 1),
      pct(t.stutter, t.movedNotes, 100, 1),
      pct(t.offChord, t.stressedNotes),
      pct(t.crossRelations, t.notes, 1000, 1),
      `${pct(t.walkShort[0], t.walkShort[1])}·${pct(t.walkLong[0], t.walkLong[1])}`,
      pct(t.brokenMissing, t.brokenSevenths),
      pct(t.compoundUneven, t.compoundPairs),
      pct(t.pulseSwitches, t.pulsePairs),
    ]
    console.log(style.padEnd(13) + cells.map((c, i) => String(c).padStart(widths[i])).join(''))
  }
}

void main()
