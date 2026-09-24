import { describe, expect, it } from 'vitest'
import {
  ACCOMPANIMENTS,
  ACCOMPANIMENT_IDS,
  BAR_COUNT_VALUES,
  GLOBAL_FIELDS,
  GLOBAL_FIELD_IDS,
  MOTIONS,
  MOTION_IDS,
  MOTION_RATE,
  REGISTERS,
  REGISTER_IDS,
  REGISTER_RANGE,
  TEMPOS,
  TEMPO_BPM,
  TEMPO_IDS,
  parseGlobals,
  parsePlan,
} from './schema'

const bars = [
  { chord: 'I', contour: 'arch' },
  { chord: 'V', contour: 'rise' },
  { chord: 'V7', contour: 'fall' },
  { chord: 'I', contour: 'fall' },
]

const base = {
  version: 2,
  style: 'chopin',
  register: 'high',
  motion: 'flowing',
  accompaniment: 'broken',
  form: 'period',
  key: 'Db_major',
  meter: 'twelve_eight',
  palette: 'chromatic_approach',
  tempo: 'adagio',
  dynamics: 'p',
  dynamicShape: 'arch',
  bars,
}

describe('TEMPOS', () => {
  it('lists slow → fast, matching TEMPO_BPM', () => {
    expect(TEMPO_IDS).toEqual(['larghissimo', 'grave', 'largo', 'larghetto', 'adagio', 'andante', 'moderato', 'allegro', 'vivace', 'presto', 'prestissimo'])
    const bpms = TEMPO_IDS.map((id) => TEMPO_BPM[id])
    expect(bpms).toEqual([...bpms].sort((a, b) => a - b))
    expect(Object.keys(TEMPOS)).toEqual(TEMPO_IDS)
  })
})

describe('the singing-line fields', () => {
  it('are the three the old schema could not say, and lead the fan-out', () => {
    expect(GLOBAL_FIELD_IDS.slice(0, 3)).toEqual(['register', 'motion', 'accompaniment'])
    expect(GLOBAL_FIELDS.register).toBe(REGISTERS)
    expect(GLOBAL_FIELDS.motion).toBe(MOTIONS)
    expect(GLOBAL_FIELDS.accompaniment).toBe(ACCOMPANIMENTS)
  })

  it('gives every register a window, low to high, overlapping but distinct', () => {
    expect(REGISTER_IDS).toEqual(['low', 'mid', 'high'])
    const ranges = REGISTER_IDS.map((id) => REGISTER_RANGE[id])
    for (const [lo, hi] of ranges) expect(hi).toBeGreaterThan(lo)
    for (let k = 1; k < ranges.length; k++) {
      expect(ranges[k][0], 'each register starts above the last').toBeGreaterThan(ranges[k - 1][0])
      expect(ranges[k][1]).toBeGreaterThan(ranges[k - 1][1])
    }
  })

  it('orders motion strictly by attacks per beat', () => {
    expect(MOTION_IDS).toEqual(['sustained', 'walking', 'flowing', 'florid'])
    const rates = MOTION_IDS.map((id) => MOTION_RATE[id])
    expect(rates).toEqual([...rates].sort((a, b) => a - b))
    expect(new Set(rates).size).toBe(rates.length)
  })

  it('keeps five accompaniment patterns, of which only counterline is a peer', () => {
    expect(ACCOMPANIMENT_IDS).toEqual(['sustained', 'broken', 'pulse', 'stride', 'counterline'])
  })
})

describe('the schema only carries what changes notes', () => {
  it('has dropped the labels that measurably did not', () => {
    for (const dead of ['character', 'texture', 'arrangement', 'opening', 'pedal', 'phrasing', 'hookBars', 'defaultInstrument']) {
      expect(GLOBAL_FIELD_IDS as readonly string[], `${dead} should be gone`).not.toContain(dead)
    }
  })

  it('no longer lets a bar carry a role that could contradict its form', () => {
    const parsed = parsePlan({ ...base, bars: bars.map((bar) => ({ ...bar, role: 'climax' })) })
    for (const bar of parsed.bars) expect(bar).not.toHaveProperty('role')
  })
})

describe('parsePlan', () => {
  it('round-trips a well-formed plan and rejects a bad label', () => {
    const parsed = parsePlan(base)
    expect(parsed.version).toBe(2)
    expect(parsed.register).toBe('high')
    expect(parsed.motion).toBe('flowing')
    expect(parsed.accompaniment).toBe('broken')
    expect(() => parsePlan({ ...base, register: 'middle' })).toThrow(/register/)
    expect(() => parsePlan({ ...base, motion: 'brisk' })).toThrow(/motion/)
    expect(() => parsePlan({ ...base, accompaniment: 'alberti' })).toThrow(/accompaniment/)
  })

  it('requires the singing-line fields rather than defaulting them', () => {
    const { register: _register, ...withoutRegister } = base
    expect(() => parseGlobals(withoutRegister)).toThrow(/register/)
  })

  it('accepts 64-bar plans and rejects lengths outside BAR_COUNT_VALUES', () => {
    expect(BAR_COUNT_VALUES).toEqual([4, 8, 16, 32, 64])
    expect(parsePlan({ ...base, bars: Array.from({ length: 64 }, () => bars[0]) }).bars).toHaveLength(64)
    expect(() => parsePlan({ ...base, bars: Array.from({ length: 48 }, () => bars[0]) })).toThrow(/4, 8, 16, 32, 64/)
  })

  it('takes an optional second harmony for the second half of a bar', () => {
    const parsed = parsePlan({ ...base, bars: [{ chord: 'I64', chord2: 'V7', contour: 'arch' }, ...bars.slice(1)] })
    expect(parsed.bars[0].chord2).toBe('V7')
    expect(parsed.bars[1].chord2).toBeUndefined()
  })
})
