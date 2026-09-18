// Casting and judging a scenario: through /api/jev when the server has a key,
// otherwise with a small offline stub behind the same result shape — the same
// split as the music demo's JevPlanner / HeuristicPlanner.

import { pickFrom, rng } from '../planner/pick'
import type { Answer, SystemOneRequest, SystemOneResponse } from '../planner/jev/systemOne'
import { DEFAULT_MODEL } from '../planner/jev/systemOne'
import { buildTrolleyRequest, CAST_SLOTS, type TrolleyOp } from './requests'
import { COUNTS, ENTITIES, ENTITY_IDS, THEME_IDS, TRAITS, TWISTS, TWIST_IDS, traitsFor, type DecisionId, type EntityId, type Group, type Scenario, type ThemeId, type TraitId, type TwistId } from './schema'

export interface Exchange {
  label: string
  op: TrolleyOp
  request: SystemOneRequest
  response?: SystemOneResponse
  latencyMs?: number
  sent: boolean
}

export interface Verdict {
  source: 'jev' | 'stub'
  decision: DecisionId
  /** P(pull the lever), 0–1. */
  pull: number
  confidence: number
  /** 0–3 positions on the Score scales. */
  difficulty: number
  absurdity: number
  /** P(most people would pull), 0–1. */
  mostPeoplePull: number
  exchange: Exchange
}

export class JevUnavailable extends Error {}

export async function jevAvailable(): Promise<{ available: boolean; model?: string }> {
  try {
    const response = await fetch('/api/jev')
    const body = (await response.json()) as { available?: boolean; model?: string }
    return { available: response.ok && Boolean(body.available), model: body.model }
  } catch {
    return { available: false }
  }
}

