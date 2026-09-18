// Offline stand-in for Jev. Same interface, same enum-only output, no network:
// it samples hand-written per-style knowledge (src/plan/styles.ts) instead of
// asking a model. It exists so the playground is demoable without an API key
// and so there is a baseline to compare Jev's choices against.
//
// The order of decisions mirrors JevPlanner's:
//   1. character  — which kind of piece (one of the style's archetypes)
//   2. globals    — form, key, meter, texture … from that archetype's priors
//   3. bars       — roles from the form; chords assembled from the style's
//                   harmony book by the form's phrase slots; contours per bar

import {
  BAR_ROLE_IDS,
  CHARACTER_IDS,
  CHORD_IDS,
  CONTOUR_IDS,
  GLOBAL_FIELDS,
  GLOBAL_FIELD_IDS,
  type BarCount,
  type BarPlan,
  type BarRoleId,
  type CharacterId,
  type ChordId,
  type CompositionPlan,
  type ContourId,
  type FormId,
  type GlobalField,
  type MatchLevel,
  type PlanGlobals,
  type StyleId,
  type StyleMatchScore,
} from '../plan/schema'
import { formSlots, type PhraseSlot } from '../plan/forms'
import { rootDegree } from '../render/harmony'
import { STYLE_PROFILES, styleVocabulary, type HarmonyBook, type StylePriors, type StyleProfile, type Weights } from '../plan/styles'
import type { Decision, Exchange, PlanInput, PlanOptions, PlanResult, Planner, ScoreResult } from './Planner'
import { decision, normalize, pickFrom, rng } from './pick'
import { buildRequest, type JevOp } from './jev/requests'
import { DEFAULT_MODEL } from './jev/systemOne'

/** The request Jev would have received for this op — never actually sent. */
const unsent = (label: string, op: JevOp): Exchange => ({ label, op, request: buildRequest(op, DEFAULT_MODEL), sent: false })

