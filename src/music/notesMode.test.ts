import { describe, expect, it } from 'vitest'
import { cachedNotesMode, notesSearchValue, parseNotesSearchParam } from './notesMode'

describe('notes URL scheme', () => {
  it('parses code|guide|line and treats jev as a line alias', () => {
    expect(parseNotesSearchParam(null)).toBe('code')
    expect(parseNotesSearchParam(undefined)).toBe('code')
    expect(parseNotesSearchParam('code')).toBe('code')
    expect(parseNotesSearchParam('guide')).toBe('guide')
    expect(parseNotesSearchParam('line')).toBe('line')
    expect(parseNotesSearchParam('jev')).toBe('line')
    expect(parseNotesSearchParam('nonsense')).toBe('code')
  })

  it('omits code from the query and writes guide|line canonically', () => {
    expect(notesSearchValue('code')).toBeNull()
    expect(notesSearchValue('guide')).toBe('guide')
    expect(notesSearchValue('line')).toBe('line')
  })

  it('treats legacy cached phrases without noteMode as line', () => {
    expect(cachedNotesMode({})).toBeUndefined()
    expect(cachedNotesMode({ notePhrases: [] })).toBe('line')
    expect(cachedNotesMode({ noteMode: 'guide', notePhrases: [] })).toBe('guide')
    expect(cachedNotesMode({ noteMode: 'line', notePhrases: [] })).toBe('line')
  })
})
