// Debug Notes modes. Default Generate is always `code` (labels → renderPlan).
//
// URL scheme (`?debug=1`):
//   notes=code   Code writes the tune (same as omitting `notes`)
//   notes=guide  Jev guides the tune (D1: figure + goal; code writes the line)
//   notes=line   Jev writes the line (today’s closed 4-slot rhythm + degrees)
//   notes=jev    legacy alias for `line` — existing Debug URLs keep the 4-slot path
//
// Modes 2–3 stay Debug + live Jev. The `notes` query is stripped when Debug is off.

export type NotesMode = 'code' | 'guide' | 'line'

export const NOTES_MODE_LABELS: Record<NotesMode, string> = {
  code: 'Code writes the tune',
  guide: 'Jev guides the tune',
  line: 'Jev writes the line',
}

export const NOTES_MODE_TITLES: Record<NotesMode, string> = {
  code: 'Today’s renderer: labels → renderPlan. Default Generate path.',
  guide: 'Jev picks a closed figure and a chord-tone goal; code writes the singing line over the arranged accompaniment.',
  line: 'Jev picks a closed 4-slot rhythm and degrees (A/B). Accompaniment stays with renderPlan.',
}

export const NOTES_MODE_DEBUG: Record<NotesMode, string> = {
  code: 'Code writes the tune — renderPlan',
  guide: 'Jev guides the tune — figure + goal; code realizes the singing line; accompaniment stays',
  line: 'Jev writes the line — closed 4-slot rhythm+degrees over renderPlan accompaniment',
}

/** Canonical query value. `code` is omitted from the URL. */
export function notesSearchValue(mode: NotesMode): string | null {
  return mode === 'code' ? null : mode
}

/** Parse `notes` from the URL. Unknown / missing → `code`. `jev` → `line`. */
export function parseNotesSearchParam(value: string | null | undefined): NotesMode {
  if (value === 'guide') return 'guide'
  if (value === 'line' || value === 'jev') return 'line'
  return 'code'
}

/** Legacy cache rows (pre-mode stamp) with phrases are the 4-slot line path. */
export function cachedNotesMode(generated: { noteMode?: NotesMode; notePhrases?: unknown }): 'guide' | 'line' | undefined {
  if (generated.noteMode === 'guide' || generated.noteMode === 'line') return generated.noteMode
  if (generated.notePhrases !== undefined) return 'line'
  return undefined
}
