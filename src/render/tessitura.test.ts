import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { scoreMetrics } from '../compare/compareMetrics'
import { parsePlan, type CompositionPlan } from '../plan/schema'
import { HeuristicPlanner } from '../planner/HeuristicPlanner'
import { midiOf } from './pitch'
import { lastSoundingMidi, realizeJevGuideChoices } from './jevNotes'
import { renderPlan } from './renderPlan'
import type { Voice } from './score'
import { guideSpelling, melodyTessitura } from './tessitura'

function referencePlan(file: string): CompositionPlan {
  const raw = JSON.parse(readFileSync(resolve('docs/fable-context/reference-plans', file), 'utf8')) as { plan: unknown }
  return parsePlan(raw.plan)
}

function melodyMean(plan: CompositionPlan, seed = 1): number {
  return scoreMetrics(renderPlan(plan, seed)).registerMean
}

/** Mean MIDI of a Guide line that walks to the third, bar after bar. */
function guideLine(plan: CompositionPlan): { mean: number; pitches: string } {
  let last: number | undefined
  let lastNotes: Voice | undefined
  const midis: number[] = []
  const pitches: string[] = []
  for (let i = 0; i < plan.bars.length; i++) {
    const phrase = realizeJevGuideChoices({ figure: 'step_to_goal', goal: 'third' }, plan, {
      barIndex: i,
      lastSoundingMidi: last,
      lastNotes,
      voiceLead: true,
    })
    for (const note of phrase.notes) {
      midis.push(midiOf(note.pitches[0]))
      pitches.push(note.pitches[0])
    }
    last = lastSoundingMidi(phrase.notes)
    lastNotes = phrase.notes
  }
  return { mean: midis.reduce((sum, midi) => sum + midi, 0) / midis.length, pitches: pitches.join(' ') }
}

function sungPitches(plan: CompositionPlan, seed = 1): string {
  return JSON.stringify(renderPlan(plan, seed).bars.map((bar) => bar.treble[0]?.map((note) => note.pitches)))
}

describe('plan-controlled melody register', () => {
  const beethoven = referencePlan('beethoven-op13-pathetique-ii.json')
  const chopin = referencePlan('chopin-op9-2-nocturne.json')

  it('maps a slow singing texture low and leaves the nocturne roll on its baked window', () => {
    expect(melodyTessitura(beethoven)).toBe('low')
    expect(melodyTessitura(chopin)).toBe('mid')
    // Chopin's lyrical argmax tempo is adagio; the roll still must not drop.
    expect(melodyTessitura({ ...chopin, tempo: 'adagio' })).toBe('mid')
    expect(melodyTessitura({ ...beethoven, character: 'stormy_drama' })).toBe('high')
    expect(melodyTessitura({ ...beethoven, character: 'flowing_perpetual' })).toBe('mid')
    expect(guideSpelling('low').aim).toBe(62)
    expect(guideSpelling('mid')).toEqual({ lo: 55, hi: 84, aim: 67 })
  })

  it('moves the Adagio line toward MIDI 62 and keeps Chopin on 76.4', async () => {
    const adagio = melodyMean(beethoven)
    expect(adagio).toBeGreaterThanOrEqual(61)
    expect(adagio).toBeLessThanOrEqual(64)
    expect(Math.abs(adagio - 62)).toBeLessThan(Math.abs(adagio - 76))

    // 8-bar reference sketch. Its baked roll already sits just under the MIDI mean.
    const nocturne = melodyMean(chopin)
    expect(nocturne).toBeGreaterThanOrEqual(73)
    expect(nocturne).toBeLessThanOrEqual(75)

    const { plan } = await new HeuristicPlanner().plan({ style: 'chopin', bars: 16, pick: 'argmax', seed: 1, brief: true })
    const argmax = melodyMean(plan, 1)
    expect(argmax).toBeCloseTo(76.4, 1)
    expect(Math.abs(argmax - 76.5)).toBeLessThan(0.5)
  })

  it('changes sounding melody notes when the character label changes', () => {
    const lyrical = melodyMean(beethoven)
    const stormy = melodyMean({ ...beethoven, character: 'stormy_drama' })
    const flowing = melodyMean({ ...beethoven, character: 'flowing_perpetual' })
    expect(sungPitches(beethoven)).not.toBe(sungPitches({ ...beethoven, character: 'stormy_drama' }))
    expect(sungPitches(beethoven)).not.toBe(sungPitches({ ...beethoven, character: 'flowing_perpetual' }))
    expect(stormy).toBeGreaterThan(lyrical + 7)
    expect(flowing).toBeGreaterThan(lyrical + 7)

    const nocturne = melodyMean(chopin)
    const forceful = melodyMean({ ...chopin, character: 'heroic_bright' })
    expect(sungPitches(chopin)).not.toBe(sungPitches({ ...chopin, character: 'heroic_bright' }))
    expect(forceful).toBeGreaterThan(nocturne + 3)
  })

  it('spells the Guide line in that same tessitura', () => {
    const adagio = guideLine(beethoven)
    const nocturne = guideLine(chopin)
    const storm = guideLine({ ...beethoven, character: 'stormy_drama' })
    const mid = guideLine({ ...beethoven, tempo: 'andante' })

    expect(adagio.mean).toBeGreaterThanOrEqual(57)
    expect(adagio.mean).toBeLessThanOrEqual(63)
    expect(Math.abs(adagio.mean - 62)).toBeLessThan(Math.abs(mid.mean - 62))
    expect(adagio.pitches).not.toBe(storm.pitches)
    expect(adagio.pitches).not.toBe(mid.pitches)
    expect(storm.mean).toBeGreaterThan(adagio.mean + 5)

    // Mid spelling is the historical treble window, so the nocturne Guide line stays up.
    expect(nocturne.mean).toBeGreaterThan(adagio.mean + 3)
    expect(nocturne.mean).toBeGreaterThanOrEqual(63)
    expect(nocturne.mean).toBeLessThanOrEqual(70)
  })
})
