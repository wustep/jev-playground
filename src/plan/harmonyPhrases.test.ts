import { describe, expect, it } from 'vitest'
import { BAR_COUNT_VALUES, FORM_IDS, KEY_IDS, STYLE_IDS } from './schema'
import { formSlots } from './phrase'
import { bookFor, expandPhrase, finishPhraseHarmony, phraseOptions, withPhraseNovelty } from './harmonyPhrases'
import { STYLE_PROFILES } from './styles'

describe('harmony phrase catalog', () => {
  it('offers a closed, expandable list for every style, key and slot', () => {
    for (const style of STYLE_IDS) {
      for (const key of [KEY_IDS[0], 'A_minor', 'C_major'] as const) {
        const book = bookFor(style, key)
        for (const form of FORM_IDS) {
          for (const bars of BAR_COUNT_VALUES) {
            for (const slot of formSlots(form, bars)) {
              const options = phraseOptions(book, slot)
              expect(options.length, `${style} ${form} ${bars}`).toBeGreaterThan(0)
              expect(options.length).toBeLessThanOrEqual(36)
              const ids = new Set(options.map((option) => option.id))
              expect(ids.size).toBe(options.length)
              for (const option of options) {
                expect(option.chords).toHaveLength(4)
                expect(expandPhrase(option.id, options)).toEqual(option.chords)
                expect(option.label).not.toMatch(/Bach|Beethoven|Chopin|Debussy|Glass|Zimmer|Laufey|Fox/)
              }
            }
          }
        }
      }
    }
  }, 30_000)

  it('splits a closed phrase onto an approach when the book names the arrival', () => {
    const book = bookFor('bach', 'C_major')
    const slots = formSlots('period', 8)
    const chords = ['I', 'V65', 'ii6', 'V', 'I', 'IV', 'V7', 'I'] as const
    const finished = finishPhraseHarmony(chords, slots, book)
    expect(finished.chords[7]).toBe('I')
    const splitAt = finished.seconds.findIndex((second) => second)
    expect(splitAt).toBeGreaterThanOrEqual(0)
    expect(finished.seconds[splitAt]).toBe(chords[splitAt])
    expect(finished.chords[splitAt]).not.toBe(finished.seconds[splitAt])
  })

  it('damps a phrase that restates the last slot', () => {
    const book = bookFor('bach', 'C_major')
    const slot = formSlots('period', 8)[1]
    const options = phraseOptions(book, slot)
    const first = options[0]
    const raw = Object.fromEntries(options.map((option) => [option.id, 1 / options.length]))
    const adjusted = withPhraseNovelty(raw, [...first.chords], options)
    expect(adjusted[first.id]).toBeLessThan(raw[first.id])
  })

  it('keeps Laufey\'s borrowed-iv and ii9–V13 language in her major book', () => {
    const book = STYLE_PROFILES.laufey.harmony.major
    const phrases = [...book.phrases.closed, ...book.phrases.half, ...book.phrases.open]
    expect(phrases.some((phrase) => phrase.includes('V7_of_IV') && phrase.includes('iv6'))).toBe(true)
    expect(phrases.some((phrase) => phrase.includes('ii9') && phrase.includes('V13'))).toBe(true)
    expect(book.splits.some((pair) => pair[0] === 'ii9' && pair[1] === 'V13')).toBe(true)
  })

  it('gives every style a harmony book that agrees with its own vocabulary', () => {
    for (const style of STYLE_IDS) {
      for (const mode of ['major', 'minor'] as const) {
        const book = STYLE_PROFILES[style].harmony[mode]
        expect(book.heads.length, `${style} ${mode} heads`).toBeGreaterThan(0)
        expect(book.finals.length).toBeGreaterThan(0)
        for (const [end, phrases] of Object.entries(book.phrases)) {
          for (const phrase of phrases) expect(phrase, `${style} ${mode} ${end}`).toHaveLength(4)
        }
      }
    }
  })
})
