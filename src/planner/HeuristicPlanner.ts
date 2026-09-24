// Offline stand-in for Jev. Same interface, same enum-only output, no network:
// it samples hand-written per-style knowledge (src/plan/styles.ts) instead of
// asking a model. It exists so the playground is demoable without an API key
// and so there is a baseline to compare Jev's choices against.
//
// The order of decisions mirrors JevPlanner's:
//   1. globals — register, motion, accompaniment first (they decide the most),
//                then form, key, meter, palette, tempo, dynamics
//   2. bars    — chords assembled from the style's harmony book by the form's
//                phrase slots; one contour per bar. Shadow requests are one
//                phrase Choice per slot, the same as Jev's.
//
// The stub privately picks one of the style's `variants` — a nocturne, a
// waltz, a ballade — and samples that variant's priors. The variant is not a
// plan field: it never reaches the renderer, and Jev is never asked for it.

import {
  CHORD_IDS,
  CONTOUR_IDS,
  GLOBAL_FIELDS,
  GLOBAL_FIELD_IDS,
  parseGlobals,
  type BarCount,
  type BarPlan,
  type ChordId,
  type CompositionPlan,
  type ContourId,
  type GlobalField,
  type MatchLevel,
  type StyleId,
  type StyleMatchScore,
} from '../plan/schema'
import { BARS_PER_PHRASE, barPositions, formSlots, type BarPosition, type BarRole, type PhraseSlot } from '../plan/phrase'
import { approachesInto, bookFor, splitBarOf } from '../plan/harmonyPhrases'
import { rootDegree } from '../render/harmony'
import { STYLE_PROFILES, styleVocabulary, type HarmonyBook, type StylePriors, type StyleProfile, type Variant, type Weights } from '../plan/styles'
import type { Decision, Exchange, PlanInput, PlanOptions, PlanResult, Planner, ScoreResult } from './Planner'
import { decision, normalize, pickFrom, rng } from './pick'
import { buildRequest, type JevOp } from './jev/requests'
import { DEFAULT_MODEL } from './jev/systemOne'
import { heuristicSongQuality } from './songScore'

/** The request Jev would have received for this op — never actually sent. */
const unsent = (label: string, op: JevOp): Exchange => ({ label, op, request: buildRequest(op, DEFAULT_MODEL), sent: false })

/** Replay a finished plan as the sequence of ops JevPlanner would have issued. */
export function shadowExchanges(plan: CompositionPlan, brief: boolean): Exchange[] {
  const { version: _version, style, bars, ...globals } = plan
  const barCount = bars.length as BarCount
  return [
    unsent('globals', { op: 'globals', style, brief }),
    ...formSlots(plan.form, barCount).map((_, slotIndex) => {
      const before = bars.slice(0, slotIndex * BARS_PER_PHRASE)
      return unsent(`phrase ${slotIndex + 1}`, {
        op: 'phrase',
        style,
        brief,
        globals,
        barCount,
        slotIndex,
        chords: before.map((bar) => bar.chord),
        contours: before.map((bar) => bar.contour),
      })
    }),
  ]
}

/** Weight shown in the trace for options a prior doesn't mention. They are never sampled. */
const FLOOR = 1

function withFloor<K extends string>(options: readonly K[], weights: Weights<K>): Record<K, number> {
  const filled = Object.fromEntries(options.map((k) => [k, weights[k] ?? FLOOR])) as Record<K, number>
  return normalize(filled)
}

/** Options a prior actually names: the only ones the stub will pick. */
const authored = <K extends string>(weights: Weights<K>) => (Object.keys(weights) as K[]).filter((k) => (weights[k] ?? 0) > 0)

const CONTOUR_BY_ROLE: Partial<Record<BarRole, Weights<ContourId>>> = {
  statement: { leap_fall: 1.3, arch: 1.2 },
  climax: { rise: 2.5, arch: 1.5, leap_fall: 1.6, fall: 0.4, dip: 0.4 },
  cadence: { fall: 3, leap_fall: 1.2, rise: 0.3, wave: 0.5 },
  half_cadence: { rise: 1.5, dip: 1.3, fall: 0.7 },
  contrast: { dip: 1.6, fall: 1.3 },
  sequence: { rise: 1.4, wave: 1.4, arch: 1.2 },
  continuation: { wave: 1.3, arch: 1.2 },
}

/** The priors in force for one variant: the style's base, overridden field by field. */
export function effectivePriors(profile: StyleProfile, variant: Variant | undefined): StylePriors {
  return { ...profile.priors, ...(variant?.priors ?? {}) }
}

