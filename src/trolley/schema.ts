// The trolley demo's contract — same idea as the music one: Jev never writes
// a word. It picks from these closed tables and returns probabilities; code
// owns every sentence on screen (src/trolley/describe.ts).
//
// Everything here is a hypothetical cartoon. No injury is ever described.
//
// NOTE: imported by the /api/jev serverless chain → explicit `.js` extensions.

export type Table<K extends string> = Readonly<Record<K, string>>
const keysOf = <K extends string>(table: Table<K>) => Object.keys(table) as K[]

/**
 * Who or what can stand on a track. ONE set of words: the dropdown label, the
 * scenario prose (src/trolley/describe.ts) and the description Jev is given
 * are all built from `one` / `many`, so what you pick is what you read is what
 * gets judged. `many` follows a number: "5 strangers", "3 of your bosses".
 */
export const ENTITY_NOUNS = {
  stranger: { one: 'a stranger', many: 'strangers', emoji: '🧍' },
  your_wife: { one: 'your wife', many: 'clones of your wife', emoji: '👰' },
  your_best_friend: { one: 'your best friend', many: 'of your best friends', emoji: '🧑‍🤝‍🧑' },
  your_boss: { one: 'your boss', many: 'of your bosses', emoji: '👔' },
  grandma: { one: 'a grandmother', many: 'grandmothers', emoji: '👵' },
  dog: { one: 'a very good dog', many: 'very good dogs', emoji: '🐕' },
  cat: { one: 'an indifferent cat', many: 'indifferent cats', emoji: '🐈' },
  goldfish: { one: 'a goldfish', many: 'goldfish', emoji: '🐠' },
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
  last_pizza: { one: 'the last pizza on Earth', many: 'of the last pizzas on Earth', emoji: '🍕' },
  your_phone: { one: 'your phone, not backed up', many: 'phones, none backed up', emoji: '📱' },
  production_database: { one: 'the production database', many: 'production databases', emoji: '🗄️' },
  lottery_ticket: { one: 'a winning lottery ticket', many: 'winning lottery tickets', emoji: '🎟️' },
  houseplant: { one: 'a beloved houseplant', many: 'beloved houseplants', emoji: '🪴' },
  rubber_ducks: { one: 'a crate of rubber ducks', many: 'crates of rubber ducks', emoji: '🦆' },
} as const
export type EntityId = keyof typeof ENTITY_NOUNS

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** Dropdown labels and Jev's Choice criteria: the singular phrase, capitalised ("A stranger"). */
export const ENTITIES = Object.fromEntries(Object.entries(ENTITY_NOUNS).map(([id, noun]) => [id, capitalise(noun.one)])) as Table<EntityId>
export const ENTITY_IDS = keysOf<EntityId>(ENTITIES)

/** A detail about a group. Label = the words the prose uses, capitalised. */
export const TRAITS = {
  plain: 'No detail',
  asleep: 'Fast asleep',
  waving: 'Waving at you cheerfully',
  volunteered: 'Volunteered and signed a waiver',
  owes_you_money: 'Owes you money',
  secret_villain: 'Secretly a cartoon villain',
  about_to_do_good: 'About to do something wonderful',
  filming: 'Filming you',
  insured: 'Extremely well insured',
} as const
export type TraitId = keyof typeof TRAITS
export const TRAIT_IDS = keysOf<TraitId>(TRAITS)

/** The twist sentence, exactly as the scenario prints it. */
export const TWISTS = {
  none: 'No twist',
  nobody_knows: 'Nobody will ever know what you chose.',
  livestreamed: 'Millions are watching live.',
  lever_costs_money: 'Pulling the lever costs you fifty dollars.',
  trolley_is_slow: 'The trolley is at walking pace; everyone could probably just step off.',
  you_built_it: 'You designed this trolley line and signed off on the brakes.',
  loop_track: 'The side track loops back onto the main line eventually.',
  late_for_meeting: 'You are already late for a meeting.',
  lever_is_sticky: 'The lever is sticky and unpleasant to touch.',
  it_is_a_drill: 'A sign says this might only be a drill.',
} as const
export type TwistId = keyof typeof TWISTS
export const TWIST_IDS = keysOf<TwistId>(TWISTS)

/** A premise that code draws at random and Jev casts the tracks for. */
export const THEMES = {
  classic: 'The classic textbook version, played almost straight',
  office: 'A workplace comedy: bosses, deadlines, things that live on laptops',
  family: 'A family gathering that has gone very wrong',
  internet: 'The internet age: phones, streams, followers, data',
  high_stakes_trivial: 'Enormous stakes on one side, something trivial but beloved on the other',
  sci_fi: 'Robots, clones and people from the future',
  philosophy_seminar: 'A philosophy seminar that got out of hand',
  pets_and_objects: 'No strangers at all: pets and prized possessions only',
} as const
export type ThemeId = keyof typeof THEMES
export const THEME_IDS = keysOf<ThemeId>(THEMES)

