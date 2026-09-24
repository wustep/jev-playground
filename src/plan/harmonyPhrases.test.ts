import { describe, expect, it } from 'vitest'
import { BAR_COUNT_VALUES, FORM_IDS, KEY_IDS, STYLE_IDS, type PlanGlobals } from './schema'
import { formSlots } from './forms'
import { bookFor, expandPhrase, finishPhraseHarmony, phraseOptions, withPhraseNovelty } from './harmonyPhrases'
import { STYLE_PROFILES } from './styles'
import { buildRequest, parseOp } from '../planner/jev/requests'

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

  it('puts borrowed-iv and ii9–V13 phrases in the Laufey major book', () => {
    const book = STYLE_PROFILES.laufey.harmony.major
    const phrases = [...book.phrases.closed, ...book.phrases.half, ...book.phrases.open]
    expect(phrases.some((phrase) => phrase.includes('V7_of_IV') && phrase.includes('iv6'))).toBe(true)
    expect(phrases.some((phrase) => phrase.includes('ii9') && phrase.includes('V13'))).toBe(true)
    expect(phrases.some((phrase) => phrase.includes('Imaj7') && phrase.includes('iv'))).toBe(true)
    expect(book.heads.some((head) => head[0] === 'ii9' && head[1] === 'V13')).toBe(true)
    expect(book.splits.some((pair) => pair[0] === 'ii9' && pair[1] === 'V13')).toBe(true)
  })

  it('favors bossa_comp on Laufey song archetypes', () => {
    const lyrical = STYLE_PROFILES.laufey.archetypes.lyrical_song?.priors.texture
    const groove = STYLE_PROFILES.laufey.archetypes.warm_groove?.priors.texture
    expect(lyrical?.bossa_comp).toBeGreaterThan(lyrical?.chordal_melody ?? 0)
    expect(groove?.bossa_comp).toBeGreaterThan(groove?.stride_dance ?? 0)
  })

  it('keeps the /api/jev phrase Choice catalog aligned with hookBars=8 layouts', () => {
    // JevPlanner expands with resolveHookBars; the server used to omit hookBars and
    // offered seq_tail ids (st:…) for a slot the client treated as head_tail →
    // `jev.phrase: "st:2:1" is not one of …`.
    const globals = {
      character: 'lyrical_song',
      form: 'period',
      key: 'Db_major',
      meter: 'twelve_eight',
      texture: 'rolling_nocturne',
      palette: 'chromatic_approach',
      tempo: 'andante',
      dynamics: 'p',
      dynamicShape: 'waves',
      defaultInstrument: 'grand_piano',
      arrangement: 'lift_on_return',
      opening: 'pickup',
      pedal: 'full',
      phrasing: 'breathing',
      hookBars: '8',
    } as const satisfies PlanGlobals

    const withoutHook = formSlots('period', 16)
    const withHook = formSlots('period', 16, 8)
    expect(withoutHook.map((slot) => slot.build)).toContain('seq_tail')
    expect(withHook.map((slot) => slot.build)).not.toContain('seq_tail')

    const book = bookFor('chopin', globals.key)
    for (let slotIndex = 0; slotIndex < withHook.length; slotIndex++) {
      const prior = slotIndex * 4
      const op = {
        op: 'phrase' as const,
        style: 'chopin' as const,
        brief: true,
        globals,
        barCount: 16 as const,
        slotIndex,
        chords: Array.from({ length: prior }, () => 'i' as const),
        contours: Array.from({ length: prior }, () => 'arch' as const),
      }
      expect(parseOp(op)).toMatchObject({ slotIndex })
      const request = buildRequest(op, 'jev-latest')
      const criteria = request.questions.phrase.criteria as Record<string, string>
      const catalogIds = phraseOptions(book, withHook[slotIndex]).map((entry) => entry.id).sort()
      expect(Object.keys(criteria).sort()).toEqual(catalogIds)

      if (withoutHook[slotIndex].build === 'seq_tail' && withHook[slotIndex].build !== 'seq_tail') {
        expect(phraseOptions(book, withoutHook[slotIndex]).some((entry) => entry.id.startsWith('st:'))).toBe(true)
        expect(Object.keys(criteria).some((id) => id.startsWith('st:'))).toBe(false)
      }
      for (const id of Object.keys(criteria)) {
        expect(() => expandPhrase(id, book, withHook[slotIndex])).not.toThrow()
      }
    }
  })

})
