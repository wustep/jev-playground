import { describe, expect, it } from 'vitest'
import { BAR_COUNT_VALUES, FORM_IDS, KEY_IDS, STYLE_IDS } from './schema'
import { formSlots } from './forms'
import { bookFor, expandPhrase, finishPhraseHarmony, phraseOptions, withPhraseNovelty } from './harmonyPhrases'

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
                expect(expandPhrase(option.id, book, slot)).toEqual(option.chords)
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
})
