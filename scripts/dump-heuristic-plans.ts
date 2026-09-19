#!/usr/bin/env npx tsx
/**
 * Local-friendly dump of HeuristicPlanner CompositionPlan JSON.
 *
 * Prints (or writes) closed-label plans only. Never writes MIDI.
 * Public-domain Mutopia encodings (older dials only) live in
 * docs/ref-midi/public/; living-artist sketches are JSON-only.
 *
 *   npx --yes tsx scripts/dump-heuristic-plans.ts
 *   npx --yes tsx scripts/dump-heuristic-plans.ts --styles bach,chopin --bars 16 --seeds 1,7,19 --pick sample
 *   npx --yes tsx scripts/dump-heuristic-plans.ts --guide-sketch --out /tmp/heuristic-plans.json
 *
 * Fake Notes:guide sketches are heuristic proposals (figure + goal), not live Jev.
 */
import { STYLE_IDS, type BarCount, type BarRoleId, type ContourId, type StyleId } from '../src/plan/schema'
import { MELODY_FIGURE_IDS, MELODY_GOAL_IDS, type MelodyFigureId, type MelodyGoalId } from '../src/plan/notes'
import { HeuristicPlanner } from '../src/planner/HeuristicPlanner'

const DEFAULT_SEEDS = [1, 7, 19]
const DEFAULT_BARS: BarCount = 16

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function flag(name: string): boolean {
  return process.argv.includes(name)
}

function parseStyles(raw: string | undefined): StyleId[] {
  if (!raw || raw === 'all') return [...STYLE_IDS]
  const wanted = raw.split(',').map((s) => s.trim()) as StyleId[]
  const unknown = wanted.filter((s) => !STYLE_IDS.includes(s))
  if (unknown.length) {
    throw new Error(`unknown style(s): ${unknown.join(', ')} (want ${STYLE_IDS.join(', ')})`)
  }
  return wanted
}

function parseSeeds(raw: string | undefined): number[] {
  if (!raw) return DEFAULT_SEEDS
  return raw.split(',').map((s) => {
    const n = Number(s)
    if (!Number.isFinite(n)) throw new Error(`bad seed: ${s}`)
    return n
  })
}

function parseBars(raw: string | undefined): BarCount {
  const n = raw ? Number(raw) : DEFAULT_BARS
  if (n !== 4 && n !== 8 && n !== 16 && n !== 32 && n !== 64) {
    throw new Error(`bars must be 4, 8, 16, 32 or 64 (got ${raw})`)
  }
  return n
}

/** Closed figure + goal a Notes:guide pass might pick for this bar. Not live Jev. */
export function sketchGuideBar(role: BarRoleId, contour: ContourId): { figure: MelodyFigureId; goal: MelodyGoalId } {
  const figure: MelodyFigureId =
    role === 'echo' || role === 'restatement' || role === 'sequence'
      ? 'motif_echo'
      : role === 'cadence' || role === 'dissolve' || role === 'half_cadence'
        ? 'hold_resolve'
        : contour === 'leap_fall' || contour === 'drop_rise'
          ? 'leap_recover'
          : contour === 'static'
            ? 'neighbour'
            : contour === 'fall'
              ? 'arpeggio_down'
              : contour === 'rise'
                ? 'arpeggio_up'
                : 'step_to_goal'
  const goal: MelodyGoalId =
    role === 'cadence' || role === 'half_cadence' ? 'root' : role === 'climax' || role === 'surprise' ? 'fifth' : 'third'
  return { figure, goal }
}

async function main() {
  const styles = parseStyles(arg('--styles'))
  const seeds = parseSeeds(arg('--seeds'))
  const bars = parseBars(arg('--bars'))
  const pick = arg('--pick') === 'argmax' ? 'argmax' : 'sample'
  const withGuide = flag('--guide-sketch')
  const out = arg('--out')

  const planner = new HeuristicPlanner()
  const samples = []
  for (const style of styles) {
    for (const seed of seeds) {
      const { plan } = await planner.plan({ style, bars, pick, seed, brief: true })
      samples.push({
        input: { style, bars, pick, seed, brief: true },
        plan,
        ...(withGuide
          ? {
              guideSketch: plan.bars.map((bar) => ({
                ...sketchGuideBar(bar.role, bar.contour),
                role: bar.role,
                contour: bar.contour,
              })),
            }
          : {}),
      })
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    planner: 'heuristic',
    note: 'Closed CompositionPlan labels only. No MIDI. Guide sketches are fake (not live Jev).',
    figureIds: MELODY_FIGURE_IDS,
    goalIds: MELODY_GOAL_IDS,
    samples,
  }
  const json = JSON.stringify(payload, null, 2)
  if (out && out !== '-') {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(out, json)
    console.error(`wrote ${samples.length} plans → ${out}`)
  } else {
    process.stdout.write(json + '\n')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
