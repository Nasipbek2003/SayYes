/**
 * Unit tests for the OG image content model (task 6.2).
 *
 * These exercise the pure {@link buildOgImageContent} helper and
 * {@link resolveOgTheme} that decide *what* the dynamic Open Graph card says and
 * which theme palette it uses — without rasterising via `next/og`. They cover:
 *  - the card reflects the invitation's theme palette (Requirement 4.2);
 *  - the intriguing teaser is used as the headline, and the template name as
 *    the subtitle;
 *  - the author photo is featured when present, otherwise the thematic emoji;
 *  - an unavailable/private link yields a neutral card carrying NO invitation
 *    data (Requirement 4.4, Property 6).
 *
 * **Validates: Requirements 4.2**
 */
import { describe, expect, it } from 'vitest';

import {
  buildOgImageContent,
  OG_IMAGE_SIZE,
} from '@/lib/og/image-content';
import { NEUTRAL_THEME, resolveOgTheme } from '@/lib/og/theme';
import type { PublicInvitation } from '@/lib/services/invitation';

const baseInvitation = (
  overrides: Partial<PublicInvitation> = {},
): PublicInvitation => ({
  token: 'tok123456789',
  templateId: 'simple-date',
  themeId: 'romantic',
  features: {
    showBrandSignature: true,
    music: false,
    advancedAnimations: false,
    authorNotifications: false,
    premiumFeatures: [],
  },
  template: {
    name: 'Приглашение на свидание',
    description: 'desc',
    startScreen: 'intro',
    screens: [],
  },
  data: { имя_адресата: 'Айя' },
  places: [],
  og: {
    title: 'Приглашение на свидание',
    description: 'Айя, у меня для тебя кое-что есть...',
    image: 'https://cdn/x.png',
  },
  alreadyResponded: false,
  ...overrides,
});

describe('OG_IMAGE_SIZE', () => {
  it('is the spec-mandated 1200x630 canvas', () => {
    expect(OG_IMAGE_SIZE).toEqual({ width: 1200, height: 630 });
  });
});

describe('resolveOgTheme', () => {
  it('resolves a known theme to its palette', () => {
    expect(resolveOgTheme('romantic').id).toBe('romantic');
    expect(resolveOgTheme('festive').id).toBe('festive');
  });

  it('falls back to the neutral palette for unknown/missing themes', () => {
    expect(resolveOgTheme('does-not-exist')).toBe(NEUTRAL_THEME);
    expect(resolveOgTheme(undefined)).toBe(NEUTRAL_THEME);
    expect(resolveOgTheme(null)).toBe(NEUTRAL_THEME);
  });
});

describe('buildOgImageContent', () => {
  it('reflects the invitation theme and intriguing teaser (Req 4.2)', () => {
    const content = buildOgImageContent(baseInvitation());

    expect(content.neutral).toBe(false);
    expect(content.theme.id).toBe('romantic');
    expect(content.title).toBe('Айя, у меня для тебя кое-что есть...');
    expect(content.subtitle).toBe('Приглашение на свидание');
  });

  it('features the author photo when present', () => {
    const content = buildOgImageContent(
      baseInvitation({
        data: { имя_адресата: 'Айя', фото: 'https://cdn/aya.jpg' },
      }),
    );

    expect(content.photo).toBe('https://cdn/aya.jpg');
  });

  it('reads the event cover photo for the event template', () => {
    const content = buildOgImageContent(
      baseInvitation({
        templateId: 'event-rsvp',
        themeId: 'festive',
        data: { название_события: 'Той', фото_обложка: 'https://cdn/cover.jpg' },
      }),
    );

    expect(content.photo).toBe('https://cdn/cover.jpg');
    expect(content.theme.id).toBe('festive');
  });

  it('omits the photo (uses the thematic emoji) when none is provided', () => {
    const content = buildOgImageContent(baseInvitation({ data: {} }));

    expect(content.photo).toBeUndefined();
    expect(content.theme.emoji).toBeTruthy();
  });

  it('uses the neutral palette for an unknown theme', () => {
    const content = buildOgImageContent(
      baseInvitation({ themeId: 'mystery-theme' }),
    );

    expect(content.theme).toBe(NEUTRAL_THEME);
  });

  it('produces a neutral card with NO invitation data for an unavailable link (Req 4.4, Property 6)', () => {
    const content = buildOgImageContent(null);

    expect(content.neutral).toBe(true);
    expect(content.theme).toBe(NEUTRAL_THEME);
    expect(content.photo).toBeUndefined();
    expect(content.subtitle).toBe('');
    // No private/addressee data leaks into the neutral card.
    expect(content.title).toBe('У меня для тебя кое-что есть...');
  });
});