/** One of the style's kinds of piece, drawn by weight. Never leaves this file's process. */
function pickVariant(profile: StyleProfile, sample: boolean, random: () => number): Variant | undefined {
  if (!profile.variants.length) return undefined
  if (!sample) return profile.variants.reduce((best, v) => (v.weight > best.weight ? v : best))
  const total = profile.variants.reduce((sum, v) => sum + v.weight, 0)
  let at = random() * total
  for (const variant of profile.variants) if ((at -= variant.weight) <= 0) return variant
  return profile.variants[profile.variants.length - 1]
}

// ── harmony from the form's phrase slots ────────────────────────────────────

interface Harmony {
  chords: ChordId[]
  /** A second harmony for the second half of a bar — a cadence's approach and arrival sharing one bar. */
  seconds: (ChordId | undefined)[]
  /** What else was on the table for each bar, for the trace. */
  candidates: ChordId[][]
}

/** Bars whose harmony must not be held over from the bar before: they are the phrase's punctuation. */
const PUNCTUATION: ReadonlySet<BarRole> = new Set<BarRole>(['half_cadence', 'cadence'])

/**
 * Which idea a phrase is a statement of. A phrase that returns shares its
 * source's harmonic head, which is what makes the return sound like one.
 */
const ideaOf = (slots: readonly PhraseSlot[], index: number): number => {
  let at = index
  const seen = new Set<number>()
  while (slots[at]?.returnsFrom !== undefined && !seen.has(at)) {
    seen.add(at)
    at = slots[at].returnsFrom!
  }
  return at
}

