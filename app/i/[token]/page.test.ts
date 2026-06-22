/**
 * Integration tests for the public invitation SSR page `/i/[token]` (task 6.1).
 *
 * Covers the HTTP/SSR adapter logic around {@link InvitationService.getByToken}:
 *  - `generateMetadata` emits the intriguing OG tags and `robots: noindex`
 *    (Property 6, Requirements 4.2 / 11.3);
 *  - an unavailable link (expired / one-time consumed / unknown / not active)
 *    yields a graceful unavailability screen and still stays `noindex`
 *    (Property 7, Requirement 4.4);
 *  - the page never throws for an unavailable link (no 500).
 *
 * The {@link InvitationService} singleton is mocked so these tests focus on the
 * page's metadata/branching; `getByToken`'s own privacy/lifetime behaviour is
 * unit-tested in `lib/services/invitation.test.ts`.
 *
 * **Validates: Requirements 4.1, 4.2, 4.4, 11.2, 11.3, 11.4**
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
const pageModule = await import('./page');
const { generateMetadata } = pageModule;
const InvitationPage = pageModule.default;

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

describe('generateMetadata (Property 6)', () => {
  it('emits OG title/description/image and robots noindex for an available link', async () => {
    getByToken.mockResolvedValue(PUBLIC_INVITATION);

    const meta = await generateMetadata(params());

    expect(meta.title).toBe('Приглашение на свидание');
    expect(meta.description).toBe('Айя, у меня для тебя кое-что есть...');
    expect(meta.openGraph?.title).toBe('Приглашение на свидание');
    expect(meta.openGraph?.description).toBe('Айя, у меня для тебя кое-что есть...');
    // `og:image` is injected by the sibling `opengraph-image.tsx` route (task
    // 6.2) via Next's metadata-image convention, so it is NOT set here.
    expect(meta.openGraph?.images).toBeUndefined();
    // Privacy: must not be indexed (Requirement 11.3).
    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });

  it('stays noindex even for an unavailable link (Property 6/7)', async () => {
    getByToken.mockRejectedValue(new InvitationUnavailableError('expired'));

    const meta = await generateMetadata(params());

    expect(meta.robots).toMatchObject({ index: false, follow: false });
    expect(meta.title).toBe('Ссылка недоступна');
    // No OG card for an unavailable invitation.
    expect(meta.openGraph).toBeUndefined();
  });
});

describe('page rendering (Property 7, Requirement 4.4)', () => {
  it('renders the scaffold for an available invitation', async () => {
    getByToken.mockResolvedValue(PUBLIC_INVITATION);

    const element = (await InvitationPage(params())) as JSX.Element;

    // The available branch renders the scaffold component with the public
    // invitation as its prop (the unavailability branch passes a `reason`).
    expect(element.props.invitation).toEqual(PUBLIC_INVITATION);
    expect(element.props.reason).toBeUndefined();
  });

  it.each(['expired', 'consumed', 'not_found', 'not_active'] as const)(
    'renders the graceful unavailability screen for reason=%s (no throw)',
    async (reason) => {
      getByToken.mockRejectedValue(new InvitationUnavailableError(reason));

      // Must NOT throw (no 500) — Requirement 4.4.
      const element = (await InvitationPage(params())) as JSX.Element;
      expect(element).toBeTruthy();
      // The unavailability screen is a <main> without the scaffold's data attrs.
      expect(element.props['data-template']).toBeUndefined();
    },
  );

  it('propagates unexpected (non-availability) errors', async () => {
    getByToken.mockRejectedValue(new Error('db down'));
    await expect(InvitationPage(params())).rejects.toThrow('db down');
  });
});
