// Phrase structure: what the form actually says.
//
// A form's whole job is to answer two questions — which bars bring an earlier
// bar back, and where the tune breathes. That is small. The previous version
// spent 709 lines and eleven form names on it, plus a `hookBars` label asking
// how much of the opening idea returns, plus a per-bar `role` in the plan that
// could contradict the form it came from. All three are gone: a phrase returns
// whole (its cadence bar excepted, which is always written fresh), and roles
// are derived here from form and position, so they cannot disagree.
//
// Imported by the /api/jev serverless chain → explicit `.js` extensions.

import type { BarCount, FormId } from './schema.js'

/** How a four-bar phrase finishes. Drives both harmony choice and the melody's breath. */
export type PhraseEnd = 'open' | 'half' | 'closed'

/**
 * How a phrase's four bars are built out of the style's harmony book.
 *
 * `formSlots` emits only five of these. `duplicate`, `loop` and `pedal` served
 * the loop and ostinato forms that the rewrite folded into these four; the
 * harmony books still carry `loops` and `pedals`, and whether a loop form
 * comes back is a musical call, so the builds stay until it is made.
 */
export type PhraseBuild = 'head_tail' | 'head_seq' | 'seq_tail' | 'seq_seq' | 'duplicate' | 'loop' | 'pedal' | 'coda'

export interface PhraseSlot {
  end: PhraseEnd
  build: PhraseBuild
  /** The earlier phrase this one restates, if any. */
  returnsFrom?: number
  /** True where the restatement is decorated rather than literal. */
  varied: boolean
}

/**
 * What a bar is doing, derived — never planned. The melody writer reads this
 * to choose a rhythm bank, a register lift and whether to recall an earlier
 * bar; the dynamics pass reads it for inflection.
 */
export type BarRole = 'statement' | 'continuation' | 'sequence' | 'contrast' | 'climax' | 'half_cadence' | 'cadence'

export interface BarPosition {
  role: BarRole
  /** Bar index whose tune this bar brings back, or undefined where the line is new. */
  returnsFrom?: number
  /** Decorate the recalled line rather than repeating it literally. */
  ornamentReturn: boolean
  /** Last bar of its four-bar phrase: where the tune lands and rests. */
  phraseFinal: boolean
  /** How this bar's phrase finishes — `phraseFinal` bars use it, others ignore it. */
  phraseEnd: PhraseEnd
  /** 0-based index of the four-bar phrase this bar belongs to. */
  phrase: number
}

/** Every form is built in four-bar phrases; a phrase Choice is four chords. */
export const BARS_PER_PHRASE = 4

/**
 * The phrase layout of a form at a given length. Everything is generated from
 * the shape of the form rather than enumerated, so 4, 8, 16, 32 and 64 bars
 * all fall out of the same six lines each.
 */
export function formSlots(form: FormId, bars: BarCount): PhraseSlot[] {
  const count = Math.max(1, Math.floor(bars / BARS_PER_PHRASE))
  const last = count - 1
  const slots: PhraseSlot[] = []
  for (let p = 0; p < count; p++) {
    const isLast = p === last
    switch (form) {
      case 'period': {
        // A · A' · B · A'' in fours: question, answer, a departure, and the
        // answer again — dressed the second time, because a return that is
        // note-for-note identical twice is a loop, not a period.
        const step = p % 4
        if (step === 0) slots.push({ end: 'half', build: 'head_tail', varied: false })
        else if (step === 1) slots.push({ end: 'closed', build: 'head_tail', returnsFrom: p - 1, varied: false })
        else if (step === 2) slots.push({ end: 'half', build: 'seq_tail', varied: false })
        else slots.push({ end: 'closed', build: 'head_tail', returnsFrom: p - 3, varied: true })
        break
      }
      case 'sentence': {
        // idea · idea sequenced · continuation · cadence, repeating in fours.
        const step = p % 4
        if (step === 0) slots.push({ end: 'open', build: 'head_seq', varied: false })
        else if (step === 1) slots.push({ end: 'half', build: 'seq_seq', returnsFrom: p - 1, varied: true })
        else if (step === 2) slots.push({ end: 'open', build: 'seq_tail', varied: false })
        else slots.push({ end: 'closed', build: 'coda', varied: false })
        break
      }
      case 'arch': {
        // A · (A') · B · A''. Whatever the length, the first phrase opens it
        // and the last brings it back ornamented — that return is the point,
        // and an arch that never closes its arc is not one. In between, the
        // first half restates and the second departs.
        if (p === 0) slots.push({ end: 'half', build: 'head_tail', varied: false })
        else if (isLast) slots.push({ end: 'closed', build: 'head_tail', returnsFrom: 0, varied: true })
        else if (p < count / 2) slots.push({ end: 'closed', build: 'head_tail', returnsFrom: 0, varied: p > 1 })
        else slots.push({ end: 'half', build: 'seq_seq', varied: false })
        break
      }
      case 'chain':
        // Spun out: each phrase grows from the last, nothing comes back whole.
        slots.push({ end: isLast ? 'closed' : p % 2 === 1 ? 'half' : 'open', build: p === 0 ? 'head_seq' : isLast ? 'coda' : 'seq_seq', varied: false })
        break
    }
  }
  // Whatever the form, the piece ends.
  slots[last] = { ...slots[last], end: 'closed' }
  return slots
}

/**
 * Per-bar positions. A returning phrase returns bar for bar; its cadence bar
 * is always written fresh, because a cadence is a conclusion and not a quote.
 */
export function barPositions(form: FormId, bars: BarCount): BarPosition[] {
  const slots = formSlots(form, bars)
  const phrases = slots.length
  // The peak sits three-quarters of the way through — late enough to have been
  // earned, early enough that the cadence is a descent from it and not the top.
  const climaxPhrase = phrases >= 2 ? Math.max(1, Math.floor(phrases * 0.75)) : -1
  const out: BarPosition[] = []
  for (let index = 0; index < bars; index++) {
    const phrase = Math.min(phrases - 1, Math.floor(index / BARS_PER_PHRASE))
    const slot = slots[phrase]
    const within = index % BARS_PER_PHRASE
    const phraseFinal = within === BARS_PER_PHRASE - 1 || index === bars - 1
    const source = slot.returnsFrom
    const returnsFrom = source !== undefined && !phraseFinal ? source * BARS_PER_PHRASE + within : undefined
    let role: BarRole
    if (phraseFinal) role = slot.end === 'half' ? 'half_cadence' : slot.end === 'closed' ? 'cadence' : 'continuation'
    else if (phrase === climaxPhrase && within === 2) role = 'climax'
    else if (slot.build === 'seq_seq' || slot.build === 'seq_tail') role = within === 0 ? 'contrast' : 'sequence'
    else if (within === 0) role = 'statement'
    else role = 'continuation'
    out.push({ role, returnsFrom, ornamentReturn: slot.varied, phraseFinal, phraseEnd: slot.end, phrase })
  }
  return out
}