function assembleHarmony(book: HarmonyBook, slots: readonly PhraseSlot[], positions: readonly BarPosition[], holds: boolean, sample: boolean, random: () => number): Harmony {
  const chords: ChordId[] = []
  const candidates: ChordId[][] = []
  const heads = new Map<number, readonly ChordId[]>()
  // Long harmonic rhythm, where the style has it. Decided once per piece so a
  // piece is consistent with itself: its opening idea sits on one chord for
  // two bars, and its chord cycle moves at half speed — each chord two bars,
  // the drone and the held block rather than a chord a bar.
  const holdHeads = holds && (sample ? random() < 0.55 : true)
  const stretch = holds && (sample ? random() < 0.5 : true) ? 2 : 1
  // Loop-built pieces don't sit on one cycle: a second cycle takes over for
  // the middle of the piece (a harmonic shift every eight bars or so) and the
  // first returns to close. Short pieces keep the one.
  const cycles = book.loops.length ? book.loops : book.heads
  const loopA = pickUnit(cycles, undefined)
  const others = cycles.filter((cycle) => cycle !== loopA.unit)
  const loopB = others.length && slots.length >= 4 ? { unit: sample ? others[Math.floor(random() * others.length)] : others[0], pool: others } : loopA
  let loopAt = 0

  /**
   * One unit from `units`. Without holds, prefer units that don't just repeat
   * the chord we are coming from; with a holding piece, a phrase may open on
   * the chord the last one closed on (the cadence chord carried over).
   */
  function pickUnit<U extends readonly ChordId[]>(units: readonly U[], after: ChordId | undefined): { unit: U; pool: readonly U[] } {
    const staying = holdHeads && after !== undefined && (sample ? random() < 0.5 : true) ? units.filter((unit) => unit[0] === after) : []
    const moving = holds || after === undefined ? units : units.filter((unit) => unit[0] !== after)
    const pool = staying.length ? staying : moving.length ? moving : units
    return { unit: sample ? pool[Math.floor(random() * pool.length)] : pool[0], pool }
  }
  const push = (unit: readonly ChordId[], pool: readonly (readonly ChordId[])[]) => {
    unit.forEach((chord, k) => {
      chords.push(chord)
      candidates.push([...new Set(pool.map((other) => other[k] ?? chord))])
    })
  }
  const last = () => chords[chords.length - 1]
  const vary = (unit: readonly ChordId[]): ChordId[] =>
    unit.map((chord) => {
      const alternatives = book.subs[chord]
      return sample && alternatives?.length && random() < 0.45 ? alternatives[Math.floor(random() * alternatives.length)] : chord
    })
  const headFor = (slot: PhraseSlot, at: number) => {
    const known = heads.get(ideaOf(slots, at))
    if (known) return { unit: slot.varied ? vary(known) : known, pool: [known] }
    const picked = pickUnit(book.heads, last())
    // A held head: the opening chord for both bars, unless the second bar is the phrase's punctuation.
    const held = holdHeads && !PUNCTUATION.has(positions[at * 4 + 1]?.role ?? 'continuation') && picked.unit[0] !== picked.unit[1]
    const unit: readonly ChordId[] = held ? [picked.unit[0], picked.unit[0]] : picked.unit
    heads.set(ideaOf(slots, at), unit)
    return { unit, pool: held ? [unit, ...picked.pool] : picked.pool }
  }
  const tailFor = (slot: PhraseSlot) => pickUnit(book.tails[slot.end].length ? book.tails[slot.end] : book.tails.open, last())

  for (const [at, slot] of slots.entries()) {
    switch (slot.build) {
      case 'head_tail': {
        const whole = book.phrases[slot.end]
        // First appearance of an idea may be a whole phrase lifted from the repertoire.
        if (!heads.has(ideaOf(slots, at)) && whole.length && (!sample || random() < 0.5)) {
          const picked = pickUnit(whole, last())
          // A holding piece lets the phrase's opening chord sit through its second bar as well.
          const held = holdHeads && !PUNCTUATION.has(positions[at * 4 + 1]?.role ?? 'continuation') && picked.unit[0] !== picked.unit[1]
          const phrase: readonly ChordId[] = held ? [picked.unit[0], picked.unit[0], picked.unit[2], picked.unit[3]] : picked.unit
          heads.set(ideaOf(slots, at), phrase.slice(0, 2))
          push(phrase, held ? [phrase, ...picked.pool] : picked.pool)
          break
        }
        const head = headFor(slot, at)
        push(head.unit, head.pool)
        const tail = tailFor(slot)
        push(tail.unit, tail.pool)
        break
      }
      case 'head_seq': {
        const head = headFor(slot, at)
        push(head.unit, head.pool)
        const seq = pickUnit(book.seqs, last())
        push(seq.unit, seq.pool)
        break
      }
      case 'seq_tail': {
        const seq = pickUnit(book.seqs, last())
        push(seq.unit, seq.pool)
        const tail = tailFor(slot)
        push(tail.unit, tail.pool)
        break
      }
      case 'seq_seq': {
        for (let k = 0; k < 2; k++) {
          const seq = pickUnit(book.seqs, last())
          push(seq.unit, seq.pool)
        }
        break
      }
      case 'duplicate': {
        const head = headFor(slot, at)
        push(head.unit, head.pool)
        push(vary(heads.get(ideaOf(slots, at)) ?? head.unit), [head.unit])
        break
      }
      case 'loop': {
        const middle = at >= Math.floor(slots.length / 2) && at < slots.length - 1
        const loop = middle ? loopB : loopA
        if (at === Math.floor(slots.length / 2) || at === slots.length - 1) loopAt = 0 // a new section starts its cycle from the top
        // At half speed (`stretch` 2) the slot takes two chords of the cycle and holds each for two bars.
        const steps = 4 / stretch
        const cycleBars = Array.from({ length: steps }, (_, j) => loop.unit[(loopAt + j) % loop.unit.length])
        // Each later pass may take a different inversion: the same cycle over a new bass.
        const varied = slot.varied ? vary(cycleBars) : cycleBars
        const bars = Array.from({ length: 4 }, (_, k) => varied[Math.floor(k / stretch)])
        push(bars, loop.pool.map((cycle) => bars.map((_, k) => cycle[(loopAt + Math.floor(k / stretch)) % cycle.length])))
        loopAt += steps
        break
      }
      case 'pedal': {
        if (book.pedals.length) {
          const picked = pickUnit(book.pedals, undefined)
          push(picked.unit, picked.pool)
        } else {
          for (let k = 0; k < 2; k++) {
            const tail = pickUnit(book.tails.half, undefined)
            push(tail.unit, tail.pool)
          }
        }
        break
      }
      case 'coda': {
        if (book.codas.length) {
          const picked = pickUnit(book.codas, last())
          push(picked.unit, picked.pool)
        } else {
          const head = headFor(slot, at)
          push(head.unit, head.pool)
          const tail = pickUnit(book.tails.closed, last())
          push(tail.unit, tail.pool)
        }
        break
      }
    }
  }

  // A departing phrase reaches outside the key on its second bar: the colour
  // that makes a middle section feel like somewhere else.
  slots.forEach((slot, s) => {
    const bar = s * 4 + 1
    if (slot.returnsFrom !== undefined || slot.build !== 'seq_seq' || bar >= chords.length - 1 || !book.surprises.length) return
    candidates[bar] = [...new Set([chords[bar], ...book.surprises])]
    if (sample ? random() < 0.6 : true) chords[bar] = sample ? book.surprises[Math.floor(random() * book.surprises.length)] : book.surprises[0]
  })
  // The piece ends on one of the style's finals (an added-sixth tonic, a Picardy third, a bare six-four).
  const end = chords.length - 1
  if (!book.finals.includes(chords[end]) || (sample && random() < 0.5)) {
    candidates[end] = [...new Set([chords[end], ...book.finals])]
    chords[end] = sample ? book.finals[Math.floor(random() * book.finals.length)] : book.finals[0]
  }

  // Two harmonies in a bar, where the phrase closes or pauses: the bar that
  // arrives on the dominant takes its approach in the first half (ii6/5–V7 | I,
  // I6/4–V), so cadences move at the pace of the repertoire, not the barline.
  const seconds: (ChordId | undefined)[] = chords.map(() => undefined)
  slots.forEach((slot, s) => {
    const at = splitBarOf(slot, s)
    if (at >= end) return
    const arrival = chords[at]
    const options = approachesInto(book, chords, at)
    if (!options.length || (sample && random() >= 0.7)) return
    const [approach] = sample ? options[Math.floor(random() * options.length)] : options[0]
    candidates[at] = [...new Set([approach, ...options.map(([first]) => first), arrival])]
    chords[at] = approach
    seconds[at] = arrival
  })
  return { chords, seconds, candidates }
}

