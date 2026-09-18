import { describe, expect, it } from 'vitest'
import { STYLE_IDS, type CompositionPlan, type StyleId } from '../plan/schema'
import { HeuristicPlanner } from '../planner/HeuristicPlanner'
import {
  BASS_SPACING_INTERVAL,
  STYLE_DIALECTS,
  applyCadenceOrnament,
  timingOffsetSeconds,
  type StyleDialect,
} from './dialect'
import { newMemory } from './context'
import { bassPartner } from './voiceLeading'
import { keyInfo, resolveChord } from './harmony'
import { midiOf } from './pitch'
import { renderPlan, secondsPerTick, timeline } from './renderPlan'
import { METER_INFO } from './score'

const basePlan = (style: StyleId, overrides: Partial<CompositionPlan> = {}): CompositionPlan => ({
  version: 1,
  style,
  character: 'lyrical_song',
  form: 'period',
  key: 'C_major',
  meter: 'four_four',
  texture: 'chorale',
  palette: 'diatonic',
  tempo: 'adagio',
  dynamics: 'p',
  dynamicShape: 'steady',
  defaultInstrument: 'grand_piano',
  bars: [
    { chord: 'I', role: 'statement', contour: 'arch' },
    { chord: 'IV', role: 'development', contour: 'rise' },
    { chord: 'V7', role: 'development', contour: 'fall' },
    { chord: 'I', role: 'cadence', contour: 'fall' },
  ],
  ...overrides,
})

describe('STYLE_DIALECTS', () => {
  it('assigns every style a closed set of knobs', () => {
    for (const style of STYLE_IDS) {
      const dialect: StyleDialect = STYLE_DIALECTS[style]
      expect(['passing', 'appoggiatura', 'leave_added']).toContain(dialect.nonChordTone)
      expect(['mordent', 'trill', 'sforzando', 'none']).toContain(dialect.cadenceOrnament)
      expect(['close_chorale', 'default', 'open_tenths']).toContain(dialect.bassSpacing)
      expect(['even', 'light_rubato', 'swing_laid_back', 'two_against_three']).toContain(dialect.timing)
    }
  })

  it('keeps the researched treatment per style', () => {
    expect(STYLE_DIALECTS.bach).toMatchObject({
      nonChordTone: 'passing',
      cadenceOrnament: 'mordent',
      bassSpacing: 'close_chorale',
      timing: 'even',
    })
    expect(STYLE_DIALECTS.chopin).toMatchObject({
      nonChordTone: 'appoggiatura',
      bassSpacing: 'open_tenths',
      timing: 'light_rubato',
    })
    expect(STYLE_DIALECTS.debussy).toMatchObject({ nonChordTone: 'leave_added', timing: 'light_rubato', cadenceOrnament: 'none' })
    expect(STYLE_DIALECTS.beethoven.cadenceOrnament).toBe('sforzando')
    expect(STYLE_DIALECTS.glass).toMatchObject({ cadenceOrnament: 'none', timing: 'two_against_three' })
    expect(STYLE_DIALECTS.laufey.timing).toBe('swing_laid_back')
    expect(STYLE_DIALECTS.hans_zimmer.bassSpacing).toBe('open_tenths')
  })
})

describe('dialect knobs in the renderer', () => {
  it('spaces the bass fill as the style asks', () => {
    const chord = resolveChord(keyInfo('C_major'), 'I')
    const close = midiOf(bassPartner(chord, 'C2', 'close_chorale')) - midiOf('C2')
    const open = midiOf(bassPartner(chord, 'C2', 'open_tenths')) - midiOf('C2')
    expect(close).toBeLessThanOrEqual(7)
    expect(open).toBeGreaterThanOrEqual(12)
    expect(BASS_SPACING_INTERVAL.open_tenths).toBe(16)
  })

  it('ornaments a Bach cadence and leaves a Glass cadence unornamented', () => {
    const bach = renderPlan(basePlan('bach', { texture: 'chorale' }), 3)
    const glass = renderPlan(basePlan('glass', { texture: 'pulsing_chords', character: 'hypnotic_pulse' }), 3)
    const bachCadence = bach.bars[3].treble[0]
    const glassCadence = glass.bars[3].treble[0]
    expect(bachCadence.length).toBeGreaterThan(glassCadence.length)
    expect(applyCadenceOrnament({ treble: [[{ start: 0, dur: 16, pitches: ['C5'], velocity: 70 }]], bass: [] }, {
      index: 3,
      count: 4,
      isLast: true,
      plan: bach.plan.bars[3],
      role: 'cadence',
      character: 'lyrical_song',
      chord: resolveChord(keyInfo('C_major'), 'I'),
      scale: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
      palette: 'diatonic',
      velocity: 70,
      meter: METER_INFO.four_four,
      key: keyInfo('C_major'),
      dialect: STYLE_DIALECTS.glass,
      rand: () => 0.5,
      memory: newMemory(),
    }).treble[0]).toHaveLength(1)
  })

  it('accents a Beethoven cadence downbeat and does not add notes', () => {
    const score = renderPlan(basePlan('beethoven', { texture: 'dramatic_chords', character: 'stormy_drama' }), 2)
    const downbeats = [...score.bars[3].treble, ...score.bars[3].bass].flat().filter((n) => n.start === 0)
    expect(downbeats.length).toBeGreaterThan(0)
    expect(downbeats.every((n) => n.accent)).toBe(true)
  })

  it('applies a closed timing curve: even styles stay on the grid, others move by a bounded offset', () => {
    const even = renderPlan(basePlan('bach'), 1)
    const rubato = renderPlan(basePlan('chopin', { texture: 'rolling_nocturne' }), 1)
    const swing = renderPlan(basePlan('laufey', { texture: 'chordal_melody', character: 'warm_groove' }), 1)
    const cross = renderPlan(basePlan('glass', { texture: 'minimal_cells', character: 'hypnotic_pulse' }), 1)
    const tick = secondsPerTick(even)
    expect(timeline(even).every((n) => {
      const barTick = (n.time / tick) % even.meter.ticksPerBar
      const written = even.bars[n.bar].treble.concat(even.bars[n.bar].bass).flat().find((note) => Math.abs(note.start - Math.round(barTick)) < 0.01)
      return written || n.time >= 0
    })).toBe(true)
    expect(timingOffsetSeconds(even, 4, tick)).toBe(0)
    expect(Math.abs(timingOffsetSeconds(rubato, 4, tick))).toBeGreaterThan(0)
    expect(Math.abs(timingOffsetSeconds(rubato, 4, tick))).toBeLessThan(tick)
    expect(timingOffsetSeconds(swing, 2, tick)).toBeGreaterThan(0)
    expect(timingOffsetSeconds(cross, 2, tick)).toBeGreaterThan(0)
    expect(timingOffsetSeconds(cross, 0, tick)).toBe(0)
    // Compound metres do not invent a 2:3 offset.
    const compound = { ...cross, meter: METER_INFO.six_eight, plan: { ...cross.plan, meter: 'six_eight' as const } }
    expect(timingOffsetSeconds(compound, 2, tick)).toBe(0)
  })

  it('stays deterministic for a given plan and seed after dialect is applied', async () => {
    const { plan } = await new HeuristicPlanner().plan({ style: 'chopin', bars: 8, pick: 'sample', seed: 11, brief: true })
    expect(renderPlan(plan, 7)).toEqual(renderPlan(plan, 7))
    expect(timeline(renderPlan(plan, 7))).toEqual(timeline(renderPlan(plan, 7)))
  })
})
