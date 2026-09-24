import { describe, expect, it } from 'vitest'
import { STYLE_IDS, parsePlan, type CompositionPlan, type StyleId } from '../plan/schema'
import { STYLE_PROFILES } from '../plan/styles'
import { rootDegree } from '../render/harmony'
import { renderPlan } from '../render/renderPlan'
import { HeuristicPlanner, shadowExchanges } from './HeuristicPlanner'
import { JevPlanner, type JevTransport } from './JevPlanner'
import { buildRequest, describePlan, parseOp } from './jev/requests'
import type { Answer, SystemOneRequest, SystemOneResponse } from './jev/systemOne'

const isMinor = (key: string) => key.endsWith('_minor')

describe('variable harmonic rhythm (heuristic)', () => {
  const planner = new HeuristicPlanner()

  it('parses chord2 in and out of JSON, treating null as absent', () => {
    const base = { version: 2, style: 'bach', register: 'mid', motion: 'walking', accompaniment: 'sustained', form: 'period', key: 'C_major', meter: 'four_four', palette: 'diatonic', tempo: 'andante', dynamics: 'mf', dynamicShape: 'steady' }
    const bars = [
      { chord: 'I', contour: 'arch' },
      { chord: 'ii65', chord2: 'V7', contour: 'rise' },
      { chord: 'I', chord2: null, contour: 'fall' },
      { chord: 'I', contour: 'fall' },
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
    expect(rates.glass).toBeGreaterThan(0.1)
    expect(rates.hans_zimmer).toBeGreaterThan(0.1)
    expect(rates.beethoven).toBeGreaterThan(rates.bach)
  })

  it('reports chord2 in the trace and shadows one phrase request per slot', async () => {
    // Whether a given seed's chords meet a book split is incidental; that a
    // split, when it happens, is traced is not.
    let found: Awaited<ReturnType<typeof planner.plan>> | undefined
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const result = await planner.plan({ style: 'bach', bars: 8, pick: 'sample', seed, brief: true })
      if (result.plan.bars.some((bar) => bar.chord2)) found = result
    }
    expect(found, 'bach splits some cadence bar within twenty seeds').toBeDefined()
    const { plan, trace } = found!
    const split = plan.bars.findIndex((bar) => bar.chord2)
    expect(trace.decisions.find((d) => d.field === `bars[${split}].chord2`)?.choice).toBe(plan.bars[split].chord2)
    const shadows = shadowExchanges(plan, true)
    // One globals fan-out, then one phrase request per four-bar slot.
    expect(shadows).toHaveLength(3)
    expect(shadows[0].op.op).toBe('globals')
    expect(shadows.slice(1).every((exchange) => exchange.op.op === 'phrase')).toBe(true)
    expect(shadows[2].op.op === 'phrase' && shadows[2].op.chords).toHaveLength(4)
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

  it('lets Jev pick book phrases and applies cadence splits in code', async () => {
    const { plan, trace } = await new JevPlanner(fakeJev({ form: 'period', key: 'C_major' }).transport).plan({ style: 'bach', bars: 8, pick: 'argmax', seed: 1, brief: false })
    expect(trace.requests).toBe(3)
    expect(plan.bars).toHaveLength(8)
    expect(parsePlan(plan)).toEqual(plan)
    renderPlan(plan, 1)
    // Book splits land on a cadence-bound bar; the last bar is never split.
    expect(plan.bars[7].chord2).toBeUndefined()
    const split = plan.bars.find((bar) => bar.chord2)
    if (split) expect(split.chord).not.toBe(split.chord2)
  })

  it('validates phrase ops and describes a split bar for the scorer', () => {
    const globals = { register: 'mid', motion: 'walking', accompaniment: 'sustained', form: 'period', key: 'C_major', meter: 'four_four', palette: 'diatonic', tempo: 'andante', dynamics: 'mf', dynamicShape: 'steady' }
    const ok = { op: 'phrase', style: 'bach', globals, barCount: 8, slotIndex: 1, chords: ['I', 'ii65', 'V7', 'I'], contours: ['arch', 'rise', 'fall', 'fall'] }
    expect(parseOp(ok)).toMatchObject({ op: 'phrase', slotIndex: 1 })
    expect(() => parseOp({ ...ok, slotIndex: 9 })).toThrow(/slotIndex/)
    expect(() => parseOp({ ...ok, chords: ['I'] })).toThrow(/chords/)
    expect(() => parseOp({ ...ok, contours: ['arch'] })).toThrow(/contours/)
    expect(() => parseOp({ ...ok, barCount: 7 })).toThrow(/barCount/)
    expect(() => parseOp({ ...ok, chords: ['I', 'ii65', 'V7', 'H7'] })).toThrow(/chords/)

    const plan: CompositionPlan = { version: 2, style: 'bach', ...globals, bars: [{ chord: 'I', contour: 'arch' }, { chord: 'ii65', chord2: 'V7', contour: 'rise' }, { chord: 'I', contour: 'arch' }, { chord: 'I', contour: 'fall' }] } as CompositionPlan
    const described = describePlan(plan) as { bars: { chord: string }[] }
    expect(described.bars[1].chord).toContain('ii65')
    expect(described.bars[1].chord).toContain('second half of the bar: V7')
    expect(described.bars[0].chord).not.toContain('second half')
  })
})
