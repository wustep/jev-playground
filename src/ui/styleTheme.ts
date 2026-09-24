import type { StyleId } from '../plan/schema'

/** UI-only dressing for the dial. Nothing here reaches a planner. */
export const STYLE_THEME: Record<StyleId, { accent: string; tagline: string }> = {
  bach: { accent: '#9a6a1c', tagline: 'two voices in dialogue' },
  beethoven: { accent: '#b3261e', tagline: 'low cantabile & storm' },
  chopin: { accent: '#a84a62', tagline: 'high lace over a wide left hand' },
  debussy: { accent: '#23808f', tagline: 'colour & haze' },
  hans_zimmer: { accent: '#2f6f62', tagline: 'ostinato, drone & surge' },
}
