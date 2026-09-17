// The trolley demo's contract — same idea as the music one: Jev never writes
// a word. It picks from these closed tables and returns probabilities; code
// owns every sentence on screen (src/trolley/describe.ts).
//
// Everything here is a hypothetical cartoon. No injury is ever described.
//
// NOTE: imported by the /api/jev serverless chain → explicit `.js` extensions.

export type Table<K extends string> = Readonly<Record<K, string>>
const keysOf = <K extends string>(table: Table<K>) => Object.keys(table) as K[]

/** Who or what can stand on a track. Descriptions double as Jev's Choice criteria. */
export const ENTITIES = {
  stranger: 'An ordinary stranger you have never met',
  your_wife: 'Your wife, whom you love',
  your_best_friend: 'Your best friend since childhood',
  your_boss: 'Your boss, mid performance review',
  grandma: 'A kindly grandmother carrying fresh cookies',
  dog: 'A very good dog',
  cat: 'A cat who is indifferent to your choice',
  goldfish: 'A goldfish in a bowl, somehow on the track',
  robot: 'A polite household robot with feelings-adjacent firmware',
  clone_of_you: 'An exact clone of you, made this morning',
  philosopher: 'A moral philosopher taking notes on what you do',
  mime: 'A mime pretending to be trapped in a box',
  billionaire: 'A billionaire who would happily pay you to pull the lever',
  influencer: 'An influencer livestreaming the whole thing',
  tax_auditor: 'The tax auditor assigned to your case',
  nobel_scientist: 'A scientist one experiment away from a major cure',
  time_traveller: 'A time traveller who insists this has already happened',
  priceless_painting: 'A priceless, irreplaceable painting',
  last_pizza: 'The last slice of pizza on Earth',
  your_phone: 'Your phone, not backed up',
  production_database: 'The only copy of the production database',
  lottery_ticket: 'A winning lottery ticket, unsigned',
  houseplant: 'A houseplant you have kept alive for nine years',
  rubber_ducks: 'A crate of rubber ducks',
} as const
export type EntityId = keyof typeof ENTITIES
export const ENTITY_IDS = keysOf<EntityId>(ENTITIES)

export const TRAITS = {
  plain: 'Nothing special about them',
  asleep: 'Fast asleep and unaware',
  waving: 'Waving at you cheerfully',
  volunteered: 'Volunteered to be there and signed a waiver',
  owes_you_money: 'Owes you a significant amount of money',
  secret_villain: 'Secretly a cartoon villain with a plan',
  about_to_do_good: 'About to do something wonderful for the world',
  filming: 'Filming you and will post the result',
  insured: 'Extremely well insured',
  judging_you: 'Silently judging you',
} as const
export type TraitId = keyof typeof TRAITS
export const TRAIT_IDS = keysOf<TraitId>(TRAITS)

export const TWISTS = {
  none: 'No twist: the plain classic dilemma',
  nobody_knows: 'Nobody will ever know what you chose',
  livestreamed: 'The whole thing is being livestreamed to millions',
  lever_costs_money: 'Pulling the lever costs you fifty dollars',
  trolley_is_slow: 'The trolley is moving at walking pace and everyone could probably step off',
  you_built_it: 'You designed this trolley line and signed off on the brakes',
  loop_track: 'The side track loops back onto the main line eventually',
  late_for_meeting: 'You are already late for a meeting',
  lever_is_sticky: 'The lever is sticky and unpleasant to touch',
  it_is_a_drill: 'A sign says this might only be a drill',
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

export interface Group {
  entity: EntityId
  count: number
  trait: TraitId
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
    return { entity: option(ENTITIES, group.entity, `${path}[${i}].entity`), count, trait: option(TRAITS, group.trait, `${path}[${i}].trait`) }
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
