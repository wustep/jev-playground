// Closed catalog of 4-bar harmony phrases, built from a style's HarmonyBook.
//
// Jev picks one option per form slot (src/plan/phrase.ts). Code expands the id
// into four roman numerals and then applies the book's cadence splits — so the
// live planner asks ~4× fewer chord questions than a per-bar Choice, while
// staying inside the same vocabulary the HeuristicPlanner already uses.
//
// Imported by the /api/jev serverless chain → explicit `.js` extensions.

import { CHORDS, PlanValidationError, type BarCount, type ChordId, type KeyId, type PlanGlobals, type StyleId } from './schema.js'
import { BARS_PER_PHRASE, formSlots, type PhraseEnd, type PhraseSlot } from './phrase.js'
import { STYLE_PROFILES, type HarmonyBook } from './styles.js'

export const PHRASE_ENDS: Record<PhraseEnd, string> = {
  open: 'The four bars travel or sit without a cadence — the next phrase continues the thought',
  half: 'The four bars pause on the dominant, an unanswered half cadence',
  closed: 'The four bars settle back on the tonic',
}

export interface PhraseOption {
  id: string
  chords: readonly [ChordId, ChordId, ChordId, ChordId]
  label: string
}

const OPTION_CAP = 36

export function bookFor(style: StyleId, key: KeyId): HarmonyBook {
  return STYLE_PROFILES[style].harmony[key.endsWith('_minor') ? 'minor' : 'major']
}

function four(unit: readonly ChordId[]): readonly [ChordId, ChordId, ChordId, ChordId] {
  if (unit.length < 4) {
    const tonic = unit[0] ?? 'I'
    return [unit[0] ?? tonic, unit[1] ?? tonic, unit[2] ?? tonic, unit[3] ?? tonic]
  }
  return [unit[0], unit[1], unit[2], unit[3]]
}

function cycleFour(unit: readonly ChordId[]): readonly [ChordId, ChordId, ChordId, ChordId] {
  if (!unit.length) return ['I', 'I', 'I', 'I']
  return [0, 1, 2, 3].map((i) => unit[i % unit.length]) as [ChordId, ChordId, ChordId, ChordId]
}

function joinPair(a: readonly ChordId[], b: readonly ChordId[]): readonly [ChordId, ChordId, ChordId, ChordId] {
  return [a[0] ?? 'I', a[1] ?? a[0] ?? 'I', b[0] ?? 'I', b[1] ?? b[0] ?? 'I']
}

/** Deterministic second-list slice so the server rebuilds the same Choice. */
function takeRights<T>(items: readonly T[], cap = 3): readonly T[] {
  if (items.length <= cap + 1) return items
  return [...items.slice(0, cap - 1), items[items.length - 1]]
}

function describeProgression(chords: readonly ChordId[], end: PhraseEnd): string {
  const walk = chords.map((id) => `${id} — ${CHORDS[id]}`).join('; then ')
  return `${walk}. ${PHRASE_ENDS[end]}`
}

function option(id: string, chords: readonly [ChordId, ChordId, ChordId, ChordId], end: PhraseEnd): PhraseOption {
  return { id, chords, label: describeProgression(chords, end) }
}

function pairOptions(
  prefix: string,
  lefts: readonly (readonly ChordId[])[],
  rights: readonly (readonly ChordId[])[],
  end: PhraseEnd,
): PhraseOption[] {
  const seconds = takeRights(rights)
  const out: PhraseOption[] = []
  lefts.forEach((left, i) => {
    seconds.forEach((right, j) => {
      const rightIndex = rights.indexOf(right)
      out.push(option(`${prefix}:${i}:${rightIndex < 0 ? j : rightIndex}`, joinPair(left, right), end))
    })
  })
  return out
}

export function phraseOptions(book: HarmonyBook, slot: PhraseSlot): PhraseOption[] {
  const tails = book.tails[slot.end].length ? book.tails[slot.end] : book.tails.open
  const verified = book.phrases[slot.end].map((phrase, i) => option(`ph:${slot.end}:${i}`, four(phrase), slot.end))
  let rest: PhraseOption[] = []
  switch (slot.build) {
    case 'head_tail':
      rest = pairOptions('ht', book.heads, tails, slot.end)
      break
    case 'head_seq':
      rest = pairOptions('hs', book.heads, book.seqs, slot.end)
      break
    case 'seq_tail':
      rest = pairOptions('st', book.seqs, tails, slot.end)
      break
    case 'seq_seq':
      rest = pairOptions('ss', book.seqs, book.seqs, slot.end)
      break
    case 'duplicate':
      rest = book.heads.map((head, i) => option(`du:${i}`, joinPair(head, head), slot.end))
      break
    case 'loop':
      rest = (book.loops.length ? book.loops : book.heads).map((loop, i) => option(`lp:${i}`, cycleFour(loop), slot.end))
      break
    case 'pedal':
      rest = (book.pedals.length ? book.pedals : book.tails.half).map((unit, i) => option(`pd:${i}`, four(cycleFour(unit)), slot.end))
      break
    case 'coda':
      rest = (book.codas.length ? book.codas : book.heads.map((head) => joinPair(head, book.tails.closed[0] ?? head))).map((unit, i) =>
        option(`cd:${i}`, four(cycleFour(unit)), slot.end),
      )
      break
  }
  // Verified phrases first: they are the style's documented 4-bar units.
  const catalog = slot.build === 'head_tail' ? [...verified, ...rest] : [...rest, ...verified]
  const unique = catalog.filter((entry, i) => catalog.findIndex((other) => other.id === entry.id) === i)
  const capped = unique.slice(0, OPTION_CAP)
  if (capped.length) return capped
  const tonic = book.finals[0] ?? 'I'
  return [option('cd:0', [tonic, tonic, tonic, tonic], slot.end)]
}

