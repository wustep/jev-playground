import { describe, expect, it } from 'vitest'
import { STYLE_IDS, parsePlan, type CompositionPlan, type StyleId } from '../plan/schema'
import { STYLE_PROFILES } from '../plan/styles'
import { rootDegree } from '../render/harmony'
import { renderPlan } from '../render/renderPlan'
import { HeuristicPlanner, shadowExchanges } from './HeuristicPlanner'
import { JevPlanner, type JevTransport } from './JevPlanner'
import { approachOptionsFor, asksApproach, buildRequest, describePlan, parseOp } from './jev/requests'
import type { Answer, SystemOneRequest, SystemOneResponse } from './jev/systemOne'

const isMinor = (key: string) => key.endsWith('_minor')

describe('variable harmonic rhythm (heuristic)', () => {
  const planner = new HeuristicPlanner()

  it('parses chord2 in and out of JSON, treating null as absent', () => {
    const base = { version: 1, style: 'bach', character: 'solemn_hymn', form: 'period', key: 'C_major', meter: 'four_four', texture: 'chorale', palette: 'diatonic', tempo: 'andante', dynamics: 'mf', dynamicShape: 'steady', defaultInstrument: 'grand_piano' }
    const bars = [
      { chord: 'I', role: 'statement', contour: 'arch' },
      { chord: 'ii65', chord2: 'V7', role: 'development', contour: 'rise' },
      { chord: 'I', chord2: null, role: 'restatement', contour: 'fall' },
      { chord: 'I', role: 'cadence', contour: 'fall' },
    ]
    const plan = parsePlan({ ...base, bars })
    expect(plan.bars[1].chord2).toBe('V7')
    expect('chord2' in plan.bars[2]).toBe(false)
    expect(parsePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan)
    expect(() => parsePlan({ ...base, bars: [{ ...bars[0], chord2: 'H7' }, bars[1], bars[2], bars[3]] })).toThrow(/chord2/)
  })

  it('splits cadence bars in the styles whose books have splits — approach first, arrival second, never the last bar', async () => {
    const withSplits = STYLE_IDS.filter((style) => STYLE_PROFILES[style].harmony.major.splits.length > 0)
    expect(withSplits).toEqual(expect.arrayContaining(['bach', 'beethoven', 'chopin', 'laufey']))
    for (const style of STYLE_IDS) {
      let split = 0
      let bars = 0
      for (let seed = 1; seed <= 40; seed++) {
        const { plan } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        expect(parsePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan)
        const book = STYLE_PROFILES[style].harmony[isMinor(plan.key) ? 'minor' : 'major']
        expect(plan.bars[plan.bars.length - 1].chord2).toBeUndefined()
        plan.bars.forEach((bar, i) => {
          bars++
          if (!bar.chord2) return
          split++
          expect(book.splits.map(([approach, arrival]) => `${approach} ${arrival}`)).toContain(`${bar.chord} ${bar.chord2}`)
          expect(rootDegree(bar.chord)).not.toBe(rootDegree(bar.chord2))
          // A split bar closes or leads into a phrase ending: bar 3 or 4 of its four-bar slot.
          expect(i % 4).toBeGreaterThanOrEqual(2)
        })
        renderPlan(plan, seed)
      }
      const rate = split / bars
      const hasSplits = STYLE_PROFILES[style].harmony.major.splits.length > 0
      // Cadence-driven styles split about one bar in twelve; the vamp and haze styles less, the drone styles never.
      if (['bach', 'beethoven', 'chopin', 'laufey'].includes(style)) expect(rate, `${style} split rate`).toBeGreaterThan(0.05)
      else if (hasSplits) expect(rate, `${style} split rate`).toBeGreaterThan(0.01)
      else expect(rate, `${style} split rate`).toBe(0)
    }
  })

  it('actually holds harmony across bars where the style holds', async () => {
    const heldRate = async (style: StyleId) => {
      let held = 0
      let pairs = 0
      for (let seed = 1; seed <= 40; seed++) {
        const { plan } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        plan.bars.forEach((bar, i) => {
          if (i === 0) return
          pairs++
          if (bar.chord === plan.bars[i - 1].chord && !plan.bars[i - 1].chord2) held++
        })
      }
      return held / pairs
    }
    const rates = Object.fromEntries(await Promise.all(STYLE_IDS.map(async (style) => [style, await heldRate(style)])))
    for (const style of STYLE_IDS) {
      if (STYLE_PROFILES[style].holds) expect(rates[style], `${style} held bars`).toBeGreaterThan(0.06)
      else expect(rates[style], `${style} held bars`).toBeLessThan(0.03)
    }
    // Drone and cycle styles hold most.
    expect(rates.glass).toBeGreaterThan(0.2)
    expect(rates.hans_zimmer).toBeGreaterThan(0.15)
    expect(rates.beethoven).toBeGreaterThan(rates.bach)
  })

  it('reports chord2 in the trace and the shadow requests', async () => {
    const { plan, trace } = await planner.plan({ style: 'bach', bars: 8, pick: 'argmax', seed: 1, brief: true })
    const split = plan.bars.findIndex((bar) => bar.chord2)
    expect(split).toBeGreaterThan(0)
    expect(trace.decisions.find((d) => d.field === `bars[${split}].chord2`)?.choice).toBe(plan.bars[split].chord2)
    const later = shadowExchanges(plan, true)[2 + split + 1].op
    expect(later.op === 'bar' && later.chord2s?.[split]).toBe(plan.bars[split].chord2)
  })
})

