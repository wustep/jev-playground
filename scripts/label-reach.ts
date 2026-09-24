#!/usr/bin/env npx tsx
/**
 * Does a plan label reach the notes?
 *
 * The post-50 sweep of the previous renderer found that all twelve
 * `character` values produced ONE melody outcome per style, that
 * `arrangement` changed no melody outcome, and that every texture's melody
 * window centred on MIDI 74–76 whatever the plan said. That is the finding
 * this rewrite exists to answer, so it is worth being able to re-run.
 *
 * Holds a plan fixed, varies one field across all its values, and reports how
 * many distinct sounding outcomes come out the other side.
 *
 *   npx --yes tsx scripts/label-reach.ts
 */
import { ACCOMPANIMENT_IDS, FORM_IDS, MOTION_IDS, REGISTER_IDS, STYLE_IDS, type CompositionPlan, type StyleId } from '../src/plan/schema'
import { HeuristicPlanner } from '../src/planner/HeuristicPlanner'
import { accompanimentOfBar, ceilingBreaches, melodyOfBar } from '../src/compare/compareMetrics'
import { renderPlan } from '../src/render/renderPlan'
import { midiOf } from '../src/render/pitch'

const printOf = (notes: { start: number; dur: number; pitches: string[] }[]) => notes.map((note) => `${note.start}:${note.dur}:${note.pitches.join()}`).join('|')

/** Melody and accompaniment fingerprinted separately — they are separate claims. */
function fingerprint(plan: CompositionPlan) {
  const score = renderPlan(plan, 1)
  const melody = score.bars.flatMap((bar) => melodyOfBar(bar).flat())
  const midis = melody.flatMap((note) => note.pitches.map(midiOf))
  return {
    melody: printOf(melody),
    accompaniment: printOf(score.bars.flatMap((bar) => accompanimentOfBar(bar).flat())),
    register: midis.length ? midis.reduce((a, b) => a + b, 0) / midis.length : 0,
    onsets: melody.length / score.bars.length,
    breaches: ceilingBreaches(score),
  }
}

const FIELDS = { register: REGISTER_IDS, motion: MOTION_IDS, accompaniment: ACCOMPANIMENT_IDS, form: FORM_IDS } as const

async function main() {
  const planner = new HeuristicPlanner()
  // `accompaniment` is expected to score 1 distinct MELODY and 5 distinct
  // accompaniments: changing what holds the tune up must not change the tune.
  console.log('field          style          melodies  accomp.   register span   onsets span   breaches')
  for (const [field, values] of Object.entries(FIELDS)) {
    for (const style of STYLE_IDS as readonly StyleId[]) {
      const { plan } = await planner.plan({ style, bars: 16, pick: 'argmax', seed: 1, brief: true })
      const results = values.map((value) => fingerprint({ ...plan, [field]: value }))
      const count = (key: 'melody' | 'accompaniment') => `${new Set(results.map((r) => r[key])).size}/${values.length}`
      const span = (xs: number[]) => `${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)}`
      console.log(
        `${field.padEnd(14)} ${style.padEnd(13)} ${count('melody').padStart(7)} ${count('accompaniment').padStart(8)}` +
          `   ${span(results.map((r) => r.register)).padStart(13)} ${span(results.map((r) => r.onsets)).padStart(13)} ${String(Math.max(...results.map((r) => r.breaches))).padStart(10)}`,
      )
    }
    console.log()
  }
}

void main()