/**
 * The phrase Choice for one form slot of one piece: the slot, the book it
 * draws on, and the options on offer.
 *
 * Both ends of /api/jev go through this one function. The server turns it
 * into the question's criteria; JevPlanner validates and expands Jev's answer
 * against it. They used to derive the slot separately, and on `main` that
 * drifted (#58): the server offered one layout's ids, the client checked
 * another's, and a valid live answer was rejected as unknown.
 */
export interface SlotCatalog {
  slot: PhraseSlot
  book: HarmonyBook
  options: PhraseOption[]
}

export function slotCatalog(style: StyleId, globals: Pick<PlanGlobals, 'form' | 'key'>, barCount: BarCount, slotIndex: number): SlotCatalog {
  const slot = formSlots(globals.form, barCount)[slotIndex]
  if (!slot) throw new PlanValidationError(`phrase: slot ${slotIndex} is out of range for ${barCount} bars of ${globals.form}`)
  const book = bookFor(style, globals.key)
  return { slot, book, options: phraseOptions(book, slot) }
}

/** Option id → description: the Choice criteria, and the table an answer is checked against. */
export function phraseCriteria(options: readonly PhraseOption[]): Record<string, string> {
  return Object.fromEntries(options.map((entry) => [entry.id, entry.label]))
}

export function expandPhrase(id: string, options: readonly PhraseOption[]): readonly [ChordId, ChordId, ChordId, ChordId] {
  const found = options.find((entry) => entry.id === id)
  if (!found) throw new PlanValidationError(`phrase: unknown option "${id}" for this slot`)
  return found.chords
}

/** Damp a phrase that restates the last slot's chords, or reopens on the same harmony. */
export function withPhraseNovelty(probabilities: Record<string, number>, previous: readonly ChordId[], options: readonly PhraseOption[]): Record<string, number> {
  if (!previous.length) return probabilities
  const last = previous[previous.length - 1]
  const prevFour = previous.slice(-4).join('|')
  const next: Record<string, number> = { ...probabilities }
  for (const option of options) {
    if (!(option.id in next)) continue
    if (option.chords.join('|') === prevFour) next[option.id] *= 0.12
    else if (option.chords[0] === last) next[option.id] *= 0.4
  }
  const total = Object.values(next).reduce((sum, weight) => sum + Math.max(0, weight), 0) || 1
  return Object.fromEntries(Object.entries(next).map(([id, weight]) => [id, Math.max(0, weight) / total]))
}

/**
 * The bar where slot `slotIndex` takes two harmonies: a half cadence splits
 * its own last bar (I6/4 | V); a phrase that closes, or runs on, splits the
 * bar before its arrival (ii6/5–V7 | I).
 */
export const splitBarOf = (slot: PhraseSlot, slotIndex: number) => slotIndex * BARS_PER_PHRASE + (slot.end === 'half' ? 3 : 2)

/** The book's approaches into the chord at `at` — never one that restates the bar before. */
export function approachesInto(book: HarmonyBook, chords: readonly ChordId[], at: number): readonly (readonly [ChordId, ChordId])[] {
  return book.splits.filter(([approach, target]) => target === chords[at] && approach !== chords[at - 1])
}

/**
 * Cadence ornament of the harmony book: the bar that arrives on a split's
 * target takes the approach in its first half. The heuristic stub applies
 * the same `splitBarOf` / `approachesInto` rule, choosing among approaches
 * by its own sampling policy.
 */
export function applyBookSplits(
  chords: readonly ChordId[],
  slots: readonly PhraseSlot[],
  book: HarmonyBook,
): { chords: ChordId[]; seconds: (ChordId | undefined)[] } {
  const next = [...chords]
  const seconds: (ChordId | undefined)[] = next.map(() => undefined)
  const end = next.length - 1
  slots.forEach((slot, s) => {
    const at = splitBarOf(slot, s)
    if (at >= end) return
    const options = approachesInto(book, next, at)
    if (!options.length) return
    seconds[at] = next[at]
    next[at] = options[0][0]
  })
  return { chords: next, seconds }
}

export function snapFinal(chords: readonly ChordId[], book: HarmonyBook): ChordId[] {
  const next = [...chords]
  const last = next.length - 1
  if (last >= 0 && book.finals.length && !book.finals.includes(next[last])) next[last] = book.finals[0]
  return next
}

export function finishPhraseHarmony(
  chords: readonly ChordId[],
  slots: readonly PhraseSlot[],
  book: HarmonyBook,
): { chords: ChordId[]; seconds: (ChordId | undefined)[] } {
  return applyBookSplits(snapFinal(chords, book), slots, book)
}

export const slotContourQuestionId = (index: number) => `contour_${index}`
