import { describe, expect, it } from 'vitest'
import type { Answer } from '../planner/jev/systemOne'
import { routeFor } from '../shell/route'
import { groupPhrase, scenarioText, verdictText } from './describe'
import { NO_TWIST_CHANCE, PLAIN_CHANCE, castOffline, judgeOffline, pickTraitFor, pickTwist, scenarioFromCastAnswers } from './play'
import { CLASSIC, COUNTS, ENTITIES, ENTITY_IDS, THEME_IDS, TRAIT_IDS, TWISTS, TWIST_IDS, parseScenario, swapTracks, traitFits, traitsFor } from './schema'

describe('routes', () => {
  it('maps the three public paths, with or without a trailing slash', () => {
    expect(routeFor('/')).toBe('landing')
    expect(routeFor('/music')).toBe('music')
    expect(routeFor('/music/')).toBe('music')
    expect(routeFor('/trolley/')).toBe('trolley')
    expect(routeFor('/Trolley/anything')).toBe('trolley')
    expect(routeFor('/nope')).toBe('landing')
  })
})

describe('trolley sentences are written by code', () => {
  it('renders counts, traits and twists', () => {
    expect(groupPhrase({ entity: 'dog', count: 1, trait: 'plain' })).toBe('a very good dog')
    expect(groupPhrase({ entity: 'stranger', count: 5, trait: 'asleep' })).toBe('5 strangers, fast asleep')
    expect(groupPhrase({ entity: 'your_boss', count: 1, trait: 'owes_you_money' })).toBe('your boss, who owes you money')
    const text = scenarioText({ ...CLASSIC, twist: 'lever_is_sticky' })
    expect(text).toContain('heading straight for 5 strangers')
    expect(text).toContain('toward a stranger')
    expect(text).toContain('sticky')
    expect(verdictText('pull_lever', 0.9)).toMatch(/^Pull the lever/)
  })

  it('uses one set of words for the dropdown, the prose and what Jev is told', () => {
    expect(ENTITIES.stranger).toBe('A stranger')
    expect(ENTITIES.last_pizza).toBe('The last pizza on Earth')
    expect(groupPhrase({ entity: 'last_pizza', count: 3, trait: 'plain' })).toBe('3 of the last pizzas on Earth')
    for (const id of ENTITY_IDS) expect(groupPhrase({ entity: id, count: 1, trait: 'plain' })).toBe(ENTITIES[id].charAt(0).toLowerCase() + ENTITIES[id].slice(1))
    expect(scenarioText({ ...CLASSIC, twist: 'livestreamed' })).toContain(TWISTS.livestreamed)
  })

  it('puts a visitor’s own entry into the prose', () => {
    const own = { entity: 'custom' as const, custom: { label: 'rubber chicken', emoji: '🐔' }, trait: 'asleep' as const }
    expect(groupPhrase({ ...own, count: 1 })).toBe('rubber chicken, fast asleep')
    expect(groupPhrase({ ...own, count: 3 })).toBe('3 × rubber chicken, fast asleep')
    expect(judgeOffline({ ...CLASSIC, siding: [{ ...own, count: 1 }] }).decision).toBe('pull_lever')
  })

  it('never describes harm', () => {
    for (const theme of THEME_IDS) {
      for (let seed = 1; seed <= 20; seed++) {
        const { scenario } = castOffline(theme, seed)
        expect(parseScenario(JSON.parse(JSON.stringify(scenario)))).toEqual(scenario)
        expect(scenarioText(scenario)).not.toMatch(/kill|die|dead|crush|blood|hit by/i)
      }
    }
  })
})

describe('offline judge', () => {
  it('pulls for five strangers against one, not the other way round, and finds the mirror case harder than a rout', () => {
    const classic = judgeOffline(CLASSIC)
    expect(classic.decision).toBe('pull_lever')
    expect(classic.pull).toBeGreaterThan(0.6)
    const reversed = judgeOffline(swapTracks(CLASSIC))
    expect(reversed.decision).toBe('do_nothing')
    const even = judgeOffline({ ...CLASSIC, siding: CLASSIC.ahead })
    expect(even.difficulty).toBeGreaterThan(judgeOffline({ ...CLASSIC, ahead: [{ entity: 'stranger', count: 100, trait: 'plain' }], siding: [{ entity: 'rubber_ducks', count: 1, trait: 'plain' }] }).difficulty)
    expect(classic.exchange.sent).toBe(false)
  })
})

