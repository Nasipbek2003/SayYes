/**
 * Pure content model for the dynamic Open Graph preview image (task 6.2).
 *
 * Separating *what* the OG image says from *how* it is rendered keeps the
 * substance unit-testable without invoking `next/og`'s `ImageResponse` (which
 * needs a runtime to rasterise). {@link buildOgImageContent} turns the public
 * invitation projection — or `null` for an unavailable/private link — into a
 * small {@link OgImageContent} describing the theme palette and the text to
 * paint. The `.tsx` route then maps this to the JSX passed to `ImageResponse`.
 *
 * Privacy (Requirement 4.2, Property 6): the content is derived only from the
 * already-public {@link PublicInvitation} (which never carries author contact
 * data), and for an unavailable link a neutral card with *no* invitation data
 * is produced.
 */
import type { PublicInvitation } from '@/lib/services/invitation';
import { NEUTRAL_THEME, resolveOgTheme, type OgTheme } from '@/lib/og/theme';

/** Open Graph image canvas size mandated by the spec/task: 1200×630. */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** Resolved, ready-to-paint content for the OG image. */
export interface OgImageContent {
  /** Theme palette driving the card's colours (Requirement 4.2). */
  theme: OgTheme;
  /** Large intriguing headline (the addressee teaser or a neutral line). */
  title: string;
  /** Smaller supporting line (template name / brand) — may be empty. */
  subtitle: string;
  /**
   * Optional author photo URL to feature on the card. Absent when the author
   * provided no photo, in which case the renderer uses the thematic background
   * only (task 6.2 requirement).
   */
  photo?: string;
  /** Whether this is the neutral fallback card (unavailable/private link). */
  neutral: boolean;
}

/** Headline used when no addressee name is available, and for neutral cards. */
const NEUTRAL_TITLE = 'У меня для тебя кое-что есть...';

/** Read the author photo from public invitation data, if any. */
function resolvePhoto(invitation: PublicInvitation): string | undefined {
  const data = invitation.data as Record<string, unknown>;
  const candidate = data['фото'] ?? data['фото_обложка'];
  if (typeof candidate === 'string' && candidate.trim() !== '') {
    return candidate.trim();
  }
  return undefined;
}

/**
 * Build the {@link OgImageContent} for the OG preview.
 *
 * @param invitation - The public invitation projection, or `null` when the link
 *   is unavailable/private (renders a neutral card with no invitation data).
 */
export function buildOgImageContent(
  invitation: PublicInvitation | null,
): OgImageContent {
  if (!invitation) {
    return {
      theme: NEUTRAL_THEME,
      title: NEUTRAL_TITLE,
      subtitle: '',
      neutral: true,
    };
  }

  const theme = resolveOgTheme(invitation.themeId);
  // `og.description` is the spec's intriguing teaser
  // («{{имя_адресата}}, у меня для тебя кое-что есть...»), already personalised
  // and free of private data — reuse it as the headline.
  const title = invitation.og.description?.trim() || NEUTRAL_TITLE;
  const subtitle = invitation.template?.name?.trim() ?? '';

  return {
    theme,
    title,
    subtitle,
    ...(resolvePhoto(invitation) ? { photo: resolvePhoto(invitation) } : {}),
    neutral: false,
  };
}
