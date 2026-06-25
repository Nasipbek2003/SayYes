/**
 * Gallery view-model builder for the template gallery (task 10.1).
 *
 * The home page (`app/page.tsx`) is a server component that renders the list of
 * available templates (Requirement 1.1), lets the author pick a colour theme
 * when a template offers several (Requirement 1.3) and links into the creation
 * flow with the chosen template/theme (Requirement 1.2). When no templates are
 * available it shows a friendly empty state (Requirement 1.4).
 *
 * This module isolates the *presentation logic* (turning {@link TemplateSummary}
 * records from {@link TemplateRegistry.list} into render-ready view models) from
 * the React component so it can be unit-tested in the project's `node` test
 * environment without rendering. The component stays a thin mapping over these
 * view models.
 *
 * Preview imagery: the MVP has no per-template raster previews shipped yet, so
 * each card uses a CSS gradient derived from the template's first theme palette
 * (see {@link resolveOgTheme}) plus the theme's decorative emoji. This keeps the
 * gallery visual and avoids broken `<img>` tags pointing at non-existent files.
 */
import { resolveOgTheme } from '@/lib/og/theme';
import { InMemoryTemplateRegistry } from '@/lib/templates/registry';
import { gallerySchemas } from '@/templates';
import type { TemplateRegistry, TemplateSummary } from '@/templates/types';

const galleryRegistry: TemplateRegistry = new InMemoryTemplateRegistry(gallerySchemas);

/** Base path of the creation flow (task 10.2 fills in the actual form). */
export const CREATE_PATH = '/create';

/** Human-readable Russian labels for the colour theme ids used by templates. */
const THEME_LABELS: Record<string, string> = {
  neutral: 'Нейтральная',
  romantic: 'Романтичная',
  playful: 'Игривая',
  festive: 'Праздничная',
  elegant: 'Элегантная',
};

/** Friendly fallback label for an unknown theme id (e.g. "Custom" → "Custom"). */
function themeLabel(themeId: string): string {
  return THEME_LABELS[themeId] ?? themeId.charAt(0).toUpperCase() + themeId.slice(1);
}

/** Render-ready view of a single colour theme on a gallery card. */
export interface GalleryThemeView {
  /** Theme id, passed through to the creation flow. */
  id: string;
  /** Human-readable label shown to the author. */
  label: string;
  /** Decorative emoji conveying the theme's mood. */
  emoji: string;
  /** CSS gradient (background) representing the theme palette. */
  gradient: string;
  /** Deep link into the creation flow with this template + theme preselected. */
  href: string;
}

/** Render-ready view of a single template card in the gallery. */
export interface GalleryTemplateView {
  /** Template id. */
  id: string;
  /** Display name. */
  name: string;
  /** Short description of the occasion. */
  description: string;
  /** CSS gradient used as the card's preview background (from the first theme). */
  previewGradient: string;
  /** Decorative emoji shown on the preview (from the first theme). */
  previewEmoji: string;
  /** Available colour themes (Requirement 1.3); has at least one entry. */
  themes: GalleryThemeView[];
  /**
   * Link to start creating an invitation from this template, using the default
   * (first) theme (Requirement 1.2). Per-theme links live on {@link themes}.
   */
  createHref: string;
}

/** Build the deep link into the creation flow for a template/theme pair. */
export function buildCreateHref(templateId: string, themeId?: string): string {
  const params = new URLSearchParams({ template: templateId });
  if (themeId) {
    params.set('theme', themeId);
  }
  return `${CREATE_PATH}?${params.toString()}`;
}

/** Build a CSS gradient string for a theme id from its OG palette. */
function gradientFor(themeId: string): string {
  const palette = resolveOgTheme(themeId);
  return `linear-gradient(135deg, ${palette.backgroundFrom}, ${palette.backgroundTo})`;
}

/** Отдельная иконка для каждого шаблона (иначе все романтичные одинаковые). */
const TEMPLATE_EMOJI: Record<string, string> = {
  'date-ask': '💝',
  'secret-letter': '✉️',
  'mission-date': '🕵️',
  'movie-poster': '🎬',
  'wish-star': '🌠',
  'recipe-date': '🍳',
  quest: '🔍',
  'time-machine': '⏳',
  interrogation: '🎤',
  'tinder-story': '💘',
  horoscope: '♈',
  'ex-message': '📱',
  boarding: '✈️',
  'breaking-news': '📰',
};

/** Map one registry summary to a render-ready card view. */
function toTemplateView(summary: TemplateSummary): GalleryTemplateView {
  // Defensive: a template should always declare at least one theme, but fall
  // back to "neutral" so the gallery never renders a themeless, gradient-less
  // card if a schema is misconfigured.
  const themeIds = summary.themes.length > 0 ? summary.themes : ['neutral'];
  const defaultThemeId = themeIds[0];

  const themes: GalleryThemeView[] = themeIds.map((themeId) => ({
    id: themeId,
    label: themeLabel(themeId),
    emoji: resolveOgTheme(themeId).emoji,
    gradient: gradientFor(themeId),
    href: buildCreateHref(summary.id, themeId),
  }));

  return {
    id: summary.id,
    name: summary.name,
    description: summary.description,
    previewGradient: gradientFor(defaultThemeId),
    previewEmoji: TEMPLATE_EMOJI[summary.id] ?? resolveOgTheme(defaultThemeId).emoji,
    themes,
    createHref: buildCreateHref(summary.id, defaultThemeId),
  };
}

/**
 * Build the full gallery view model from a {@link TemplateRegistry}.
 *
 * Defaults to the application's singleton {@link templateRegistry}; a registry
 * can be injected for testing. Never throws — an empty registry yields an empty
 * array, which the page renders as the empty state (Requirement 1.4).
 */
export function buildGallery(
  registry: TemplateRegistry = galleryRegistry,
): GalleryTemplateView[] {
  return registry.list().map(toTemplateView);
}
