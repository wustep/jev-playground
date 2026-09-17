// Every word the trolley page shows about a scenario is assembled here, by
// code, from ids. Jev never writes any of it.

import { ENTITY_NOUNS, TWISTS, type DecisionId, type EntityId, type Group, type Scenario, type TraitId, type TwistId } from './schema'

/** How a trait reads after a noun. Same words as the dropdown (TRAITS), bent to fit a sentence. */
const TRAIT_PHRASE: Record<TraitId, { one: string; many: string }> = {
  plain: { one: '', many: '' },
  asleep: { one: 'fast asleep', many: 'fast asleep' },
  waving: { one: 'waving at you cheerfully', many: 'waving at you cheerfully' },
  volunteered: { one: 'who volunteered and signed a waiver', many: 'who volunteered and signed waivers' },
  owes_you_money: { one: 'who owes you money', many: 'who owe you money' },
  secret_villain: { one: 'secretly a cartoon villain', many: 'secretly cartoon villains' },
  about_to_do_good: { one: 'about to do something wonderful', many: 'about to do something wonderful' },
  filming: { one: 'filming you', many: 'filming you' },
  insured: { one: 'extremely well insured', many: 'extremely well insured' },
}

export const entityEmoji = (entity: EntityId) => ENTITY_NOUNS[entity].emoji

export function groupPhrase(group: Group): string {
  const noun = ENTITY_NOUNS[group.entity]
  const head = group.count === 1 ? noun.one : `${group.count.toLocaleString('en-US')} ${noun.many}`
  const trait = TRAIT_PHRASE[group.trait][group.count === 1 ? 'one' : 'many']
  return trait ? `${head}, ${trait}` : head
}

export function trackPhrase(groups: readonly Group[]): string {
  if (groups.length === 0) return 'nothing at all'
  const phrases = groups.map(groupPhrase)
  return phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join('; ')}; and ${phrases[phrases.length - 1]}`
}

/** The dilemma, as a paragraph. */
export function scenarioText(scenario: Scenario): string {
  const twist = twistSentence(scenario.twist)
  return `A runaway trolley is heading straight for ${trackPhrase(scenario.ahead)}. You are standing at a lever. Pull it, and the trolley swerves onto a side track — toward ${trackPhrase(scenario.siding)}.${twist ? ` ${twist}` : ''}`
}

export const twistSentence = (twist: TwistId) => (twist === 'none' ? '' : TWISTS[twist])

export function verdictText(decision: DecisionId, probability: number): string {
  const sure = probability >= 0.85 ? 'without much hesitation' : probability >= 0.65 ? 'on balance' : 'but it is close to a coin flip'
  return decision === 'pull_lever' ? `Pull the lever — ${sure}.` : `Leave the lever alone — ${sure}.`
}

export const DIFFICULTY_WORDS = ['trivial', 'it stings a little', 'genuinely difficult', 'agonising'] as const
export const ABSURDITY_WORDS = ['textbook sober', 'slightly odd', 'silly', 'completely unhinged'] as const
