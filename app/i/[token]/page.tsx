/**
 * Public invitation page — `/i/[token]` (task 6.1).
 *
 * Server-rendered (SSR) entry point a guest opens from a messenger. It does two
 * jobs:
 *
 *  1. **Open Graph + privacy metadata** (`generateMetadata`, Requirement 4.2,
 *     Property 6): emits `og:title`, `og:description`
 *     («{{имя_адресата}}, у меня для тебя кое-что есть...») and `og:image`, and
 *     marks the page `robots: noindex, nofollow` so private invitations are not
 *     indexed by search engines (Requirement 11.3).
 *  2. **Render scaffold**: resolves the invitation via
 *     {@link InvitationService.getByToken} (public data only — never the
 *     author's email/telegram, Property 6) and renders a minimal SSR scaffold.
 *     The interactive client runtime (ScenarioEngine) is task 7.x. The
 *     `og:image` is generated dynamically by the sibling `opengraph-image.tsx`
 *     route (task 6.2) from the template theme and the invitation's public
 *     data, via Next's metadata-image file convention.
 *
 * When the link is unavailable — expired, one-time-view consumed, not yet
 * active, or unknown token — it shows a graceful "ссылка недоступна" screen
 * instead of a 500 (Requirement 4.4, Property 7).
 *
 * The page is always dynamic: tokens are unguessable and content is private, so
 * there is nothing to statically cache.
 */
import type { Metadata } from 'next';

import {
  InvitationUnavailableError,
  invitationService,
  type PublicInvitation,
  type UnavailableReason,
} from '@/lib/services/invitation';

import { InvitationRuntime } from './runtime/InvitationRuntime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PageProps {
  params: Promise<{ token: string }>;
}

/**
 * Resolve the public invitation for a token, returning `null` (instead of
 * throwing) when it is unavailable so both `generateMetadata` and the page
 * component can render their graceful fallbacks.
 */
async function resolvePublicInvitation(
  token: string,
): Promise<PublicInvitation | null> {
  try {
    return await invitationService.getByToken(token);
  } catch (error) {
    if (error instanceof InvitationUnavailableError) {
      return null;
    }
    throw error;
  }
}

/**
 * Open Graph + privacy metadata (Requirement 4.2, 11.3 / Property 6).
 *
 * Always `noindex, nofollow` — even for unavailable links — so a private
 * invitation page is never indexed. When the invitation is available the OG
 * tags are personalised from its public data; otherwise neutral metadata is
 * used for the unavailability screen.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const invitation = await resolvePublicInvitation(token);

  // Private pages must never be indexed (Requirement 11.3, Property 6).
  const robots = { index: false, follow: false } as const;

  if (!invitation) {
    return {
      title: 'Ссылка недоступна',
      robots,
    };
  }

  const { og } = invitation;
  // `og:image` (and the Twitter card image) are provided dynamically by the
  // sibling `opengraph-image.tsx` route (task 6.2) via Next's metadata-image
  // file convention, which renders a theme-based card per invitation. We
  // therefore do NOT set `images` here — doing so would emit a second,
  // conflicting static `og:image`. The convention auto-injects the dynamic one.
  return {
    title: og.title,
    description: og.description,
    robots,
    openGraph: {
      title: og.title,
      description: og.description,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: og.title,
      description: og.description,
    },
  };
}

/** Human-readable copy for each unavailability reason (Requirement 4.4). */
const UNAVAILABLE_COPY: Record<UnavailableReason, string> = {
  not_found: 'Такой ссылки не существует или она была удалена.',
  not_active: 'Это приглашение ещё не активировано.',
  expired: 'Срок действия этой ссылки истёк.',
  consumed: 'Эта ссылка была одноразовой и уже использована.',
};

/** Graceful "ссылка недоступна" screen shown instead of a 500 (Req 4.4). */
function UnavailableScreen({ reason }: { reason: UnavailableReason }) {
  return (
    <div className="invitation-page">
      <main
        style={{
          maxWidth: 420,
          margin: '0 auto',
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '2rem 1.5rem',
        }}
      >
        <div style={{ fontSize: '3rem' }} aria-hidden>💌</div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 400, margin: '1rem 0 0.5rem', color: 'var(--text)' }}>
          Ссылка недоступна
        </h1>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, fontSize: '0.9rem' }}>{UNAVAILABLE_COPY[reason]}</p>
      </main>
    </div>
  );
}

export default async function InvitationPage({ params }: PageProps) {
  const { token } = await params;

  try {
    const invitation = await invitationService.getByToken(token);
    return (
      <div className="invitation-page">
        <InvitationRuntime invitation={invitation} />
      </div>
    );
  } catch (error) {
    if (error instanceof InvitationUnavailableError) {
      return <UnavailableScreen reason={error.reason} />;
    }
    throw error;
  }
}