/**
 * The four-chord pop loop by root — I–V–vi–IV in any rotation, and its
 * minor-key spelling i–bVI–bIII–bVII. None of these dial composers lives there,
 * and independently chosen two-bar units can still spell it by accident.
 */
const POP_LOOPS = new Set(['0 7 9 5', '7 9 5 0', '9 5 0 7', '5 0 7 9', '0 8 3 10', '8 3 10 0', '3 10 0 8', '10 0 8 3'])

export function hasPopLoop(chords: readonly ChordId[]): boolean {
  const roots = chords.map(rootDegree)
  for (let i = 0; i + 4 <= roots.length; i++) if (POP_LOOPS.has(roots.slice(i, i + 4).join(' '))) return true
  return false
}

const distributionOf = <K extends string>(options: readonly K[], chosen: readonly K[]): Record<K, number> => {
  const counts = Object.fromEntries(options.map((k) => [k, 0])) as Record<K, number>
  for (const k of chosen) counts[k] += 1
  return normalize(counts)
}

export class HeuristicPlanner implements Planner {
  readonly id = 'heuristic' as const
  readonly label = 'Heuristic stub (offline)'

  async plan(input: PlanInput, options?: PlanOptions): Promise<PlanResult> {
    const started = performance.now()
    const profile = STYLE_PROFILES[input.style]
    const random = rng(input.seed)
    const sample = input.pick === 'sample'
    const decisions: Decision[] = []
    const emit = (d: Decision) => {
      decisions.push(d)
      options?.onProgress?.([...decisions])
    }

    // 1 ─ which kind of piece. Private to the stub: `variant` is not a plan
    //     field, so it is recorded in the trace and goes no further.
    const variant = pickVariant(profile, sample, random)
    if (variant) {
      const weights = Object.fromEntries(profile.variants.map((v) => [v.name, v.weight]))
      emit(decision('variant', variant.name, normalize(weights)))
    }
    const priors = effectivePriors(profile, variant)

    // 2 ─ globals. Register, motion and accompaniment come first because they
    //     decide the most about what the piece will sound like.
    const picked = {} as Record<GlobalField, string>
    for (const field of GLOBAL_FIELD_IDS) {
      const weights = priors[field] as Weights<string>
      const probabilities = withFloor(Object.keys(GLOBAL_FIELDS[field]), weights)
      picked[field] = pickFrom(probabilities, input.pick, random, authored(weights))
      emit(decision(field, picked[field], probabilities))
    }
    // Drawn from each field's own table, so this only hands them back typed.
    const globals = parseGlobals(picked, 'stub')

    const barCount: BarCount = input.bars

    // 3 ─ bars: the form says how to assemble the harmony; one contour each
    const slots = formSlots(globals.form, barCount)
    const positions = barPositions(globals.form, barCount)
    const book = bookFor(input.style, globals.key)
    let harmony = assembleHarmony(book, slots, positions, profile.holds, sample, random)
    for (let attempt = 0; sample && attempt < 8 && hasPopLoop(harmony.chords); attempt++) {
      harmony = assembleHarmony(book, slots, positions, profile.holds, sample, random)
    }

    const bars: BarPlan[] = []
    for (let i = 0; i < barCount; i++) {
      const position = positions[i]
      const chord = harmony.chords[i]
      const previous = bars[i - 1]
      let contour: ContourId
      let contourProbabilities: Record<ContourId, number>
      if (position.returnsFrom !== undefined && bars[position.returnsFrom]) {
        // A returning bar IS the earlier bar's tune: the same shape.
        contour = bars[position.returnsFrom].contour
        contourProbabilities = distributionOf(CONTOUR_IDS, [contour])
      } else if (previous && position.role === 'sequence') {
        // A sequence IS the previous figure on a new harmony: the same shape.
        contour = previous.contour
        contourProbabilities = distributionOf(CONTOUR_IDS, [contour])
      } else {
        const weights = withFloor(CONTOUR_IDS, priors.contour)
        const bias = CONTOUR_BY_ROLE[position.role] ?? {}
        for (const id of CONTOUR_IDS) weights[id] *= bias[id] ?? 1
        // Three bars of the same shape in a row is a machine talking.
        if (previous && bars[i - 2]?.contour === previous.contour) weights[previous.contour] *= 0.2
        contourProbabilities = normalize(weights)
        contour = pickFrom(contourProbabilities, input.pick, random)
      }
      const chord2 = harmony.seconds[i]
      bars.push(chord2 ? { chord, chord2, contour } : { chord, contour })
      emit(decision(`bars[${i}].chord`, chord, distributionOf(CHORD_IDS, harmony.candidates[i])))
      if (chord2) emit(decision(`bars[${i}].chord2`, chord2, distributionOf(CHORD_IDS, [chord2]), 1))
      emit(decision(`bars[${i}].contour`, contour, contourProbabilities))
    }

    const plan: CompositionPlan = { version: 2, style: input.style, ...globals, bars }
    const exchanges = shadowExchanges(plan, input.brief)
    return {
      plan,
      trace: {
        planner: this.id,
        requests: 0,
        latencyMs: performance.now() - started,
        decisions,
        exchanges,
      },
    }
  }

