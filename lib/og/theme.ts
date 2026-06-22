/**
 * Colour palettes for the dynamic Open Graph preview image (task 6.2).
 *
 * The OG image must reflect the invitation's *theme* (Requirement 4.2) so the
 * link preview already hints at the mood before it is opened. Each
 * {@link ThemeId} declared by a template (see `templates/*.ts` — `romantic`,
 * `neutral`, `playful`, `festive`, `elegant`) maps to a small {@link OgTheme}
 * palette used to paint the background gradient and text.
 *
 * Resolution is deliberately total and side-effect free: an unknown or missing
 * theme falls back to the {@link NEUTRAL_THEME}, so the renderer never crashes
 * on a theme it doesn't recognise (and the unavailable-link neutral image can
 * reuse it too).
 */

/** A minimal palette used to paint the OG card for a given theme. */
export interface OgTheme {
  /** Theme id this palette is for (e.g. "romantic"). */
  id: string;
  /** Gradient start colour (CSS colour string). */
  backgroundFrom: string;
  /** Gradient end colour (CSS colour string). */
  backgroundTo: string;
  /** Accent colour for the small decorative emoji/badge. */
  accent: string;
  /** Primary (title) text colour. */
  textColor: string;
  /** Secondary (subtitle) text colour. */
  mutedColor: string;
  /** Decorative emoji that conveys the theme's mood. */
  emoji: string;
}

/** Neutral fallback palette — also used for unavailable links. */
export const NEUTRAL_THEME: OgTheme = {
  id: 'neutral',
  backgroundFrom: '#FFF6EF',
  backgroundTo: '#FFD9C2',
  accent: '#E8625A',
  textColor: '#3D2C2A',
  mutedColor: '#8A736C',
  emoji: '💌',
};

/** Palettes keyed by the theme ids declared across the MVP templates. */
const THEMES: Record<string, OgTheme> = {
  neutral: NEUTRAL_THEME,
  romantic: {
    id: 'romantic',
    backgroundFrom: '#FFF6EF',
    backgroundTo: '#FFD9C2',
    accent: '#E8625A',
    textColor: '#3D2C2A',
    mutedColor: '#8A736C',
    emoji: '💖',
  },
  playful: {
    id: 'playful',
    backgroundFrom: '#FFF0E8',
    backgroundTo: '#FFCBA4',
    accent: '#E8625A',
    textColor: '#3D2C2A',
    mutedColor: '#8A736C',
    emoji: '✨',
  },
  festive: {
    id: 'festive',
    backgroundFrom: '#FFF6EF',
    backgroundTo: '#FFB899',
    accent: '#E8625A',
    textColor: '#3D2C2A',
    mutedColor: '#8A736C',
    emoji: '🎉',
  },
  elegant: {
    id: 'elegant',
    backgroundFrom: '#FBF0EC',
    backgroundTo: '#EDD9CE',
    accent: '#C9B3A8',
    textColor: '#3D2C2A',
    mutedColor: '#8A736C',
    emoji: '🥂',
  },
};

/**
 * Resolve the {@link OgTheme} palette for a theme id, falling back to the
 * neutral palette for unknown/missing ids so the renderer is total.
 */
export function resolveOgTheme(themeId: string | null | undefined): OgTheme {
  if (themeId && Object.prototype.hasOwnProperty.call(THEMES, themeId)) {
    return THEMES[themeId];
  }
  return NEUTRAL_THEME;
}
