#!/usr/bin/env npx tsx
/**
 * One piece, bar by bar, as the app renders it on the Heuristic stub with
 * "sampling" and a fixed seed — for reading an ear-check seed without a
 * browser.
 *
 *   npx --yes tsx scripts/dump-piece.ts --style laufey --seed 6
 *   npx --yes tsx scripts/dump-piece.ts --style chopin --seed 7 --bars 8 --bass
 *
 * Each bar: number, role, the bar it returns from (<n), contour, chord(s),
 * then the tune as start:length:pitch in sixteenths (~ = held over the
 * barline). With --bass, each accompaniment voice on the lines below.
 */
import { parseStyle, type BarCount } from '../src/plan/schema'
import { HeuristicPlanner } from '../src/planner/HeuristicPlanner'
import { renderPlan } from '../src/render/renderPlan'
import { barPositions } from '../src/plan/phrase'
import type { Voice } from '../src/render/score'

const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(name)
  return at >= 0 ? process.argv[at + 1] : fallback
}
const style = parseStyle(arg('--style', 'laufey'), '--style')
const seed = Number(arg('--seed', '1'))
const bars = Number(arg('--bars', '16')) as BarCount
const showBass = process.argv.includes('--bass')

const line = (voice: Voice) => voice.map((n) => `${n.tied ? '~' : ''}${n.start}:${n.dur}:${n.pitches.join('+')}`).join(' ')

async function main() {
  const { plan, trace } = await new HeuristicPlanner().plan({ style, bars, pick: 'sample', seed, brief: true })
  const variant = trace.decisions.find((d) => d.field === 'variant')?.choice
  const score = renderPlan(plan, seed)
  const { bars: _bars, version: _version, ...globals } = plan
  console.log(`${style} · seed ${seed} · ${variant ?? '—'}`, JSON.stringify(globals))
  const positions = barPositions(plan.form, bars)
  for (const bar of score.bars) {
    const position = positions[bar.index]
    const chords = bar.chordSymbol + (bar.split ? `|${bar.split.chordSymbol}` : '')
    const head = `${String(bar.index + 1).padStart(2)} ${position.role.padEnd(12)} ${position.returnsFrom !== undefined ? `<${position.returnsFrom + 1}`.padEnd(3) : '   '} ${bar.plan.contour.padEnd(9)} ${chords.padEnd(18)}`
    console.log(`${head} ${line(bar.treble[0] ?? [])}`)
    if (showBass) for (const voice of bar.bass) console.log(`${' '.repeat(head.length)} ${line(voice)}`)
  }
}

void main()
