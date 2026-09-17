import type { StyleId } from '../plan/schema'

/** UI-only dressing for the dial. Nothing here reaches a planner. */
export const STYLE_THEME: Record<StyleId, { accent: string; tagline: string }> = {
  bach: { accent: '#9a6a1c', tagline: 'counterpoint & sequence' },
  beethoven: { accent: '#b3261e', tagline: 'motto & storm' },
  debussy: { accent: '#23808f', tagline: 'colour & haze' },
  glass: { accent: '#4353c9', tagline: 'cells & pulse' },
  nahre_sol: { accent: '#cf5416', tagline: 'groove & modes' },
  elijah_fox: { accent: '#7a3d9e', tagline: 'lush neo-soul keys' },
}