/** How many of them. Jev chooses a bucket; the editor accepts any whole number up to MAX_COUNT. */
export const COUNTS = {
  '1': 'Exactly one',
  '2': 'A pair',
  '3': 'Three',
  '5': 'Five — the textbook number',
  '12': 'A dozen',
  '100': 'A hundred',
} as const
export type CountId = keyof typeof COUNTS
export const COUNT_IDS = keysOf<CountId>(COUNTS)

export const MAX_COUNT = 999
export const MAX_GROUPS_PER_TRACK = 4

/** A user-written entry: a short label and an emoji, instead of a row of the table. */
export interface CustomEntity {
  label: string
  emoji: string
}

export interface Group {
  /** A row of the closed table, or 'custom' with `custom` filled in. */
  entity: EntityId | 'custom'
  custom?: CustomEntity
  count: number
  trait: TraitId
}

export const MAX_CUSTOM_LABEL = 32
/**
 * The ONLY free text this app ever lets through to Jev, so it is kept narrow:
 * letters, digits, spaces and a little punctuation — no quotes, colons,
 * braces, backticks or line breaks, nothing that can look like structure or a
 * state path. It reaches Jev as one JSON string value describing who is on a
 * track; it is never placed in instructions or criteria.
 */
const CUSTOM_LABEL = /^[\p{L}\p{N}][\p{L}\p{N} '’\-.,&!?]*$/u
/** One emoji (with optional variation selector, skin tone or ZWJ sequence). UI only: never sent to Jev. */
const CUSTOM_EMOJI = /^\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic}\uFE0F?)*$/u

export function parseCustomEntity(raw: unknown, path: string): CustomEntity {
  if (!raw || typeof raw !== 'object') throw new TrolleyValidationError(`${path}: expected { label, emoji }`)
  const { label, emoji } = raw as Record<string, unknown>
  // Line breaks and other control characters are refused, not tidied away; runs of plain spaces are collapsed.
  const text = typeof label === 'string' && !/[\u0000-\u001f\u007f\u2028\u2029]/.test(label) ? label.trim().replace(/ +/g, ' ') : ''
  if (text.length < 1 || text.length > MAX_CUSTOM_LABEL || !CUSTOM_LABEL.test(text)) {
    throw new TrolleyValidationError(`${path}.label: 1–${MAX_CUSTOM_LABEL} letters, digits, spaces or ' - . , & ! ?`)
  }
  if (typeof emoji !== 'string' || emoji.length > 16 || !CUSTOM_EMOJI.test(emoji)) throw new TrolleyValidationError(`${path}.emoji: expected a single emoji`)
  return { label: text, emoji }
}

export interface Scenario {
  /** Where the trolley goes if you do nothing. */
  ahead: Group[]
  /** Where it goes if you pull the lever. */
  siding: Group[]
  twist: TwistId
}

export const DECISIONS = {
  pull_lever: 'Pull the lever: divert the trolley onto the side track',
  do_nothing: 'Do nothing: let the trolley continue straight ahead',
} as const
export type DecisionId = keyof typeof DECISIONS

export const CLASSIC: Scenario = {
  ahead: [{ entity: 'stranger', count: 5, trait: 'plain' }],
  siding: [{ entity: 'stranger', count: 1, trait: 'plain' }],
  twist: 'none',
}

// ── Validation (the server re-validates everything the browser sends) ───────

export class TrolleyValidationError extends Error {}

function option<K extends string>(table: Table<K>, value: unknown, path: string): K {
  if (typeof value === 'string' && Object.hasOwn(table, value)) return value as K
  throw new TrolleyValidationError(`${path}: not an allowed value`)
}

function parseGroups(raw: unknown, path: string): Group[] {
  if (!Array.isArray(raw) || raw.length > MAX_GROUPS_PER_TRACK) throw new TrolleyValidationError(`${path}: expected at most ${MAX_GROUPS_PER_TRACK} groups`)
  return raw.map((item, i) => {
    if (!item || typeof item !== 'object') throw new TrolleyValidationError(`${path}[${i}]: expected an object`)
    const group = item as Record<string, unknown>
    const count = group.count
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
      throw new TrolleyValidationError(`${path}[${i}].count: expected a whole number from 1 to ${MAX_COUNT}`)
    }
    const trait = option(TRAITS, group.trait, `${path}[${i}].trait`)
    if (group.entity === 'custom') return { entity: 'custom' as const, custom: parseCustomEntity(group.custom, `${path}[${i}].custom`), count, trait }
    return { entity: option(ENTITIES, group.entity, `${path}[${i}].entity`), count, trait }
  })
}

export function parseScenario(raw: unknown): Scenario {
  if (!raw || typeof raw !== 'object') throw new TrolleyValidationError('scenario: expected an object')
  const obj = raw as Record<string, unknown>
  return { ahead: parseGroups(obj.ahead, 'scenario.ahead'), siding: parseGroups(obj.siding, 'scenario.siding'), twist: option(TWISTS, obj.twist, 'scenario.twist') }
}

export function parseTheme(raw: unknown): ThemeId {
  return option(THEMES, raw, 'theme')
}