describe('variable harmonic rhythm (Jev)', () => {
  function fakeJev(prefer: Record<string, string> = {}) {
    const seen: SystemOneRequest[] = []
    const transport: JevTransport = async (op) => {
      const request = buildRequest(op, 'jev-latest')
      seen.push(request)
      const answers: Record<string, Answer> = {}
      for (const [id, question] of Object.entries(request.questions)) {
        if (question.type === 'choice') {
          const options = Object.keys(question.criteria)
          const favourite = prefer[id] ?? options[0]
          const rest = 0.2 / (options.length - 1)
          answers[id] = { type: 'choice', choice: favourite, confidence: 0.8, probabilities: Object.fromEntries(options.map((option) => [option, option === favourite ? 0.8 : rest])) }
        } else if (question.type === 'noul') answers[id] = { type: 'noul', noul: 0.2 }
        else answers[id] = { type: 'score', score: 1, legend: {}, probabilities: { '0': 0.2, '1': 0.6, '2': 0.2 }, confidence: 0.5 }
      }
      const response: SystemOneResponse = { model: 'jev-1.13.0', answers, usage: { input_tokens: 10, output_tokens: 0 } }
      return response
    }
    return { transport, seen }
  }

  it('asks for an approach only on cadence-bound bars, in the same request, and offers none first', () => {
    const roles = ['statement', 'development', 'climax', 'cadence'] as const
    expect([0, 1, 2, 3].map((i) => asksApproach(roles, i))).toEqual([false, false, true, false])
    expect(asksApproach(['statement', 'development', 'development', 'half_cadence', 'restatement', 'development', 'climax', 'cadence'], 3)).toBe(true)
    const options = approachOptionsFor('C_major')
    expect(Object.keys(options)[0]).toBe('none')
    expect(options).toHaveProperty('I64')
    expect(options).not.toHaveProperty('i64')
    expect(approachOptionsFor('A_minor')).toHaveProperty('i64')
    expect(approachOptionsFor('A_minor')).not.toHaveProperty('ii65')
    const globals = { character: 'solemn_hymn', form: 'period', key: 'C_major', meter: 'four_four', texture: 'chorale', palette: 'diatonic', tempo: 'andante', dynamics: 'mf', dynamicShape: 'steady', defaultInstrument: 'grand_piano' } as const
    const asked = buildRequest({ op: 'bar', style: 'bach', brief: false, globals, roles: [...roles], chords: ['I', 'V7'], index: 2 }, 'jev-latest')
    expect(Object.keys(asked.questions)).toEqual(['chord', 'contour', 'approach'])
    const notAsked = buildRequest({ op: 'bar', style: 'bach', brief: false, globals, roles: [...roles], chords: ['I'], index: 1 }, 'jev-latest')
    expect(Object.keys(notAsked.questions)).toEqual(['chord', 'contour'])
    // Earlier split bars are described in state; the last bar is never asked.
    const state = buildRequest({ op: 'bar', style: 'bach', brief: false, globals, roles: [...roles], chords: ['I', 'V7', 'ii65'], chord2s: [null, null, 'V7'], index: 3 }, 'jev-latest').state as { bars: { chord: string }[] }
    expect(state.bars[2].chord).toContain('second half of the bar: V7')
    expect(asksApproach([...roles], 3)).toBe(false)
  })

  it('splits the bar when Jev names an approach on another root, and keeps one harmony otherwise', async () => {
    const split = await new JevPlanner(fakeJev({ form: 'period', key: 'C_major', chord: 'V7', approach: 'ii65' }).transport).plan({ style: 'bach', bars: 8, pick: 'argmax', seed: 1, brief: false })
    expect(split.plan.bars[7].chord2).toBeUndefined()
    const cadenceBound = split.plan.bars.filter((bar, i) => i < 7 && (bar.role === 'half_cadence' || split.plan.bars[i + 1].role === 'cadence'))
    expect(cadenceBound.length).toBeGreaterThan(0)
    for (const bar of cadenceBound) expect(bar).toMatchObject({ chord: 'ii65', chord2: 'V7' })
    expect(split.plan.bars.filter((bar) => bar.chord2).length).toBe(cadenceBound.length)
    expect(split.trace.requests).toBe(10)
    expect(parsePlan(split.plan)).toEqual(split.plan)
    renderPlan(split.plan, 1)

    const none = await new JevPlanner(fakeJev({ form: 'period', key: 'C_major', chord: 'V7', approach: 'none' }).transport).plan({ style: 'bach', bars: 8, pick: 'argmax', seed: 1, brief: false })
    expect(none.plan.bars.every((bar) => !bar.chord2)).toBe(true)
    // An approach on the same root as the arrival is the same harmony: no split.
    const sameRoot = await new JevPlanner(fakeJev({ form: 'period', key: 'C_major', chord: 'V7', approach: 'V7_of_V' }).transport).plan({ style: 'bach', bars: 8, pick: 'argmax', seed: 1, brief: false })
    expect(sameRoot.plan.bars.some((bar) => bar.chord === 'V7_of_V' && bar.chord2 === 'V7')).toBe(true)
    const tonicArrival = await new JevPlanner(fakeJev({ form: 'period', key: 'C_major', chord: 'I', approach: 'I64' }).transport).plan({ style: 'bach', bars: 8, pick: 'argmax', seed: 1, brief: false })
    expect(tonicArrival.plan.bars.every((bar) => !bar.chord2)).toBe(true)
  })

  it('validates chord2s in bar ops and describes them for the scorer', () => {
    const globals = { character: 'solemn_hymn', form: 'period', key: 'C_major', meter: 'four_four', texture: 'chorale', palette: 'diatonic', tempo: 'andante', dynamics: 'mf', dynamicShape: 'steady', defaultInstrument: 'grand_piano' }
    const roles = ['statement', 'development', 'climax', 'cadence']
    expect(parseOp({ op: 'bar', style: 'bach', globals, roles, chords: ['I', 'ii65'], chord2s: [null, 'V7'], index: 2 })).toMatchObject({ chord2s: [null, 'V7'] })
    expect(parseOp({ op: 'bar', style: 'bach', globals, roles, chords: ['I'], index: 1 })).not.toHaveProperty('chord2s')
    expect(() => parseOp({ op: 'bar', style: 'bach', globals, roles, chords: ['I'], chord2s: [], index: 1 })).toThrow(/chord2s/)
    expect(() => parseOp({ op: 'bar', style: 'bach', globals, roles, chords: ['I'], chord2s: ['H7'], index: 1 })).toThrow(/chord2s/)
    const plan: CompositionPlan = { version: 1, style: 'bach', ...globals, bars: [{ chord: 'I', role: 'statement', contour: 'arch' }, { chord: 'ii65', chord2: 'V7', role: 'development', contour: 'rise' }, { chord: 'I', role: 'climax', contour: 'arch' }, { chord: 'I', role: 'cadence', contour: 'fall' }] } as CompositionPlan
    const described = describePlan(plan) as { bars: { chord: string }[] }
    expect(described.bars[1].chord).toContain('ii65')
    expect(described.bars[1].chord).toContain('second half of the bar: V7')
    expect(described.bars[0].chord).not.toContain('second half')
  })
})
