// Per-phrase arrangement density. The planner picks one closed strategy;
// code turns it into a 0–3 level per bar from the form's slots, the roles
// and the dynamic shape. A post-pass in renderPlan then doubles or thins
// every texture the same way — so a return is not a literal copy.

import { formSlots } from '../plan/forms'
import {
  BAR_COUNT_VALUES,
  type ArrangementId,
  type BarCount,
  type CharacterId,
  type CompositionPlan,
  type StyleId,
  type TextureId,
} from '../plan/schema'
import type { BarContext } from './context'
import { nearestNote } from './pitch'
import { midiOf } from './pitch'
import type { Score, Voice } from './score'

export type ArrangementLevel = 0 | 1 | 2 | 3

export function defaultArrangement(style: StyleId, character: CharacterId): ArrangementId {
  if (character === 'flowing_perpetual') return 'constant'
  if (character === 'hypnotic_pulse' && style === 'glass') return 'terraced_blocks'
  switch (style) {
    case 'bach':
      return 'constant'
    case 'beethoven':
    case 'chopin':
    case 'laufey':
    case 'debussy':
      return 'lift_on_return'
    case 'hans_zimmer':
      return 'peak_then_bare'
    case 'glass':
      return 'terraced_blocks'
    case 'elijah_fox':
      return 'build'
  }
}

export function arrangementOf(plan: CompositionPlan): ArrangementId {
  return plan.arrangement ?? defaultArrangement(plan.style, plan.character)
}

/**
 * Zimmer vs Glass: on ostinato textures under a build / peak_then_bare,
 * keep the written figure and let `applyArrangement` add or strip a layer.
 * No new allowlist label — bound to those textures + those arrangements.
 */
const OSTINATO_TEXTURES = new Set<TextureId>(['melody_over_ostinato', 'syncopated_ostinato'])

export function keepOstinatoFigure(bar: Pick<BarContext, 'arrangementId' | 'texture'>): boolean {
  if (bar.arrangementId !== 'build' && bar.arrangementId !== 'peak_then_bare') return false
  return bar.texture == null || OSTINATO_TEXTURES.has(bar.texture)
}

/** Half-speed at 0, written at 1–2, doubled at 3 — unless the ostinato must stay put. */
export function figureStep(bar: Pick<BarContext, 'arrangement' | 'arrangementId' | 'texture'>, written: number): number {
  if (keepOstinatoFigure(bar)) return written
  if (bar.arrangement <= 0) return written * 2
  if (bar.arrangement >= 3) return Math.max(1, Math.floor(written / 2))
  return written
}

export function arrangementLevels(plan: CompositionPlan): ArrangementLevel[] {
  const n = plan.bars.length
  const strategy = arrangementOf(plan)
  const barCount = (BAR_COUNT_VALUES as readonly number[]).includes(n) ? (n as BarCount) : undefined
  const slots = barCount ? formSlots(plan.form, barCount) : []
  const firstOf = new Map<string, number>()
  slots.forEach((slot, j) => {
    if (!firstOf.has(slot.material)) firstOf.set(slot.material, j)
  })

  return plan.bars.map((bar, i) => {
    const t = n === 1 ? 0 : i / (n - 1)
    const slotIndex = Math.floor(i / 4)
    const slot = slots[slotIndex]
    let level: number
    switch (strategy) {
      case 'constant':
        level = 2
        break
      case 'build':
        level = Math.min(3, Math.floor(t * 3.99))
        break
      case 'lift_on_return': {
        const first = !slot || firstOf.get(slot.material) === slotIndex
        level = first ? 1 : 3
        break
      }
      case 'peak_then_bare':
        level = t < 0.72 ? Math.min(3, Math.floor((t / 0.72) * 3.99)) : 0
        break
      case 'terraced_blocks':
        level = slotIndex % 2 === 0 ? 1 : 2
        break
    }
    if (bar.role === 'climax') level = Math.min(3, level + 1)
    if (bar.role === 'dissolve' || bar.role === 'echo') level = Math.max(0, level - 1)
    if (plan.dynamicShape === 'late_surge' && t >= 0.62) level = Math.min(3, level + 1)
    if (plan.dynamicShape === 'build_then_drop' && t >= 0.75) level = 0
    return level as ArrangementLevel
  })
}

function octaveOf(pitch: string, semitones: number, lo: number, hi: number): string {
  const pc = pitch.replace(/-?\d+$/, '')
  return nearestNote([pc], midiOf(pitch) + semitones, lo, hi)
}

function octaveCopy(voice: Voice, semitones: number, lo: number, hi: number): Voice {
  return voice.map((n) => ({
    ...n,
    pitches: n.pitches.map((pitch) => octaveOf(pitch, semitones, lo, hi)),
    velocity: Math.max(1, n.velocity - 10),
  }))
}

function thinVoice(voice: Voice, beatTicks: number): Voice {
  const kept = voice.filter((n) => n.start % beatTicks === 0)
  return kept.length ? kept : voice.slice(0, 1)
}

/**
 * Level 3: tune doubled at the octave (a new voice, so the theme line is
 * untouched), bass doubled down. Level 0: drop the inner treble voice and
 * thin the left hand to the beats.
 */
export function applyArrangement(score: Score, levels: readonly ArrangementLevel[]): void {
  const beat = score.meter.beatTicks
  for (const bar of score.bars) {
    const level = levels[bar.index] ?? 2
    if (level >= 3) {
      if (bar.treble[0]?.length) {
        const doubled = octaveCopy(bar.treble[0], 12, 60, 96)
        if (bar.treble.length < 2) bar.treble.push(doubled)
        else {
          // Keep the sung line as voice 0; thicken the inner part instead.
          for (const n of bar.treble[1]) {
            const top = n.pitches[n.pitches.length - 1]
            if (!top) continue
            const oct = octaveOf(top, 12, 60, 96)
            if (midiOf(oct) !== midiOf(top)) n.pitches = [...n.pitches, oct]
          }
        }
      }
      for (const voice of bar.bass) {
        for (const n of voice) {
          const low = n.pitches[0]
          if (!low) continue
          const oct = octaveOf(low, -12, 24, 55)
          if (midiOf(oct) !== midiOf(low)) n.pitches = [oct, ...n.pitches]
        }
      }
    }
    if (level <= 0) {
      if (bar.treble.length > 1) bar.treble = [bar.treble[0]]
      bar.bass = bar.bass.map((voice) => thinVoice(voice, beat)).filter((voice) => voice.length > 0)
    } else if (level === 1) {
      bar.bass = bar.bass.map((voice) => thinVoice(voice, beat)).filter((voice) => voice.length > 0)
    }
  }
}
