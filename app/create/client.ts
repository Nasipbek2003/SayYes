/**
 * Client-side API calls for the author creation flow (task 10.2).
 *
 * Thin, framework-independent wrappers around the author endpoints (tasks
 * 4.2/4.3/4.4/5.1) the {@link CreateForm} uses. Kept out of the React component
 * so the call shape is easy to reason about and mock:
 *
 *  - {@link createDraft}  → `POST /api/invitations`               (Req 2.6)
 *  - {@link updateDraft}  → `PATCH /api/invitations/:id`          (Req 2.6, auto-save)
 *  - {@link uploadPhoto}  → `POST /api/invitations/:id/photo`     (Req 2.2)
 *  - {@link fetchPreview} → `GET  /api/invitations/:id/preview`   (Req 2.5)
 *  - {@link startCheckout}→ `POST /api/invitations/:id/checkout`  (Req 3.1)
 *
 * All calls are same-origin and rely on the author session cookie. A `401`
 * surfaces as {@link UnauthorizedError} so the form can redirect the author to
 * `/login` (creating an invitation is an author operation — see the create page
 * docs).
 */
import type { CheckoutTier } from '@/lib/services/payment';
import type { PreviewPayload } from '@/lib/services/invitation';

/** Thrown when an author API call returns 401 (no/expired session). */
export class UnauthorizedError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'UnauthorizedError';
  }
}

/** Thrown for non-2xx responses other than 401, carrying the server message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Parse a JSON response or throw a typed error for non-2xx statuses. */
async function parseJson<T>(res: Response): Promise<T> {
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

/** Minimal shape of a persisted invitation returned by create/update. */
export interface DraftInvitation {
  id: string;
  templateId: string;
  themeId: string;
  status: string;
  data: Record<string, unknown>;
}

/** Create a draft invitation for the chosen template/theme (Requirement 2.6). */
export async function createDraft(
  input: {
    templateId: string;
    themeId: string;
    data?: Record<string, unknown>;
    /** Telegram nickname to notify on a guest response (optional). */
    notifyTelegram?: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<DraftInvitation> {
  const res = await fetchImpl('/api/invitations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson<DraftInvitation>(res);
}

/** Auto-save: merge data and/or switch theme on an existing draft (Req 2.6). */
export async function updateDraft(
  id: string,
  patch: {
    data?: Record<string, unknown>;
    themeId?: string;
    /** Telegram nickname to notify on a guest response (optional). */
    notifyTelegram?: string | null;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<DraftInvitation> {
  const res = await fetchImpl(`/api/invitations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return parseJson<DraftInvitation>(res);
}

/** Upload a photo for the draft, returning its URL (Requirement 2.2). */
export async function uploadPhoto(
  id: string,
  file: File,
  fetchImpl: typeof fetch = fetch,
): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetchImpl(`/api/invitations/${encodeURIComponent(id)}/photo`, {
    method: 'POST',
    body: form,
  });
  return parseJson<{ url: string }>(res);
}

/** Fetch the preview payload for the draft (Requirement 2.5). */
export async function fetchPreview(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PreviewPayload> {
  const res = await fetchImpl(
    `/api/invitations/${encodeURIComponent(id)}/preview`,
  );
  return parseJson<PreviewPayload>(res);
}

/** Start checkout for the chosen tier, returning the hosted URL (Req 3.1). */
export async function startCheckout(
  id: string,
  tier: CheckoutTier,
  fetchImpl: typeof fetch = fetch,
): Promise<{ checkoutUrl: string }> {
  const res = await fetchImpl(
    `/api/invitations/${encodeURIComponent(id)}/checkout`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tier }),
    },
  );
  return parseJson<{ checkoutUrl: string }>(res);
}

/** Dev-only: activate a draft without payment. */
export async function devActivate(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ url: string; token: string }> {
  const res = await fetchImpl(
    `/api/invitations/${encodeURIComponent(id)}/dev-activate`,
    { method: 'POST' },
  );
  return parseJson<{ url: string; token: string }>(res);
}

/** Result of a Telegram-nickname reachability check. */
export interface TelegramLinkStatus {
  /** Whether the input is a structurally valid Telegram username. */
  valid: boolean;
  /** Whether the bot already has a chat with this user (can send messages). */
  linked: boolean;
}

/**
 * Check whether the bot can message a given Telegram nickname (i.e. that user
 * has pressed Start). Throws {@link UnauthorizedError} on 401 so the caller can
 * fall back to the "press Start" guidance.
 */
export async function checkTelegramLink(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TelegramLinkStatus> {
  const res = await fetchImpl(
    `/api/telegram/contact?username=${encodeURIComponent(username)}`,
  );
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) return { valid: false, linked: false };
  return (await res.json()) as TelegramLinkStatus;
}