  /**
   * Stub style-match: how typical is each of the plan's choices under a style's
   * priors, plus how much of its chord vocabulary the style's harmony book
   * shares. It can only ever agree with the priors it was built from — useful
   * as a sanity baseline next to Jev's judgment, not as ground truth.
   */
  async score(plan: CompositionPlan, styles: readonly StyleId[]): Promise<ScoreResult> {
    const scores: Partial<Record<StyleId, StyleMatchScore>> = {}
    for (const style of styles) scores[style] = heuristicMatch(plan, STYLE_PROFILES[style])
    return {
      scores,
      songQuality: heuristicSongQuality(plan),
      exchanges: [unsent('style match', { op: 'score', plan, styles: [...styles] })],
    }
  }
}

/** The three that decide the sound weigh most; the rest colour it. */
const FIELD_WEIGHT: Record<GlobalField, number> = {
  accompaniment: 3,
  motion: 2.5,
  register: 2.5,
  palette: 1.5,
  form: 1,
  tempo: 1,
  dynamics: 1,
  dynamicShape: 1,
  key: 0.75,
  meter: 0.5,
}

/** 0–1: how typical the plan's globals are for one of the style's kinds of piece. */
function globalsFit(plan: CompositionPlan, profile: StyleProfile, variant: Variant | undefined): number {
  const priors = effectivePriors(profile, variant)
  let weighted = 0
  let totalWeight = 0
  for (const field of GLOBAL_FIELD_IDS) {
    const prior = priors[field] as Weights<string>
    const peak = Math.max(...Object.values(prior).map((w) => w ?? 0), 1)
    const chosen = plan[field]
    weighted += FIELD_WEIGHT[field] * Math.min(1, (chosen ? (prior[chosen] ?? 0) : 0) / peak)
    totalWeight += FIELD_WEIGHT[field]
  }
  return weighted / totalWeight
}

function heuristicMatch(plan: CompositionPlan, profile: StyleProfile): StyleMatchScore {
  // Judge the plan as the closest kind of piece this style actually writes.
  const globals = Math.max(...(profile.variants.length ? profile.variants : [undefined]).map((variant) => globalsFit(plan, profile, variant)))
  const vocabulary = styleVocabulary(profile)
  const chordFit = plan.bars.filter((bar) => vocabulary.has(bar.chord)).length / plan.bars.length
  const fit = 0.7 * globals + 0.3 * chordFit

  const thresholds = [0.4, 0.68]
  const level = fit < thresholds[0] ? 0 : fit < thresholds[1] ? 1 : 2
  const margin = Math.min(...thresholds.map((t) => Math.abs(fit - t)))
  return {
    match: (['low', 'medium', 'high'] as const satisfies readonly MatchLevel[])[level],
    confidence: Math.min(1, margin / 0.2),
    raw: fit * 2,
  }
}
