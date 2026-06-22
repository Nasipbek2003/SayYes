/**
 * Dynamic Open Graph image for the public invitation page — `/i/[token]`
 * (task 6.2, Requirement 4.2).
 *
 * Next.js' metadata-image file convention: exporting a default function from
 * `opengraph-image.tsx` makes Next generate `<meta og:image>` (and the Twitter
 * card image) for the sibling `page.tsx` automatically, pointing at the route
 * this function backs. It replaces the static `/og/<template>.png` placeholder
 * wired in task 6.1 with a per-invitation image rendered from the template's
 * theme and the invitation's public data.
 *
 * The image is produced with `next/og`'s {@link ImageResponse} (the
 * `@vercel/og` Satori renderer) at the spec-mandated 1200×630. Its *content* is
 * derived by the pure {@link buildOgImageContent} helper so it can be
 * unit-tested without rasterising; this module only maps that content to JSX.
 *
 * Privacy & resilience (Requirement 4.2 / 4.4, Property 6):
 *  - data comes only from {@link InvitationService.getByToken}, which returns
 *    the public projection (never the author's email/telegram);
 *  - an unavailable/unknown/expired link renders a neutral thematic card with
 *    no private data instead of throwing, so link previews never 500.
 */
import { ImageResponse } from 'next/og';

import { buildOgImageContent, OG_IMAGE_SIZE } from '@/lib/og/image-content';
import {
  InvitationUnavailableError,
  invitationService,
  type PublicInvitation,
} from '@/lib/services/invitation';

export const runtime = 'nodejs';
// Tokens are unguessable and content is private — never statically cache.
export const dynamic = 'force-dynamic';

/** Canvas size required for OG images (1200×630). */
export const size = OG_IMAGE_SIZE;
/** All generated cards are PNGs. */
export const contentType = 'image/png';
/** Accessible alt text for the generated card. */
export const alt = 'Превью приглашения';

interface ImageProps {
  params: Promise<{ token: string }>;
}

/**
 * Resolve the public invitation for the token, returning `null` (instead of
 * throwing) for any unavailable link so a neutral card can be rendered.
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
    // Unexpected errors also degrade to the neutral card rather than failing the
    // preview — a broken og:image must never break link sharing.
    return null;
  }
}

/** Generate the dynamic OG image for `/i/[token]`. */
export default async function Image({ params }: ImageProps): Promise<ImageResponse> {
  const { token } = await params;
  const invitation = await resolvePublicInvitation(token);
  const content = buildOgImageContent(invitation);
  const { theme } = content;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '80px',
          backgroundImage: `linear-gradient(135deg, ${theme.backgroundFrom} 0%, ${theme.backgroundTo} 100%)`,
          fontFamily: 'sans-serif',
        }}
      >
        {content.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={content.photo}
            alt=""
            width={220}
            height={220}
            style={{
              width: 220,
              height: 220,
              borderRadius: '9999px',
              objectFit: 'cover',
              border: `8px solid ${theme.accent}`,
              marginBottom: 48,
            }}
          />
        ) : (
          <div style={{ fontSize: 140, marginBottom: 24, display: 'flex' }}>
            {theme.emoji}
          </div>
        )}

        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: theme.textColor,
            lineHeight: 1.15,
            maxWidth: 1000,
            display: 'flex',
          }}
        >
          {content.title}
        </div>

        {content.subtitle ? (
          <div
            style={{
              marginTop: 28,
              fontSize: 34,
              color: theme.mutedColor,
              display: 'flex',
            }}
          >
            {content.subtitle}
          </div>
        ) : null}
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
    },
  );
}
