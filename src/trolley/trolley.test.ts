import { describe, expect, it } from 'vitest'
import { routeFor } from '../shell/route'
import { groupPhrase, scenarioText, verdictText } from './describe'
import { castOffline, judgeOffline } from './play'
import { CLASSIC, THEME_IDS, parseScenario } from './schema'

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
    const reversed = judgeOffline({ ...CLASSIC, ahead: CLASSIC.siding, siding: CLASSIC.ahead })
    expect(reversed.decision).toBe('do_nothing')
    const even = judgeOffline({ ...CLASSIC, siding: CLASSIC.ahead })
    expect(even.difficulty).toBeGreaterThan(judgeOffline({ ...CLASSIC, ahead: [{ entity: 'stranger', count: 100, trait: 'plain' }], siding: [{ entity: 'rubber_ducks', count: 1, trait: 'plain' }] }).difficulty)
    expect(classic.exchange.sent).toBe(false)
  })
})
