/**
 * Tests for the dynamic Open Graph image route `/i/[token]` (task 6.2).
 *
 * These cover the route adapter around {@link InvitationService.getByToken}:
 *  - it exports the spec-mandated 1200×630 size and `image/png` content type;
 *  - it returns an `ImageResponse` (a `Response` with `content-type: image/png`)
 *    for an available invitation;
 *  - it does NOT throw for an unavailable link (expired / consumed / unknown /
 *    not active) — it degrades to a neutral card so link previews never 500
 *    (Requirement 4.4, Property 6);
 *  - it does NOT throw for unexpected service errors either.
 *
 * The {@link InvitationService} singleton is mocked; the OG *content* derivation
 * is unit-tested in `lib/og/image-content.test.ts`. We assert on the synchronous
 * response metadata (status/headers/size) rather than reading the streamed body,
 * which would trigger full rasterisation.
 *
 * **Validates: Requirements 4.2, 4.4**
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  InvitationUnavailableError,
  type PublicInvitation,
} from '@/lib/services/invitation';

const getByToken = vi.fn();

vi.mock('@/lib/services/invitation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/invitation')>(
    '@/lib/services/invitation',
  );
  return {
    ...actual,
    invitationService: {
      getByToken: (...args: unknown[]) => getByToken(...args),
    },
  };
});

// Import AFTER the mock is registered.
const imageModule = await import('./opengraph-image');
const Image = imageModule.default;
const { size, contentType } = imageModule;

const params = (token = 'tok123456789') => ({ params: Promise.resolve({ token }) });

const PUBLIC_INVITATION: PublicInvitation = {
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
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('route metadata exports', () => {
  it('declares the 1200x630 canvas and PNG content type', () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe('image/png');
  });
});

describe('Image() generation (Requirement 4.2)', () => {
  it('returns a PNG ImageResponse for an available invitation', async () => {
    getByToken.mockResolvedValue(PUBLIC_INVITATION);

    const response = await Image(params());

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('content-type')).toBe('image/png');
  });
});

describe('graceful degradation (Requirement 4.4, Property 6)', () => {
  it.each(['expired', 'consumed', 'not_found', 'not_active'] as const)(
    'returns a neutral card (no throw) for unavailable reason=%s',
    async (reason) => {
      getByToken.mockRejectedValue(new InvitationUnavailableError(reason));

      const response = await Image(params());

      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('content-type')).toBe('image/png');
    },
  );

  it('returns a neutral card (no throw) for unexpected service errors', async () => {
    getByToken.mockRejectedValue(new Error('db down'));

    const response = await Image(params());

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('content-type')).toBe('image/png');
  });
});