describe('swap tracks', () => {
  it('exchanges the ahead and side-track casts and leaves the twist alone', () => {
    const swapped = swapTracks({
      ahead: [{ entity: 'dog', count: 2, trait: 'asleep' }],
      siding: [{ entity: 'your_boss', count: 1, trait: 'owes_you_money' }],
      twist: 'livestreamed',
    })
    expect(swapped).toEqual({
      ahead: [{ entity: 'your_boss', count: 1, trait: 'owes_you_money' }],
      siding: [{ entity: 'dog', count: 2, trait: 'asleep' }],
      twist: 'livestreamed',
    })
    expect(swapTracks(swapTracks(CLASSIC))).toEqual(CLASSIC)
  })

  it('lets the offline judge answer the swapped dilemma immediately', () => {
    const swapped = swapTracks(CLASSIC)
    const verdict = judgeOffline(swapped)
    expect(verdict.decision).toBe('do_nothing')
    expect(verdict.pull).toBeLessThan(0.5)
    expect(verdict.exchange.op).toEqual({ op: 'trolley_judge', scenario: swapped })
  })
})

describe('traits stay coherent', () => {
  it('refuses human-only details on a goldfish, and lets a phone film you', () => {
    expect(traitsFor('goldfish')).toEqual(['plain', 'asleep', 'insured'])
    expect(traitFits('goldfish', 'owes_you_money')).toBe(false)
    expect(traitFits('last_pizza', 'volunteered')).toBe(false)
    expect(traitFits('houseplant', 'filming')).toBe(false)
    expect(traitFits('your_phone', 'filming')).toBe(true)
    expect(traitFits('stranger', 'owes_you_money')).toBe(true)
    expect(traitsFor('custom')).toEqual(TRAIT_IDS)
  })

  it('skips an implausible Jev trait instead of keeping a goldfish that owes you money', () => {
    expect(pickTraitFor('goldfish', () => 0.99, { owes_you_money: 1, waving: 1 })).toBe('plain')
    expect(pickTraitFor('goldfish', () => 0.99, { owes_you_money: 1, asleep: 1 })).toBe('asleep')
    expect(pickTraitFor('goldfish', () => 0.1, { asleep: 1 })).toBe('plain')
  })

  it('never attaches a nonsense trait when drawing offline', () => {
    for (const theme of THEME_IDS) {
      for (let seed = 1; seed <= 80; seed++) {
        const { scenario } = castOffline(theme, seed)
        for (const group of [...scenario.ahead, ...scenario.siding]) {
          expect(traitFits(group.entity, group.trait), `${theme}/${seed} ${group.entity} ${group.trait}`).toBe(true)
        }
      }
    }
  })
})

describe('simpler draws are the default', () => {
  it('weights no-detail and no-twist well above a coin flip', () => {
    expect(PLAIN_CHANCE).toBeGreaterThan(0.65)
    expect(NO_TWIST_CHANCE).toBeGreaterThan(0.65)
    expect(pickTwist(() => 0.1, { livestreamed: 1 })).toBe('none')
    expect(pickTwist(() => 0.99, { livestreamed: 1 })).toBe('livestreamed')

    let plain = 0
    let groups = 0
    let none = 0
    let draws = 0
    for (const theme of THEME_IDS) {
      for (let seed = 1; seed <= 80; seed++) {
        const { scenario } = castOffline(theme, seed)
        draws++
        if (scenario.twist === 'none') none++
        for (const group of [...scenario.ahead, ...scenario.siding]) {
          groups++
          if (group.trait === 'plain') plain++
        }
      }
    }
    expect(plain / groups).toBeGreaterThan(0.6)
    expect(none / draws).toBeGreaterThan(0.6)
  })

  it('drops a Jev-cast goldfish-owes-you-money pairing when sampling answers', () => {
    const choice = (id: string, probabilities: Record<string, number>): Answer => ({
      type: 'choice',
      choice: id,
      confidence: 1,
      probabilities,
    })
    const answers: Record<string, Answer> = {
      ahead_1_entity: choice('goldfish', { goldfish: 1 }),
      ahead_1_count: choice('1', Object.fromEntries(Object.keys(COUNTS).map((id) => [id, id === '1' ? 1 : 0]))),
      ahead_1_trait: choice('owes_you_money', { owes_you_money: 1 }),
      ahead_2_entity: choice('grandma', { grandma: 1 }),
      ahead_2_count: choice('1', { '1': 1 }),
      ahead_2_trait: choice('plain', { plain: 1 }),
      siding_1_entity: choice('stranger', { stranger: 1 }),
      siding_1_count: choice('1', { '1': 1 }),
      siding_1_trait: choice('plain', { plain: 1 }),
      siding_2_entity: choice('dog', { dog: 1 }),
      siding_2_count: choice('1', { '1': 1 }),
      siding_2_trait: choice('plain', { plain: 1 }),
      twist: choice('livestreamed', Object.fromEntries(TWIST_IDS.map((id) => [id, id === 'livestreamed' ? 1 : 0]))),
    }
    for (let seed = 1; seed <= 40; seed++) {
      const scenario = scenarioFromCastAnswers(answers, seed)
      expect(scenario.ahead[0].entity).toBe('goldfish')
      expect(scenario.ahead[0].trait).not.toBe('owes_you_money')
      expect(traitFits(scenario.ahead[0].entity, scenario.ahead[0].trait)).toBe(true)
    }
  })
})
