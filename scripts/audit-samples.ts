#!/usr/bin/env npx tsx
/**
 * Sample audit: many seeds × every dial style, averaged, printed beside every
 * reference MIDI for that style.
 *
 *   npx --yes tsx scripts/audit-samples.ts            # 12 seeds, 16 bars
 *   npx --yes tsx scripts/audit-samples.ts --seeds 24 --bars 32
 *
 * References come from docs/ref-midi/public/ (public domain, committed) and,
 * when present, docs/ref-midi/local/ (owned or copyrighted, gitignored — see
 * that directory's README). A missing local file is skipped, not an error, so
 * a fresh clone runs the same script.
 *
 * Columns (all melody = the top voice; for generated pieces, `treble[0]`):
 *   reg     mean melody MIDI             gap    melody minus accompaniment register
 *   on/bar  melody attacks a bar         sil%   beats with no melody sounding
 *   down%   downbeats attacked           ret4   pitch-class match, bars 0-3 vs 4-7
 *   brch    bars where accompaniment reaches the tune (must be 0)
 *   rep     longest run of the same melody pitch attacked again and again
 *   ct%     melody attacks on a chord tone
 */
import { existsSync, readdirSync } from 'node:fs'
import { STYLE_IDS, type BarCount, type StyleId } from '../src/plan/schema'
import { HeuristicPlanner } from '../src/planner/HeuristicPlanner'
import { melodyOfBar, midiMetrics, scoreMetrics } from '../src/compare/compareMetrics'
import { renderPlan } from '../src/render/renderPlan'
import { midiOf } from '../src/render/pitch'
import type { Score } from '../src/render/score'

const arg = (name: string, fallback: number) => {
  const at = process.argv.indexOf(name)
  return at >= 0 ? Number(process.argv[at + 1]) || fallback : fallback
}
const SEEDS = arg('--seeds', 12)
const BARS = arg('--bars', 16) as BarCount

/** Filename prefix → dial style. */
const PREFIX: Record<string, StyleId> = { bach: 'bach', beethoven: 'beethoven', chopin: 'chopin', debussy: 'debussy', zimmer: 'hans_zimmer', glass: 'glass', laufey: 'laufey', fox: 'elijah_fox' }

function refsFor(style: StyleId): { path: string; local: boolean }[] {
  const out: { path: string; local: boolean }[] = []
  for (const [dir, local] of [['docs/ref-midi/public', false], ['docs/ref-midi/local', true]] as const) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.mid')) continue
      if (PREFIX[file.split('-')[0]] === style) out.push({ path: `${dir}/${file}`, local })
    }
  }
  return out
}

/** Longest run of one melody pitch struck repeatedly — the "stuck" detector. */
function longestRepeat(score: Score): number {
  const line = score.bars.flatMap((bar) => melodyOfBar(bar).flat().map((note) => midiOf(note.pitches[note.pitches.length - 1])))
  let best = 1
  let run = 1
  for (let i = 1; i < line.length; i++) {
    run = line[i] === line[i - 1] ? run + 1 : 1
    best = Math.max(best, run)
  }
  return line.length ? best : 0
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const fmt = (x: number | null | undefined, digits = 1) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(digits))

function row(label: string, cells: (string | number)[]) {
  const widths = [6, 7, 6, 6, 6, 6, 5, 5, 5]
  return label.padEnd(34) + cells.map((cell, i) => String(cell).padStart(widths[i] ?? 6)).join('')
}

async function main() {
  const planner = new HeuristicPlanner()
  console.log(`${SEEDS} seeds × ${BARS} bars, pick=sample\n`)
  console.log(row('', ['reg', 'on/bar', 'gap', 'sil%', 'down%', 'ret4', 'brch', 'rep', 'ct%']))
  for (const style of STYLE_IDS) {
    const metrics = []
    const picks: Record<string, Record<string, number>> = { register: {}, motion: {}, accompaniment: {} }
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { plan } = await planner.plan({ style, bars: BARS, pick: 'sample', seed, brief: true })
      for (const field of ['register', 'motion', 'accompaniment'] as const) picks[field][plan[field]] = (picks[field][plan[field]] ?? 0) + 1
      const score = renderPlan(plan, seed)
      metrics.push({ ...scoreMetrics(score), repeat: longestRepeat(score) })
    }
    console.log(
      row(`${style} · generated`, [
        fmt(mean(metrics.map((m) => m.registerMean))),
        fmt(mean(metrics.map((m) => m.onsetDensityMean)), 2),
        fmt(mean(metrics.map((m) => m.registerMean - m.accompaniment.registerMean))),
        fmt(100 * mean(metrics.map((m) => m.silentBeatPct)), 0),
        fmt(100 * mean(metrics.map((m) => m.downbeats.attacked / Math.max(1, m.downbeats.n))), 0),
        fmt(mean(metrics.map((m) => m.ret4 ?? 0)), 2),
        Math.max(...metrics.map((m) => m.ceilingBreaches)),
        Math.max(...metrics.map((m) => m.repeat)),
        fmt(100 * mean(metrics.map((m) => m.chordToneRate)), 0),
      ]),
    )
    for (const ref of refsFor(style)) {
      const m = midiMetrics(ref.path)
      if ('error' in m) continue
      const name = `  ${ref.local ? '(local) ' : ''}${ref.path.split('/').pop()!.replace('.mid', '')}`
      console.log(
        row(name.slice(0, 33), [
          fmt(m.registerMean),
          fmt(m.onsetDensityMean, 2),
          fmt(m.accompaniment.registerMean ? m.registerMean - m.accompaniment.registerMean : null),
          fmt(100 * m.silentBeatPct, 0),
          fmt(100 * (m.downbeats.attacked / Math.max(1, m.downbeats.n)), 0),
          fmt(m.ret4, 2),
          '',
          '',
          '',
        ]),
      )
    }
    const show = (field: string) => Object.entries(picks[field]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')
    console.log(`  drew: register ${show('register')} · motion ${show('motion')} · accomp ${show('accompaniment')}\n`)
  }
}

void main()