async function ask(label: string, op: TrolleyOp, signal?: AbortSignal): Promise<Required<Exchange>> {
  const started = performance.now()
  const response = await fetch('/api/jev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op), signal })
  const body = (await response.json().catch(() => null)) as (SystemOneResponse & { error?: string }) | null
  if (!response.ok || !body || body.error) {
    const wait = response.headers.get('Retry-After')
    throw new JevUnavailable(body?.error ?? `Jev proxy responded ${response.status}${wait ? ` (retry in ${wait} s)` : ''}`)
  }
  return { label, op, request: buildTrolleyRequest(op, DEFAULT_MODEL), response: body, latencyMs: performance.now() - started, sent: true }
}

const choiceOf = (answers: Record<string, Answer>, id: string) => {
  const answer = answers[id]
  if (!answer || answer.type !== 'choice') throw new JevUnavailable(`Jev response is missing "${id}"`)
  return answer
}

// ── cast ────────────────────────────────────────────────────────────────────

export const randomTheme = (random: () => number): ThemeId => THEME_IDS[Math.floor(random() * THEME_IDS.length)]

/**
 * Bias generated scenarios toward the textbook shape. Extra detail and a
 * twist still happen, just less often than a coin flip — so "goldfish, who
 * owes you money, and the lever is sticky" is no longer the default draw.
 */
export const PLAIN_CHANCE = 0.72
export const NO_TWIST_CHANCE = 0.7

const anyOf = <T>(items: readonly T[], random: () => number) => items[Math.floor(random() * items.length)]

/** Pick a trait that can plausibly apply, defaulting to no detail. */
export function pickTraitFor(entity: EntityId, random: () => number, probabilities?: Record<string, number>): TraitId {
  const allowed = traitsFor(entity).filter((trait) => trait !== 'plain')
  if (allowed.length === 0 || random() < PLAIN_CHANCE) return 'plain'
  if (probabilities) {
    const offered = Object.fromEntries(Object.entries(probabilities).filter(([id]) => allowed.includes(id as TraitId)))
    if (Object.keys(offered).length === 0) return 'plain'
    return pickFrom(offered, 'sample', random) as TraitId
  }
  return anyOf(allowed, random)
}

export function pickTwist(random: () => number, probabilities?: Record<string, number>): TwistId {
  const twists = TWIST_IDS.filter((twist) => twist !== 'none')
  if (random() < NO_TWIST_CHANCE) return 'none'
  if (probabilities) {
    const offered = Object.fromEntries(Object.entries(probabilities).filter(([id]) => id !== 'none'))
    if (Object.keys(offered).length === 0) return 'none'
    return pickFrom(offered, 'sample', random) as TwistId
  }
  return anyOf(twists, random)
}

/** Sample a scenario from a trolley_cast answer map (live Jev or a fixture). */
export function scenarioFromCastAnswers(answers: Record<string, Answer>, seed: number): Scenario {
  const random = rng(seed)
  const used = new Set<string>()
  const groupFor = (slot: (typeof CAST_SLOTS)[number]): Group => {
    // The four entity questions ran in parallel and can't see each other: drop what's already on a track.
    const offered = Object.fromEntries(Object.entries(choiceOf(answers, `${slot}_entity`).probabilities).filter(([id]) => !used.has(id)))
    const entity = pickFrom(offered, 'sample', random) as EntityId
    used.add(entity)
    const count = Number(pickFrom(choiceOf(answers, `${slot}_count`).probabilities, 'sample', random))
    const trait = pickTraitFor(entity, random, choiceOf(answers, `${slot}_trait`).probabilities)
    return { entity, count: Number.isInteger(count) && count > 0 ? count : 1, trait }
  }
  const ahead = [groupFor('ahead_1'), ...(random() < 0.35 ? [groupFor('ahead_2')] : [])]
  const siding = [groupFor('siding_1'), ...(random() < 0.25 ? [groupFor('siding_2')] : [])]
  return { ahead, siding, twist: pickTwist(random, choiceOf(answers, 'twist').probabilities) }
}

/** Jev casts the tracks for a premise; code samples its distributions and removes duplicates. */
export async function castWithJev(theme: ThemeId, seed: number, signal?: AbortSignal): Promise<{ scenario: Scenario; exchange: Exchange }> {
  const exchange = await ask('cast the tracks', { op: 'trolley_cast', theme }, signal)
  return { scenario: scenarioFromCastAnswers(exchange.response.answers, seed), exchange }
}

const THEME_POOLS: Record<ThemeId, EntityId[]> = {
  classic: ['stranger', 'stranger', 'grandma', 'your_best_friend'],
  office: ['your_boss', 'production_database', 'tax_auditor', 'your_phone', 'billionaire'],
  family: ['your_wife', 'grandma', 'dog', 'your_best_friend', 'houseplant'],
  internet: ['influencer', 'your_phone', 'production_database', 'billionaire', 'mime'],
  high_stakes_trivial: ['nobel_scientist', 'last_pizza', 'lottery_ticket', 'priceless_painting', 'rubber_ducks'],
  sci_fi: ['robot', 'clone_of_you', 'time_traveller', 'nobel_scientist'],
  philosophy_seminar: ['philosopher', 'mime', 'clone_of_you', 'stranger', 'cat'],
  pets_and_objects: ['dog', 'cat', 'goldfish', 'houseplant', 'your_phone', 'last_pizza', 'rubber_ducks'],
}

/** Offline stand-in for the cast: draws from a per-theme pool with the same seed discipline. */
export function castOffline(theme: ThemeId, seed: number): { scenario: Scenario; exchange: Exchange } {
  const random = rng(seed)
  const pool = [...THEME_POOLS[theme]]
  const take = (): EntityId => pool.splice(Math.floor(random() * pool.length), 1)[0] ?? anyOf(ENTITY_IDS, random)
  const group = (): Group => {
    const entity = take()
    return { entity, count: Number(anyOf(Object.keys(COUNTS), random)), trait: pickTraitFor(entity, random) }
  }
  const scenario: Scenario = { ahead: [group(), ...(random() < 0.35 ? [group()] : [])], siding: [group()], twist: pickTwist(random) }
  const op: TrolleyOp = { op: 'trolley_cast', theme }
  return { scenario, exchange: { label: 'cast the tracks', op, request: buildTrolleyRequest(op, DEFAULT_MODEL), sent: false } }
}

// ── judge ───────────────────────────────────────────────────────────────────

export async function judgeWithJev(scenario: Scenario, signal?: AbortSignal): Promise<Verdict> {
  const exchange = await ask('judge the dilemma', { op: 'trolley_judge', scenario }, signal)
  const answers = exchange.response.answers
  const decision = choiceOf(answers, 'decision')
  const score = (id: string) => {
    const answer = answers[id]
    return answer?.type === 'score' ? answer.score : 0
  }
  const most = answers.most_people_pull
  return {
    source: 'jev',
    decision: (decision.choice === 'pull_lever' ? 'pull_lever' : 'do_nothing') satisfies DecisionId,
    pull: decision.probabilities.pull_lever ?? 0,
    confidence: decision.confidence,
    difficulty: score('difficulty'),
    absurdity: score('absurdity'),
    mostPeoplePull: most?.type === 'noul' ? most.noul : 0.5,
    exchange,
  }
}

/** Rough worth of one of each, for the stub only: people ≫ pets ≫ things, with a few jokes. */
const WORTH: Record<EntityId, number> = {
  stranger: 10, your_wife: 40, your_best_friend: 30, your_boss: 8, grandma: 14, dog: 7, cat: 5, goldfish: 1, robot: 3, clone_of_you: 9,
  philosopher: 10, mime: 6, billionaire: 9, influencer: 8, tax_auditor: 7, nobel_scientist: 25, time_traveller: 10,
  priceless_painting: 4, last_pizza: 1.5, your_phone: 1.2, production_database: 5, lottery_ticket: 3, houseplant: 0.8, rubber_ducks: 0.3,
}
const ODDNESS: Record<EntityId, number> = {
  stranger: 0, your_wife: 0.5, your_best_friend: 0.5, your_boss: 1, grandma: 0.5, dog: 1, cat: 1.5, goldfish: 2.5, robot: 2, clone_of_you: 3,
  philosopher: 2, mime: 3, billionaire: 2, influencer: 2.5, tax_auditor: 2.5, nobel_scientist: 1, time_traveller: 3,
  priceless_painting: 2, last_pizza: 3, your_phone: 2.5, production_database: 3, lottery_ticket: 2.5, houseplant: 3, rubber_ducks: 3,
}
const TRAIT_WEIGHT: Record<TraitId, number> = { plain: 1, asleep: 1.05, waving: 1.15, volunteered: 0.6, owes_you_money: 1.1, secret_villain: 0.35, about_to_do_good: 1.5, filming: 0.95, insured: 0.85 }

/** The stub can't know what a visitor's custom entry is worth; it takes a middling guess. */
const worth = (g: Group) => (g.entity === 'custom' ? 6 : WORTH[g.entity])
const oddness = (g: Group) => (g.entity === 'custom' ? 2.5 : ODDNESS[g.entity])
const loss = (groups: readonly Group[]) => groups.reduce((sum, g) => sum + worth(g) * TRAIT_WEIGHT[g.trait] * g.count ** 0.8, 0)

/** Offline stand-in for the judge: utilitarian arithmetic with a bias toward not acting. */
export function judgeOffline(scenario: Scenario): Verdict {
  const ahead = loss(scenario.ahead) + 0.01
  const siding = loss(scenario.siding) + 0.01
  const twistBias: Partial<Record<TwistId, number>> = { lever_costs_money: -0.3, lever_is_sticky: -0.15, trolley_is_slow: -0.8, late_for_meeting: -0.2, you_built_it: 0.4, it_is_a_drill: -0.5 }
  // log-odds of pulling: what is saved versus what is lost, minus a status-quo bias.
  const logit = 1.4 * Math.log(ahead / siding) - 0.45 + (twistBias[scenario.twist] ?? 0)
  const pull = 1 / (1 + Math.exp(-logit))
  const groups = [...scenario.ahead, ...scenario.siding]
  const odd = groups.length ? groups.reduce((sum, g) => sum + oddness(g) + (g.trait === 'plain' ? 0 : 0.6), 0) / groups.length + (scenario.twist === 'none' ? 0 : 0.5) : 0
  const op: TrolleyOp = { op: 'trolley_judge', scenario }
  return {
    source: 'stub',
    decision: pull >= 0.5 ? 'pull_lever' : 'do_nothing',
    pull,
    confidence: Math.abs(pull - 0.5) * 2,
    difficulty: 3 * (1 - Math.abs(pull - 0.5) * 2) * Math.min(1, (ahead + siding) / 20),
    absurdity: Math.min(3, odd),
    mostPeoplePull: 1 / (1 + Math.exp(-(logit - 0.3))),
    exchange: { label: 'judge the dilemma', op, request: buildTrolleyRequest(op, DEFAULT_MODEL), sent: false },
  }
}

export const tables = { ENTITIES, TRAITS, TWISTS }
