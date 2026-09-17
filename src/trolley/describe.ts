// Every word the trolley page shows about a scenario is assembled here, by
// code, from ids. Jev never writes any of it.

import type { DecisionId, EntityId, Group, Scenario, TraitId, TwistId } from './schema'

const NOUNS: Record<EntityId, { one: string; many: string; emoji: string }> = {
  stranger: { one: 'a stranger', many: 'strangers', emoji: '🧍' },
  your_wife: { one: 'your wife', many: 'copies of your wife', emoji: '👰' },
  your_best_friend: { one: 'your best friend', many: 'of your best friends', emoji: '🧑‍🤝‍🧑' },
  your_boss: { one: 'your boss', many: 'of your bosses', emoji: '👔' },
  grandma: { one: 'a grandmother with cookies', many: 'grandmothers with cookies', emoji: '👵' },
  dog: { one: 'a very good dog', many: 'very good dogs', emoji: '🐕' },
  cat: { one: 'an indifferent cat', many: 'indifferent cats', emoji: '🐈' },
  goldfish: { one: 'a goldfish in a bowl', many: 'goldfish in bowls', emoji: '🐠' },
  robot: { one: 'a polite robot', many: 'polite robots', emoji: '🤖' },
  clone_of_you: { one: 'a clone of you', many: 'clones of you', emoji: '🪞' },
  philosopher: { one: 'a moral philosopher', many: 'moral philosophers', emoji: '🧐' },
  mime: { one: 'a mime', many: 'mimes', emoji: '🤡' },
  billionaire: { one: 'a billionaire', many: 'billionaires', emoji: '🎩' },
  influencer: { one: 'an influencer', many: 'influencers', emoji: '🤳' },
  tax_auditor: { one: 'your tax auditor', many: 'tax auditors', emoji: '🧾' },
  nobel_scientist: { one: 'a scientist close to a cure', many: 'scientists close to a cure', emoji: '🔬' },
  time_traveller: { one: 'a time traveller', many: 'time travellers', emoji: '⏳' },
  priceless_painting: { one: 'a priceless painting', many: 'priceless paintings', emoji: '🖼️' },
  last_pizza: { one: 'the last slice of pizza on Earth', many: 'last slices of pizza', emoji: '🍕' },
  your_phone: { one: 'your phone (not backed up)', many: 'of your phones (none backed up)', emoji: '📱' },
  production_database: { one: 'the only copy of the production database', many: 'irreplaceable production databases', emoji: '🗄️' },
  lottery_ticket: { one: 'a winning lottery ticket', many: 'winning lottery tickets', emoji: '🎟️' },
  houseplant: { one: 'a houseplant you kept alive for nine years', many: 'long-lived houseplants', emoji: '🪴' },
  rubber_ducks: { one: 'a crate of rubber ducks', many: 'crates of rubber ducks', emoji: '🦆' },
}

const TRAIT_PHRASE: Record<TraitId, string> = {
  plain: '',
  asleep: 'fast asleep',
  waving: 'waving at you cheerfully',
  volunteered: 'who volunteered and signed a waiver',
  owes_you_money: 'who owe you money',
  secret_villain: 'secretly cartoon villains',
  about_to_do_good: 'about to do something wonderful',
  filming: 'filming you',
  insured: 'extremely well insured',
  judging_you: 'silently judging you',
}

const TWIST_SENTENCE: Record<TwistId, string> = {
  none: '',
  nobody_knows: 'Nobody will ever know what you chose.',
  livestreamed: 'Millions are watching live.',
  lever_costs_money: 'Pulling the lever costs you fifty dollars.',
  trolley_is_slow: 'The trolley is moving at walking pace; everyone could probably just step off.',
  you_built_it: 'You designed this trolley line. You signed off on the brakes.',
  loop_track: 'The side track loops back onto the main line eventually.',
  late_for_meeting: 'You are already late for a meeting.',
  lever_is_sticky: 'The lever is sticky and unpleasant to touch.',
  it_is_a_drill: 'A sign says this might only be a drill.',
}

export const entityEmoji = (entity: EntityId) => NOUNS[entity].emoji
export const entityLabel = (entity: EntityId) => NOUNS[entity].one.replace(/^(a|an|the|your) /, (article) => (article === 'your ' ? 'your ' : '')).replace(/ \(.*\)$/, '')

export function groupPhrase(group: Group): string {
  const noun = NOUNS[group.entity]
  const head = group.count === 1 ? noun.one : `${group.count.toLocaleString('en-US')} ${noun.many}`
  // Singular trait phrases read better with "who owes" than "who owe".
  const trait = group.count === 1 ? TRAIT_PHRASE[group.trait].replace('who owe ', 'who owes ').replace('secretly cartoon villains', 'secretly a cartoon villain') : TRAIT_PHRASE[group.trait]
  return trait ? `${head}, ${trait}` : head
}

export function trackPhrase(groups: readonly Group[]): string {
  if (groups.length === 0) return 'nothing at all'
  const phrases = groups.map(groupPhrase)
  return phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join('; ')}; and ${phrases[phrases.length - 1]}`
}

/** The dilemma, as a paragraph. */
export function scenarioText(scenario: Scenario): string {
  const twist = TWIST_SENTENCE[scenario.twist]
  return `A runaway trolley is heading straight for ${trackPhrase(scenario.ahead)}. You are standing at a lever. Pull it, and the trolley swerves onto a side track — toward ${trackPhrase(scenario.siding)}.${twist ? ` ${twist}` : ''}`
}

export const twistSentence = (twist: TwistId) => TWIST_SENTENCE[twist]

export function verdictText(decision: DecisionId, probability: number): string {
  const sure = probability >= 0.85 ? 'without much hesitation' : probability >= 0.65 ? 'on balance' : 'but it is close to a coin flip'
  return decision === 'pull_lever' ? `Pull the lever — ${sure}.` : `Leave the lever alone — ${sure}.`
}

export const DIFFICULTY_WORDS = ['trivial', 'it stings a little', 'genuinely difficult', 'agonising'] as const
export const ABSURDITY_WORDS = ['textbook sober', 'slightly odd', 'silly', 'completely unhinged'] as const