/** Replay a finished plan as the sequence of ops JevPlanner would have issued. */
export function shadowExchanges(plan: CompositionPlan, brief: boolean): Exchange[] {
  const { version: _version, style, bars, ...globals } = plan
  const roles = bars.map((bar) => bar.role)
  return [
    unsent('character', { op: 'concept', style, brief }),
    unsent('globals + form', { op: 'globals', style, brief, character: plan.character }),
    ...bars.map((_, index) =>
      unsent(`bar ${index + 1} chord`, {
        op: 'bar',
        style,
        brief,
        globals,
        roles,
        chords: bars.slice(0, index).map((bar) => bar.chord),
        index,
      }),
    ),
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

const CONTOUR_BY_ROLE: Partial<Record<BarRoleId, Weights<ContourId>>> = {
  statement: { leap_fall: 1.3, arch: 1.2 },
  climax: { rise: 2.5, arch: 1.5, leap_fall: 1.6, fall: 0.4, static: 0.3, dip: 0.4 },
  cadence: { fall: 3, static: 1.5, leap_fall: 1.2, rise: 0.3, pendulum: 0.3, wave: 0.5 },
  half_cadence: { rise: 1.5, dip: 1.3, fall: 0.7 },
  contrast: { dip: 1.6, drop_rise: 1.6, fall: 1.3 },
  development: { rise: 1.4, wave: 1.4, pendulum: 1.3, arch: 1.2, static: 0.5 },
  surprise: { drop_rise: 1.8, leap_fall: 1.6, static: 0.5 },
  dissolve: { fall: 2.5, static: 1.8, rise: 0.4, pendulum: 0.3 },
}

export const isMinorKey = (key: string) => key.endsWith('_minor')

/** The priors in force for one archetype: the style's base, overridden field by field. */
export function effectivePriors(profile: StyleProfile, character: CharacterId): StylePriors {
  return { ...profile.priors, ...(profile.archetypes[character]?.priors ?? {}) }
}

function archetypeWeights(profile: StyleProfile): Weights<CharacterId> {
  return Object.fromEntries(Object.entries(profile.archetypes).map(([character, archetype]) => [character, archetype.weight])) as Weights<CharacterId>
}

// ── harmony from the form's phrase slots ────────────────────────────────────

interface Harmony {
  chords: ChordId[]
  /** What else was on the table for each bar, for the trace. */
  candidates: ChordId[][]
}

function assembleHarmony(book: HarmonyBook, slots: readonly PhraseSlot[], holds: boolean, sample: boolean, random: () => number): Harmony {
  const chords: ChordId[] = []
  const candidates: ChordId[][] = []
  const heads = new Map<PhraseSlot['material'], readonly ChordId[]>()
  // Loop-built pieces don't sit on one cycle: a second cycle takes over for
  // the middle of the piece (a harmonic shift every eight bars or so) and the
  // first returns to close. Short pieces keep the one.
  const cycles = book.loops.length ? book.loops : book.heads
  const loopA = pickUnit(cycles, undefined)
  const others = cycles.filter((cycle) => cycle !== loopA.unit)
  const loopB = others.length && slots.length >= 4 ? { unit: sample ? others[Math.floor(random() * others.length)] : others[0], pool: others } : loopA
  let loopAt = 0

  /** One unit from `units`, preferring those that don't just repeat the chord we are coming from. */
  function pickUnit<U extends readonly ChordId[]>(units: readonly U[], after: ChordId | undefined): { unit: U; pool: readonly U[] } {
    const moving = holds || after === undefined ? units : units.filter((unit) => unit[0] !== after)
    const pool = moving.length ? moving : units
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
  const headFor = (slot: PhraseSlot) => {
    const known = heads.get(slot.material)
    if (known) return { unit: slot.varied ? vary(known) : known, pool: [known] }
    const picked = pickUnit(book.heads, last())
    heads.set(slot.material, picked.unit)
    return picked
  }
  const tailFor = (slot: PhraseSlot) => pickUnit(book.tails[slot.end].length ? book.tails[slot.end] : book.tails.open, last())

  for (const slot of slots) {
    switch (slot.build) {
      case 'head_tail': {
        const whole = book.phrases[slot.end]
        // First appearance of an idea may be a whole phrase lifted from the repertoire.
        if (!heads.has(slot.material) && whole.length && (!sample || random() < 0.5)) {
          const picked = pickUnit(whole, last())
          heads.set(slot.material, picked.unit.slice(0, 2))
          push(picked.unit, picked.pool)
          break
        }
        const head = headFor(slot)
        push(head.unit, head.pool)
        const tail = tailFor(slot)
        push(tail.unit, tail.pool)
        break
      }
      case 'head_seq': {
        const head = headFor(slot)
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
        const head = headFor(slot)
        push(head.unit, head.pool)
        push(vary(heads.get(slot.material) ?? head.unit), [head.unit])
        break
      }
      case 'loop': {
        const at = slots.indexOf(slot)
        const middle = at >= Math.floor(slots.length / 2) && at < slots.length - 1
        const loop = middle ? loopB : loopA
        if (at === Math.floor(slots.length / 2) || at === slots.length - 1) loopAt = 0 // a new section starts its cycle from the top
        const bars = Array.from({ length: 4 }, () => loop.unit[loopAt++ % loop.unit.length])
        // Each later pass may take a different inversion: the same cycle over a new bass.
        push(slot.varied ? vary(bars) : bars, loop.pool.map((cycle) => bars.map((_, k) => cycle[(loopAt - 4 + k) % cycle.length])))
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
          const head = headFor(slot)
          push(head.unit, head.pool)
          const tail = pickUnit(book.tails.closed, last())
          push(tail.unit, tail.pool)
        }
        break
      }
    }
  }

  // Role-driven touches: a `surprise` bar reaches outside the key …
  slots.forEach((slot, s) =>
    slot.roles.forEach((role, k) => {
      const bar = s * 4 + k
      if (role !== 'surprise' || bar === 0 || bar === chords.length - 1 || !book.surprises.length) return
      candidates[bar] = [...new Set([chords[bar], ...book.surprises])]
      if (sample ? random() < 0.75 : true) chords[bar] = sample ? book.surprises[Math.floor(random() * book.surprises.length)] : book.surprises[0]
    }),
  )
  // … and the piece ends on one of the style's finals (an added-sixth tonic, a Picardy third, a bare six-four).
  const end = chords.length - 1
  if (!book.finals.includes(chords[end]) || (sample && random() < 0.5)) {
    candidates[end] = [...new Set([chords[end], ...book.finals])]
    chords[end] = sample ? book.finals[Math.floor(random() * book.finals.length)] : book.finals[0]
  }
  return { chords, candidates }
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

    // 1 ─ which kind of piece
    const characters = archetypeWeights(profile)
    const characterProbabilities = withFloor(CHARACTER_IDS, characters)
    const character = pickFrom(characterProbabilities, input.pick, random, authored(characters))
    emit(decision('character', character, characterProbabilities))
    const priors = effectivePriors(profile, character)

    // 2 ─ globals, from that archetype's priors
    const globals = { character } as Record<GlobalField, string>
    for (const field of GLOBAL_FIELD_IDS) {
      if (field === 'character') continue
      const weights = priors[field] as Weights<string>
      const probabilities = withFloor(Object.keys(GLOBAL_FIELDS[field]), weights)
      globals[field] = pickFrom(probabilities, input.pick, random, authored(weights))
      emit(decision(field, globals[field], probabilities))
    }

    const barCount: BarCount = input.bars

    // 3 ─ bars: the form gives the roles and says how to assemble the harmony
    const slots = formSlots(globals.form as FormId, barCount)
    const roles = slots.flatMap((slot) => [...slot.roles])
    const book = profile.harmony[isMinorKey(globals.key) ? 'minor' : 'major']
    let harmony = assembleHarmony(book, slots, profile.holds, sample, random)
    for (let attempt = 0; sample && attempt < 8 && hasPopLoop(harmony.chords); attempt++) {
      harmony = assembleHarmony(book, slots, profile.holds, sample, random)
    }

    const bars: BarPlan[] = []
    for (let i = 0; i < barCount; i++) {
      const role = roles[i]
      const chord = harmony.chords[i]
      const previous = bars[i - 1]
      let contour: ContourId
      let contourProbabilities: Record<ContourId, number>
      if (previous && (role === 'sequence' || role === 'echo')) {
        // A sequence or an echo IS the previous figure: same shape, new chord or new dynamic.
        contour = previous.contour
        contourProbabilities = distributionOf(CONTOUR_IDS, [contour])
      } else {
        const weights = withFloor(CONTOUR_IDS, priors.contour)
        const bias = CONTOUR_BY_ROLE[role] ?? {}
        for (const id of CONTOUR_IDS) weights[id] *= bias[id] ?? 1
        // Three bars of the same shape in a row is a machine talking.
        if (previous && bars[i - 2]?.contour === previous.contour) weights[previous.contour] *= 0.2
        contourProbabilities = normalize(weights)
        contour = pickFrom(contourProbabilities, input.pick, random)
      }
      bars.push({ chord, role, contour })
      emit(decision(`bars[${i}].role`, role, distributionOf(BAR_ROLE_IDS, [role]), 1))
      emit(decision(`bars[${i}].chord`, chord, distributionOf(CHORD_IDS, harmony.candidates[i])))
      emit(decision(`bars[${i}].contour`, contour, contourProbabilities))
    }

    const plan: CompositionPlan = { version: 1, style: input.style, ...(globals as PlanGlobals), bars }
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
    return { scores, exchanges: [unsent('style match', { op: 'score', plan, styles: [...styles] })] }
  }
}

const FIELD_WEIGHT: Record<GlobalField, number> = {
  texture: 3,
  character: 1.5,
  palette: 1.5,
  form: 1,
  defaultInstrument: 1,
  tempo: 1,
  dynamics: 1,
  dynamicShape: 1,
  key: 0.75,
  meter: 0.5,
}

/** 0–1: how typical the plan's globals are for one of the style's kinds of piece. */
function globalsFit(plan: CompositionPlan, profile: StyleProfile, character: CharacterId): number {
  const priors = effectivePriors(profile, character)
  let weighted = 0
  let totalWeight = 0
  for (const field of GLOBAL_FIELD_IDS) {
    const prior = (field === 'character' ? archetypeWeights(profile) : priors[field]) as Weights<string>
    const peak = Math.max(...Object.values(prior).map((w) => w ?? 0), 1)
    weighted += FIELD_WEIGHT[field] * Math.min(1, (prior[plan[field]] ?? 0) / peak)
    totalWeight += FIELD_WEIGHT[field]
  }
  return weighted / totalWeight
}

function heuristicMatch(plan: CompositionPlan, profile: StyleProfile): StyleMatchScore {
  // Judge the plan as the kind of piece it says it is, if the style writes that kind; else as the closest kind it does write.
  const kinds = profile.archetypes[plan.character] ? [plan.character] : (Object.keys(profile.archetypes) as CharacterId[])
  const globals = Math.max(...kinds.map((character) => globalsFit(plan, profile, character)))
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
