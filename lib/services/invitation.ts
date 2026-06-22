/**
 * Invitation domain service (task 4.2).
 *
 * Implements draft CRUD and auto-save for an author's invitations on top of the
 * thin invitation repository and the {@link TemplateRegistry}. The HTTP layer
 * (Route Handlers under `app/api/invitations`) is a thin adapter around these
 * methods.
 *
 * ## Auto-save vs. readiness validation (Requirements 2.3, 2.6)
 *
 * These two concerns are deliberately separated:
 *
 *  - **Auto-save** (`createDraft` / `updateDraft`, Requirement 2.6) is tolerant
 *    of *incomplete* data. While the author is still filling in the form we
 *    must never lose their work, so a draft is persisted regardless of whether
 *    every required field is present. On create/update we only validate the
 *    structural invariants that make a draft addressable at all:
 *      - `templateId` must reference a known template (otherwise the draft
 *        could never be rendered) → {@link InvitationServiceError} 404.
 *      - `themeId` must be one of the template's declared themes → 400.
 *    We do **not** run `validateAuthorData` here — partial data is expected.
 *
 *  - **Readiness validation** (`validateForActivation`, Requirement 2.3) is the
 *    explicit "check my fields" path. It runs the full
 *    `TemplateRegistry.validateAuthorData` against the stored draft data and
 *    returns a {@link ValidationResult} listing per-field errors. The UI calls
 *    this when the author asks to proceed (preview/checkout) and blocks the
 *    transition while `ok === false`. It returns a result object rather than
 *    throwing, because field errors are an expected, user-facing outcome — not
 *    an exceptional condition.
 *
 * Ownership and draft-mutability are enforced on every mutation:
 *  - editing someone else's invitation → 403 (via `assertOwnership`);
 *  - editing a non-DRAFT (already paid/active) invitation → 409, because an
 *    activated invitation's content is frozen.
 */
import { randomBytes } from 'node:crypto';

import { assertOwnership } from '@/lib/auth/guards';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import {
  invitationRepo as defaultInvitationRepo,
  openEventRepo as defaultOpenEventRepo,
  responseRepo as defaultResponseRepo,
} from '@/lib/repositories';
import { templateRegistry as defaultRegistry } from '@/lib/templates/registry';
import { TemplateNotFoundError } from '@/lib/templates/registry';
import { resolveTierFeatures } from '@/lib/services/tier';
import type { TierFeatures } from '@/lib/services/tier';
import { summariseRsvp } from '@/lib/services/rsvpSummary';
import type { RsvpSummary } from '@/lib/services/rsvpSummary';
import { notificationService } from '@/lib/services/notification';
import type {
  Invitation,
  InvitationStatus,
  OpenEvent,
  Prisma,
  Response as GuestResponseRow,
  Tier,
} from '@prisma/client';
import type {
  GuestResponse,
  TemplateRegistry,
  TemplateSchema,
  ValidationError,
  ValidationResult,
} from '@/templates/types';

/** Error carrying the HTTP status the handler should return for domain failures. */
export class InvitationServiceError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
    /** Optional machine-readable code for the client. */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'InvitationServiceError';
  }
}

/** Repository surface the service depends on (subset of the invitation repo). */
export interface InvitationRepo {
  create: typeof defaultInvitationRepo.create;
  update: typeof defaultInvitationRepo.update;
  findById: typeof defaultInvitationRepo.findById;
  findByToken: typeof defaultInvitationRepo.findByToken;
  setTokenAndActivate: typeof defaultInvitationRepo.setTokenAndActivate;
  /** List all invitations owned by an author (newest first) — cabinet list. */
  findByAuthor: typeof defaultInvitationRepo.findByAuthor;
}

/** Response repository surface used to detect a completed one-time view. */
export interface ResponseRepo {
  findByInvitation: typeof defaultResponseRepo.findByInvitation;
  /** Idempotent upsert of a guest's answer keyed by `(invitationId, guestKey)`. */
  upsertResponse: typeof defaultResponseRepo.upsertResponse;
  /** Lookup an existing answer by its idempotency key (create vs. update). */
  findByGuestKey: typeof defaultResponseRepo.findByGuestKey;
  /** Count an invitation's responses (cabinet "отвечено" status). */
  countByInvitation: typeof defaultResponseRepo.countByInvitation;
}

/** OpenEvent repository surface used to record/inspect invitation opens. */
export interface OpenEventRepo {
  create: typeof defaultOpenEventRepo.create;
  countByInvitation: typeof defaultOpenEventRepo.countByInvitation;
  /** List an invitation's open events (cabinet detail view). */
  findByInvitation: typeof defaultOpenEventRepo.findByInvitation;
}

/**
 * Why a public invitation link is unavailable to the guest. Drives the
 * graceful "ссылка недоступна" screen rather than a 500 (Requirement 4.4).
 */
export type UnavailableReason =
  /** No invitation matches the token. */
  | 'not_found'
  /** Invitation exists but is not yet ACTIVE (draft / awaiting payment). */
  | 'not_active'
  /** `expiresAt` is in the past (Requirement 11.2). */
  | 'expired'
  /** `oneTimeView` and the single view has already been completed (Req 11.4). */
  | 'consumed';

/**
 * Raised by {@link InvitationService.getByToken} when an invitation cannot be
 * shown to the guest. The SSR page maps this to the graceful unavailability
 * screen (never a 500) — Requirement 4.4, Property 7.
 */
export class InvitationUnavailableError extends Error {
  constructor(readonly reason: UnavailableReason) {
    super(`Invitation unavailable: ${reason}`);
    this.name = 'InvitationUnavailableError';
  }
}

/** Result of activating an invitation: the public token and its full URL. */
export interface ActivationResult {
  /** Short public token assigned to the invitation. */
  token: string;
  /** Full public URL the author shares with the guest (`/i/<token>`). */
  url: string;
}

/**
 * Raised by {@link InvitationService.recordResponse} when the guest's answer
 * fails server-side validation against the template schema (Property 5,
 * Requirement 5.5). The Route Handler maps this to a 400 with the per-field
 * errors so the client can correct the answer. The server never trusts the
 * client: an answer that does not match the schema (unknown place, wrong type,
 * missing RSVP fields) is rejected here before anything is persisted.
 */
export class ResponseValidationError extends Error {
  constructor(readonly errors: ValidationError[]) {
    super('Guest response failed validation.');
    this.name = 'ResponseValidationError';
  }
}

/**
 * Outcome of {@link InvitationService.recordOpen}. Recording the first open is
 * idempotent in spirit (Requirement 9.1): the very first open is the one that
 * later triggers the author notification (task 9.x), while subsequent opens are
 * reported as repeats and do not re-trigger it.
 */
export interface RecordOpenResult {
  /** The persisted open event. */
  event: OpenEvent;
  /** True when this was the first open of the invitation. */
  firstOpen: boolean;
}

/**
 * Outcome of {@link InvitationService.recordResponse} (Property 3,
 * Requirements 5.5/8.5). Repeating an answer for the same `(invitationId,
 * guestKey)` updates the existing row rather than creating a duplicate.
 */
export interface RecordResponseResult {
  /** The upserted response row (one per `(invitationId, guestKey)`). */
  response: GuestResponseRow;
  /** True when this answer updated a pre-existing response (idempotent repeat). */
  updated: boolean;
}

/**
 * Length (in characters) of the generated public token. 12 base32 characters
 * give ~60 bits of entropy — short enough for a tidy URL, long enough to be
 * unguessable for a private invitation link.
 */
const TOKEN_LENGTH = 12;

/** Crockford-style base32 alphabet (no ambiguous I/L/O/U) for short tokens. */
const TOKEN_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** Generate a short, URL-safe, unguessable public token. */
export function generateToken(length: number = TOKEN_LENGTH): string {
  const bytes = randomBytes(length);
  let token = '';
  for (let i = 0; i < length; i += 1) {
    token += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return token;
}

/** Injectable dependencies (kept explicit so the service is unit-testable). */
export interface InvitationServiceDeps {
  registry: TemplateRegistry;
  repo: InvitationRepo;
  responseRepo: ResponseRepo;
  openEventRepo: OpenEventRepo;
  /**
   * Extension point for author notifications (task 9.1 — the
   * {@link NotificationService}). When provided, it is invoked **inside the same
   * transaction** as the domain write (open/response) with the transaction
   * client `tx`, so the domain row and its outbox row are persisted atomically
   * (Correctness Property 8 — every domain event yields exactly one outbox row
   * and is never lost).
   *
   * Unlike the previous best-effort hook, failures here are NOT swallowed: a
   * throw rolls back the enclosing transaction so a domain change is never
   * persisted without its notification event. The hook is optional purely so the
   * service can be unit-tested without the notification layer.
   */
  onDomainEvent?: (
    event: DomainEvent,
    tx: Prisma.TransactionClient,
  ) => void | Promise<void>;
  /**
   * Runs `fn` inside a database transaction, passing the transaction client.
   * Defaults to `prisma.$transaction` in the singleton; tests inject a simple
   * pass-through that hands over a fake client, so transactionality can be
   * exercised without a real database.
   */
  runTransaction?: <T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ) => Promise<T>;
}

/**
 * A recorded guest-facing domain event handed to the optional
 * {@link InvitationServiceDeps.onDomainEvent} hook (extension point for the
 * task 9.x notification outbox). Carries enough context for the notification
 * layer without coupling this service to it.
 */
export type DomainEvent =
  | {
      kind: 'open';
      invitation: Invitation;
      /** True only for the very first open (Requirement 9.1). */
      firstOpen: boolean;
    }
  | {
      kind: 'response';
      invitation: Invitation;
      response: GuestResponse;
      /** True when an existing answer was updated rather than created. */
      updated: boolean;
    };

/** Author data is an open record of `{{переменные}}` keyed by field key. */
export type AuthorData = Record<string, unknown>;

/** Patch accepted by {@link InvitationService.updateDraft} (auto-save). */
export interface UpdateDraftPatch {
  /** Partial author data to merge into the existing draft data. */
  data?: AuthorData;
  /** Optionally switch the colour theme (validated against the template). */
  themeId?: string;
}

/**
 * Everything the client needs to render an invitation preview *before* payment
 * (Requirement 2.5). It mirrors the public render payload but is assembled from
 * the draft's author data and the template schema, so the author can see how
 * the invitation will look without activating it.
 */
export interface PreviewPayload {
  /** Invitation id being previewed. */
  invitationId: string;
  /** Template id and chosen colour theme used to render the scenario. */
  templateId: string;
  themeId: string;
  /** Current tier — drives the brand signature in the preview (Requirement 3.5/3.6). */
  tier: Tier;
  /**
   * Concrete capability flags derived from `tier` (Requirement 3.5/3.6,
   * Property 9): whether the brand signature is shown and which premium
   * features (music, advanced animations, author notifications) are enabled.
   * The renderer uses these instead of branching on the raw tier.
   */
  features: TierFeatures;
  /** Draft status (always a pre-activation status for a previewable draft). */
  status: InvitationStatus;
  /** Template presentation metadata. */
  template: {
    name: string;
    description: string;
    /** First screen the scenario engine should render. */
    startScreen: string;
    /** Full screen list (texts, buttons, images) for the runtime engine. */
    screens: TemplateSchema['screens'];
    /** Premium features unlocked by the premium tier. */
    premiumFeatures: string[];
  };
  /** Author-entered `{{переменные}}` (texts, photo refs) used for substitution. */
  data: AuthorData;
  /**
   * Convenience projection of the author's place list (Template 2), already
   * normalised to `{ название, фото?, описание? }` cards for the picker. Empty
   * for templates without a place list.
   */
  places: PreviewPlace[];
  /**
   * Readiness of the draft. The preview renders regardless (partial data is
   * fine), but the client uses this to indicate which required fields still
   * need filling before checkout (Requirement 2.3/2.5).
   */
  validation: ValidationResult;
}

/** A normalised place card surfaced in the preview payload. */
export interface PreviewPlace {
  название: string;
  фото?: string;
  описание?: string;
}

/**
 * Open Graph metadata for the public invitation page (Requirement 4.2,
 * Property 6). The intriguing description follows the spec exactly:
 * «{{имя_адресата}}, у меня для тебя кое-что есть...».
 */
export interface OpenGraphMeta {
  /** `og:title` — the invitation's display title. */
  title: string;
  /** `og:description` — intriguing teaser with the addressee's name. */
  description: string;
  /** `og:image` — preview image URL (static template preview in task 6.1). */
  image: string;
}

/**
 * Public, guest-facing projection of an invitation returned by
 * {@link InvitationService.getByToken}.
 *
 * Contains ONLY what the runtime needs to render the scenario (texts, photos,
 * place list, theme, template schema, tier features) plus the Open Graph
 * metadata. It deliberately omits every private author field (email,
 * telegramChatId, authorId) — Property 6 / Requirement 11.3.
 */
export interface PublicInvitation {
  /** Public token of the invitation (already validated as available). */
  token: string;
  /** Template id and chosen colour theme used to render the scenario. */
  templateId: string;
  themeId: string;
  /**
   * Concrete capability flags derived from `tier` (Property 9). The raw tier is
   * intentionally not exposed; only the resolved render flags are.
   */
  features: TierFeatures;
  /** Template presentation metadata + screens for the runtime engine. */
  template: {
    name: string;
    description: string;
    startScreen: string;
    screens: TemplateSchema['screens'];
  };
  /** Author-entered `{{переменные}}` (texts, photo refs) used for substitution. */
  data: AuthorData;
  /** Normalised place cards (empty for templates without a place list). */
  places: PreviewPlace[];
  /** Open Graph metadata for the SSR page. */
  og: OpenGraphMeta;
  /**
   * Whether a single-addressee answer already exists for this invitation
   * (Requirement 5.7). When `true`, a repeat open should jump straight to the
   * final "уже отвечено" screen instead of replaying the scenario. It reflects a
   * response stored under the single-guest key, so multi-guest RSVP templates
   * (where each guest answers under their own key) always read `false`.
   */
  alreadyResponded: boolean;
}

/**
 * Derived lifecycle status shown in the author's cabinet list (Requirement
 * 10.1). It folds the storage {@link InvitationStatus} together with whether
 * any guest has answered:
 *  - `draft`     — not yet activated (DRAFT / PENDING_PAYMENT);
 *  - `active`    — activated link with no answers yet;
 *  - `responded` — activated link with at least one guest answer;
 *  - `expired`   — past its lifetime / swept to EXPIRED.
 */
export type CabinetStatus = 'draft' | 'active' | 'responded' | 'expired';

/** A single row in the author's cabinet invitation list (Requirement 10.1). */
export interface CabinetListItem {
  /** Invitation id. */
  id: string;
  /** Template id and chosen theme. */
  templateId: string;
  themeId: string;
  /** Template display name (resolved from the registry). */
  templateName: string;
  /** Raw storage status. */
  status: InvitationStatus;
  /** Derived lifecycle status for the list badge (Requirement 10.1). */
  cabinetStatus: CabinetStatus;
  /** Public URL once activated (null for drafts). */
  url: string | null;
  /** Number of times the link was opened. */
  opens: number;
  /** Number of guest responses collected. */
  responses: number;
  /** When the draft was created. */
  createdAt: Date;
  /** When the invitation was activated (null for drafts). */
  activatedAt: Date | null;
}

/** A single recorded open event surfaced in the cabinet detail view. */
export interface CabinetOpen {
  openedAt: Date;
  userAgent: string | null;
}

/** A single guest answer surfaced in the cabinet detail view (Requirement 10.2). */
export interface CabinetResponse {
  id: string;
  guestName: string | null;
  /** The stored outcome JSON (decision, place, time, guests, ...). */
  outcome: unknown;
  createdAt: Date;
}

/**
 * Full cabinet detail for one invitation (Requirements 10.2, 10.3, 8.6).
 *
 * Always includes the link, opens and the raw response list. For the event
 * template ("event-rsvp") it additionally carries the aggregated
 * {@link RsvpSummary} dashboard (guest list + totals). `rsvp` is null for the
 * non-event templates so the UI can branch on its presence.
 */
export interface CabinetDetail {
  id: string;
  templateId: string;
  themeId: string;
  templateName: string;
  status: InvitationStatus;
  cabinetStatus: CabinetStatus;
  /** Public URL once activated (null for drafts). */
  url: string | null;
  /** Public token (null for drafts). */
  token: string | null;
  createdAt: Date;
  activatedAt: Date | null;
  /** Recorded opens (oldest first). */
  opens: CabinetOpen[];
  /** Total number of opens (convenience; equals `opens.length`). */
  openCount: number;
  /** Guest answers (oldest first). */
  responses: CabinetResponse[];
  /** RSVP dashboard for the event template, else null (Requirement 8.6). */
  rsvp: RsvpSummary | null;
}

/** Read an invitation's `data` JSON column as a plain author-data record. */
function asAuthorData(value: Invitation['data']): AuthorData {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AuthorData)
    : {};
}

/**
 * Normalise an author's `список_мест` value into preview place cards. The
 * author list may hold objects with localized (`название`) or generic
 * (`name`/`title`) keys, or bare strings. Entries without a usable name are
 * dropped. Returns an empty array when there is no list.
 */
function normalisePlaces(placesList: unknown): PreviewPlace[] {
  if (!Array.isArray(placesList)) return [];
  const places: PreviewPlace[] = [];
  for (const entry of placesList) {
    if (typeof entry === 'string') {
      const name = entry.trim();
      if (name !== '') places.push({ название: name });
      continue;
    }
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const rawName = record['название'] ?? record['name'] ?? record['title'];
      const name = typeof rawName === 'string' ? rawName.trim() : '';
      if (name === '') continue;
      const photo = record['фото'] ?? record['photo'] ?? record['image'];
      const description = record['описание'] ?? record['description'];
      places.push({
        название: name,
        ...(typeof photo === 'string' && photo.trim() !== ''
          ? { фото: photo }
          : {}),
        ...(typeof description === 'string' && description.trim() !== ''
          ? { описание: description }
          : {}),
      });
    }
  }
  return places;
}

/**
 * Resolve the addressee's display name from the author data for the OG teaser.
 * Templates use either `имя_адресата` (date templates) or `название_события`
 * (event template) as the headline subject. Falls back to a neutral teaser
 * when neither is present (e.g. an incomplete draft activated for testing).
 */
function resolveAddresseeName(data: AuthorData): string {
  const candidates = [data['имя_адресата'], data['название_события']];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }
  return '';
}

/**
 * Resolve the preview image for the OG card. In task 6.1 this is a static
 * preview (the author's photo if provided, otherwise a per-template placeholder
 * under `/og/`). The dynamic, theme-based image is generated in task 6.2.
 */
function resolveOgImage(template: TemplateSchema, data: AuthorData): string {
  const photo = data['фото'] ?? data['фото_обложка'];
  if (typeof photo === 'string' && photo.trim() !== '') {
    return photo.trim();
  }
  const base = env.appUrl.replace(/\/$/, '');
  return `${base}/og/${template.id}.png`;
}

/**
 * Build the Open Graph metadata for an invitation (Requirement 4.2). The
 * description is the fixed intriguing teaser from the spec, personalised with
 * the addressee's name.
 */
function buildOpenGraph(
  template: TemplateSchema,
  data: AuthorData,
): OpenGraphMeta {
  const name = resolveAddresseeName(data);
  const description =
    name !== ''
      ? `${name}, у меня для тебя кое-что есть...`
      : 'У меня для тебя кое-что есть...';
  return {
    title: template.name,
    description,
    image: resolveOgImage(template, data),
  };
}

/**
 * Derive the cabinet list badge status (Requirement 10.1) from the stored
 * invitation status plus whether any guest has answered. An expired link (past
 * `expiresAt` or already swept to EXPIRED) reads `expired`; an un-activated
 * invitation reads `draft`; an active link reads `responded` once at least one
 * answer exists, otherwise `active`.
 */
function deriveCabinetStatus(
  invitation: Pick<Invitation, 'status' | 'expiresAt'>,
  responseCount: number,
): CabinetStatus {
  if (
    invitation.status === 'EXPIRED' ||
    (invitation.expiresAt != null &&
      invitation.expiresAt.getTime() <= Date.now())
  ) {
    return 'expired';
  }
  if (invitation.status !== 'ACTIVE') {
    return 'draft';
  }
  return responseCount > 0 ? 'responded' : 'active';
}

/**
 * Domain service for invitation drafts. Construct with explicit dependencies in
 * tests; the default {@link invitationService} singleton wires the real
 * repository and template registry.
 */
export class InvitationService {
  private readonly registry: TemplateRegistry;
  private readonly repo: InvitationRepo;
  private readonly responseRepo: ResponseRepo;
  private readonly openEventRepo: OpenEventRepo;
  private readonly onDomainEvent?: (
    event: DomainEvent,
    tx: Prisma.TransactionClient,
  ) => void | Promise<void>;
  private readonly runTransaction: <T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ) => Promise<T>;

  constructor(deps: InvitationServiceDeps) {
    this.registry = deps.registry;
    this.repo = deps.repo;
    this.responseRepo = deps.responseRepo;
    this.openEventRepo = deps.openEventRepo;
    this.onDomainEvent = deps.onDomainEvent;
    this.runTransaction =
      deps.runTransaction ??
      ((fn) => prisma.$transaction((tx) => fn(tx)));
  }

  /**
   * Resolve a template schema or fail with a 404 service error (rather than
   * leaking the registry's {@link TemplateNotFoundError}).
   */
  private getTemplateOr404(templateId: string) {
    try {
      return this.registry.get(templateId);
    } catch (error) {
      if (error instanceof TemplateNotFoundError) {
        throw new InvitationServiceError(
          404,
          `Unknown template "${templateId}".`,
          'template_not_found',
        );
      }
      throw error;
    }
  }

  /** Validate that `themeId` is one the template offers, else 400. */
  private assertThemeValid(
    template: { id: string; themes: readonly string[] },
    themeId: string,
  ): void {
    if (!template.themes.includes(themeId)) {
      throw new InvitationServiceError(
        400,
        `Theme "${themeId}" is not available for template "${template.id}".`,
        'invalid_theme',
      );
    }
  }

  /**
   * Create a DRAFT invitation for `authorId`.
   *
   * Validates structural invariants only (known `templateId`, valid `themeId`);
   * the supplied `data` may be partial (Requirement 2.6 — auto-save tolerates
   * incomplete drafts).
   */
  async createDraft(
    authorId: string,
    templateId: string,
    themeId: string,
    data: AuthorData = {},
  ): Promise<Invitation> {
    const template = this.getTemplateOr404(templateId);
    this.assertThemeValid(template, themeId);

    return this.repo.create({
      authorId,
      templateId,
      themeId,
      status: 'DRAFT',
      data: (data ?? {}) as Prisma.InputJsonValue,
    });
  }

  /**
   * Load a draft owned by `authorId`, enforcing existence (404), ownership
   * (403) and DRAFT status (409). Shared by mutation paths.
   */
  private async loadOwnedDraft(
    invitationId: string,
    authorId: string,
  ): Promise<Invitation> {
    const invitation = await this.repo.findById(invitationId);
    if (!invitation) {
      throw new InvitationServiceError(404, 'Invitation not found.', 'not_found');
    }
    // Throws AuthError(403) when the author doesn't own it (Requirement 10.4).
    assertOwnership(authorId, invitation.authorId);
    if (invitation.status !== 'DRAFT') {
      throw new InvitationServiceError(
        409,
        'Only draft invitations can be edited.',
        'not_draft',
      );
    }
    return invitation;
  }

  /**
   * Auto-save path (Requirement 2.6). Merges `patch.data` into the stored draft
   * data and optionally switches the theme. Tolerant of partial data — never
   * rejects an incomplete draft. Returns the updated invitation.
   */
  async updateDraft(
    invitationId: string,
    authorId: string,
    patch: UpdateDraftPatch,
  ): Promise<Invitation> {
    const invitation = await this.loadOwnedDraft(invitationId, authorId);

    const update: Prisma.InvitationUpdateInput = {};

    if (patch.themeId !== undefined) {
      const template = this.getTemplateOr404(invitation.templateId);
      this.assertThemeValid(template, patch.themeId);
      update.themeId = patch.themeId;
    }

    if (patch.data !== undefined) {
      const merged: AuthorData = {
        ...asAuthorData(invitation.data),
        ...patch.data,
      };
      update.data = merged as Prisma.InputJsonValue;
    }

    if (Object.keys(update).length === 0) {
      // Nothing to change — return the current draft unchanged.
      return invitation;
    }

    return this.repo.update(invitationId, update);
  }

  /**
   * Explicit readiness check (Requirement 2.3). Runs full author-data
   * validation against the stored draft and returns a {@link ValidationResult}
   * with per-field errors. Enforces existence/ownership but, unlike the
   * mutation paths, does not throw on validation problems — it reports them.
   */
  async validateForActivation(
    invitationId: string,
    authorId: string,
  ): Promise<ValidationResult> {
    const invitation = await this.repo.findById(invitationId);
    if (!invitation) {
      throw new InvitationServiceError(404, 'Invitation not found.', 'not_found');
    }
    assertOwnership(authorId, invitation.authorId);

    return this.registry.validateAuthorData(
      invitation.templateId,
      asAuthorData(invitation.data),
    );
  }

  /**
   * Build the {@link PreviewPayload} for rendering an invitation before payment
   * (Requirement 2.5).
   *
   * Enforces existence (404) and ownership (403, Requirement 10.4) just like the
   * other author-facing reads, then assembles the render payload from the
   * stored draft data and the template schema via the {@link TemplateRegistry}:
   * template metadata + screens (texts/buttons/images), the author's
   * `{{переменные}}`, a normalised place list and the current readiness
   * validation. It is tolerant of partial data — the preview always renders so
   * the author can see work-in-progress — and reports outstanding required
   * fields in `validation` rather than throwing.
   */
  async preview(
    invitationId: string,
    authorId: string,
  ): Promise<PreviewPayload> {
    const invitation = await this.repo.findById(invitationId);
    if (!invitation) {
      throw new InvitationServiceError(404, 'Invitation not found.', 'not_found');
    }
    // Throws AuthError(403) when the author doesn't own it (Requirement 10.4).
    assertOwnership(authorId, invitation.authorId);

    const template = this.getTemplateOr404(invitation.templateId);
    const data = asAuthorData(invitation.data);
    const validation = this.registry.validateAuthorData(
      invitation.templateId,
      data,
    );

    return {
      invitationId: invitation.id,
      templateId: invitation.templateId,
      themeId: invitation.themeId,
      tier: invitation.tier,
      features: resolveTierFeatures(invitation.tier, template.premiumFeatures),
      status: invitation.status,
      template: {
        name: template.name,
        description: template.description,
        startScreen: template.startScreen,
        screens: template.screens,
        premiumFeatures: template.premiumFeatures,
      },
      data,
      places: normalisePlaces(data['список_мест']),
      validation,
    };
  }

  /**
   * List the author's invitations for the cabinet (Requirements 10.1, 10.4).
   *
   * Returns only invitations owned by `authorId` (the repository query is
   * scoped by author, so another author's invitations are never returned —
   * Requirement 10.4). Each row carries the derived {@link CabinetStatus}
   * badge, the public URL (once active), and the open/response counts so the
   * list can show "черновик / активно / отвечено" at a glance.
   */
  async listForAuthor(authorId: string): Promise<CabinetListItem[]> {
    const invitations = await this.repo.findByAuthor(authorId);

    return Promise.all(
      invitations.map(async (invitation) => {
        const [opens, responses] = await Promise.all([
          this.openEventRepo.countByInvitation(invitation.id),
          this.responseRepo.countByInvitation(invitation.id),
        ]);
        return {
          id: invitation.id,
          templateId: invitation.templateId,
          themeId: invitation.themeId,
          templateName: this.resolveTemplateName(invitation.templateId),
          status: invitation.status,
          cabinetStatus: deriveCabinetStatus(invitation, responses),
          url: invitation.token
            ? this.buildInvitationUrl(invitation.token)
            : null,
          opens,
          responses,
          createdAt: invitation.createdAt,
          activatedAt: invitation.activatedAt,
        };
      }),
    );
  }

  /**
   * Full cabinet detail for one invitation (Requirements 10.2, 10.3, 8.6,
   * 10.4).
   *
   * Enforces existence (404) and ownership (403 — Requirement 10.4) exactly
   * like the other author-facing reads, so an author can never read another
   * author's invitation detail. Assembles the link, the recorded opens, the
   * guest responses, and — for the event template — the aggregated RSVP
   * dashboard ({@link summariseRsvp}, Requirement 8.6).
   */
  async getDetailForAuthor(
    invitationId: string,
    authorId: string,
  ): Promise<CabinetDetail> {
    const invitation = await this.repo.findById(invitationId);
    if (!invitation) {
      throw new InvitationServiceError(404, 'Invitation not found.', 'not_found');
    }
    // Throws AuthError(403) when the author doesn't own it (Requirement 10.4).
    assertOwnership(authorId, invitation.authorId);

    const [openRows, responseRows] = await Promise.all([
      this.openEventRepo.findByInvitation(invitation.id),
      this.responseRepo.findByInvitation(invitation.id),
    ]);

    const responses: CabinetResponse[] = responseRows.map((row) => ({
      id: row.id,
      guestName: row.guestName ?? null,
      outcome: row.outcome,
      createdAt: row.createdAt,
    }));

    // RSVP dashboard only applies to the multi-guest event template (Req 8.6).
    const rsvp =
      invitation.templateId === 'event-rsvp'
        ? summariseRsvp(
            responseRows.map((row) => ({
              guestName: row.guestName,
              outcome: row.outcome,
            })),
          )
        : null;

    return {
      id: invitation.id,
      templateId: invitation.templateId,
      themeId: invitation.themeId,
      templateName: this.resolveTemplateName(invitation.templateId),
      status: invitation.status,
      cabinetStatus: deriveCabinetStatus(invitation, responseRows.length),
      url: invitation.token ? this.buildInvitationUrl(invitation.token) : null,
      token: invitation.token,
      createdAt: invitation.createdAt,
      activatedAt: invitation.activatedAt,
      opens: openRows.map((row) => ({
        openedAt: row.openedAt,
        userAgent: row.userAgent ?? null,
      })),
      openCount: openRows.length,
      responses,
      rsvp,
    };
  }

  /**
   * Resolve a template's display name for the cabinet, tolerant of an unknown
   * template id (a legacy/removed template should not break the list — we fall
   * back to the raw id rather than throwing).
   */
  private resolveTemplateName(templateId: string): string {
    try {
      return this.registry.get(templateId).name;
    } catch {
      return templateId;
    }
  }

  /**
   * Resolve an invitation by its public token for guest-facing rendering
   * (Requirement 4.1/4.2, Property 6/7).
   *
   * Returns ONLY the public {@link PublicInvitation} projection — never the
   * author's private fields (email, telegramChatId, authorId). The page that
   * consumes this assembles Open Graph metadata and renders the scenario.
   *
   * Availability is enforced here so the SSR page can show a graceful
   * "ссылка недоступна" screen instead of crashing (Requirement 4.4):
   *  - unknown token → {@link InvitationUnavailableError} `not_found`;
   *  - not yet ACTIVE (DRAFT/PENDING_PAYMENT/EXPIRED) → `not_active`;
   *  - `expiresAt` in the past → `expired` (Requirement 11.2);
   *  - `oneTimeView` already completed (a response exists) → `consumed`
   *    (Requirement 11.4).
   */
  async getByToken(token: string): Promise<PublicInvitation> {
    const invitation = await this.repo.findByToken(token);
    if (!invitation) {
      throw new InvitationUnavailableError('not_found');
    }

    // Only ACTIVE invitations are visible to the guest; DRAFT / PENDING_PAYMENT
    // / EXPIRED are not addressable links.
    if (invitation.status !== 'ACTIVE') {
      throw new InvitationUnavailableError(
        invitation.status === 'EXPIRED' ? 'expired' : 'not_active',
      );
    }

    // Lifetime (Requirement 11.2): a past expiry makes the link unavailable
    // regardless of the stored status (the EXPIRED sweep may not have run yet).
    if (invitation.expiresAt && invitation.expiresAt.getTime() <= Date.now()) {
      throw new InvitationUnavailableError('expired');
    }

    // One-time view (Requirement 11.4): once a guest has completed the scenario
    // (a Response exists) the link is consumed and no longer available.
    if (invitation.oneTimeView) {
      const responses = await this.responseRepo.findByInvitation(invitation.id);
      if (responses.length > 0) {
        throw new InvitationUnavailableError('consumed');
      }
    }

    const template = this.getTemplateOr404(invitation.templateId);
    const data = asAuthorData(invitation.data);

    // Single-addressee "already answered" flag (Requirement 5.7): a repeat open
    // should render the "уже отвечено" final screen. We look up the answer under
    // the single-guest key (null → sentinel); multi-guest RSVP templates store
    // per-guest keys and so read `false` here, which is correct — every guest
    // answers under their own identity.
    const existingAnswer = await this.responseRepo.findByGuestKey(
      invitation.id,
      null,
    );

    return {
      token: invitation.token ?? token,
      templateId: invitation.templateId,
      themeId: invitation.themeId,
      features: resolveTierFeatures(invitation.tier, template.premiumFeatures),
      template: {
        name: template.name,
        description: template.description,
        startScreen: template.startScreen,
        screens: template.screens,
      },
      data,
      places: normalisePlaces(data['список_мест']),
      og: buildOpenGraph(template, data),
      alreadyResponded: existingAnswer !== null,
    };
  }

  /**
   * Resolve an invitation by token for a *guest-facing write* (open/respond),
   * applying the same availability rules as {@link getByToken} (Requirement
   * 4.4, Property 7) but returning the raw {@link Invitation} (the writer needs
   * the id and the author's `data` for response validation).
   *
   * Note on one-time view: unlike a read, recording the *first* response is what
   * consumes a one-time link, so we do not reject an unanswered one-time view
   * here. A subsequent open after the answer is still surfaced as `consumed` by
   * {@link getByToken} (which drives the "уже отвечено" final screen).
   */
  private async resolveAvailableByToken(token: string): Promise<Invitation> {
    const invitation = await this.repo.findByToken(token);
    if (!invitation) {
      throw new InvitationUnavailableError('not_found');
    }
    if (invitation.status !== 'ACTIVE') {
      throw new InvitationUnavailableError(
        invitation.status === 'EXPIRED' ? 'expired' : 'not_active',
      );
    }
    if (invitation.expiresAt && invitation.expiresAt.getTime() <= Date.now()) {
      throw new InvitationUnavailableError('expired');
    }
    return invitation;
  }

  /**
   * Invoke the domain-event hook inside the recording transaction (`tx`), if
   * configured. Failures are intentionally propagated: the hook writes the
   * outbox row in the same transaction, so a failure must roll back the domain
   * change rather than silently lose the notification (Property 8).
   */
  private async emitDomainEvent(
    event: DomainEvent,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!this.onDomainEvent) return;
    await this.onDomainEvent(event, tx);
  }

  /**
   * Record that a guest opened the invitation link (Requirement 9.1).
   *
   * Resolves the invitation by its public token (404/expired/not-active surface
   * as {@link InvitationUnavailableError} so the public endpoint can answer
   * gracefully — Requirement 4.4), appends an {@link OpenEvent}, and reports
   * whether this was the *first* open. The first open is the one that later
   * triggers the author's "приглашение открыли" notification (task 9.x); repeat
   * opens are recorded but flagged `firstOpen: false` so the notification is not
   * re-sent.
   *
   * `userAgent` is stored as-is for the author's cabinet; it is optional and
   * never required for the operation.
   */
  async recordOpen(token: string, userAgent?: string | null): Promise<RecordOpenResult> {
    const invitation = await this.resolveAvailableByToken(token);

    // Record the open and enqueue its notification atomically (Property 8): the
    // OpenEvent insert, the first-open detection and the outbox enqueue all
    // share one transaction, so the "приглашение открыли" event can never be
    // lost relative to the recorded open (Requirement 9.1).
    return this.runTransaction(async (tx) => {
      // First-open detection: count existing opens BEFORE inserting this one.
      const priorOpens = await this.openEventRepo.countByInvitation(
        invitation.id,
        tx,
      );
      const firstOpen = priorOpens === 0;

      const event = await this.openEventRepo.create(
        {
          invitationId: invitation.id,
          userAgent: userAgent ?? null,
        },
        tx,
      );

      await this.emitDomainEvent({ kind: 'open', invitation, firstOpen }, tx);

      return { event, firstOpen };
    });
  }

  /**
   * Record a guest's final answer (Requirements 5.5/8.5, Property 3/5).
   *
   * 1. Resolves the invitation by token (graceful unavailability as above).
   * 2. **Server-side validation** (Property 5, Requirement 5.5): the answer is
   *    validated against the template schema *and the author's data* via
   *    {@link TemplateRegistry.validateResponse} — the server never trusts the
   *    client. An invalid answer throws {@link ResponseValidationError} (→ 400)
   *    and nothing is persisted.
   * 3. **Idempotent upsert** (Property 3, Requirement 8.5): the answer is stored
   *    keyed by `(invitationId, guestKey)`. Single-addressee templates omit a
   *    guest key (the repository folds it to a stable sentinel); the RSVP
   *    template passes a per-guest key. Answering again updates the existing row
   *    instead of creating a duplicate, which is what lets a repeat open show
   *    the "уже отвечено" final screen (Requirement 5.7).
   *
   * Whether the upsert created or updated a row is reported via `updated`,
   * derived by checking for an existing answer under the same key first.
   */
  async recordResponse(
    token: string,
    response: GuestResponse,
  ): Promise<RecordResponseResult> {
    const invitation = await this.resolveAvailableByToken(token);
    const authorData = asAuthorData(invitation.data);

    // Server-side validation against the template schema (Property 5, Req 5.5).
    const validation = this.registry.validateResponse(
      invitation.templateId,
      response,
      authorData,
    );
    if (!validation.ok) {
      throw new ResponseValidationError(validation.errors);
    }

    // Upsert the answer and enqueue its notification atomically (Property 8):
    // the create-vs-update detection, the idempotent upsert and the outbox
    // enqueue all share one transaction, so the answer notification can never be
    // lost relative to the stored answer (Requirement 9.2).
    return this.runTransaction(async (tx) => {
      // Idempotency (Property 3, Req 8.5): detect an existing answer under the
      // same key so we can report create vs. update. The repository normalises a
      // missing guestKey to a stable single-guest sentinel.
      const existing = await this.responseRepo.findByGuestKey(
        invitation.id,
        response.guestKey ?? null,
        tx,
      );

      const stored = await this.responseRepo.upsertResponse(
        {
          invitationId: invitation.id,
          guestKey: response.guestKey ?? null,
          guestName:
            typeof response.guestName === 'string' ? response.guestName : null,
          outcome: response as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      const updated = existing !== null;
      await this.emitDomainEvent(
        {
          kind: 'response',
          invitation,
          response,
          updated,
        },
        tx,
      );

      return { response: stored, updated };
    });
  }

  /**
   * Activate an invitation after a successful payment (Requirement 3.3).
   *
   * Generates a unique short public token, assigns it, flips the status to
   * `ACTIVE` and stamps `activatedAt`. Returns the token and its full public
   * URL (`<appUrl>/i/<token>`).
   *
   * Idempotent for the already-active case: if the invitation is already
   * `ACTIVE` with a token, the existing token/URL are returned without minting a
   * new one (so a re-delivered webhook never re-activates — Property 2). Only a
   * `PENDING_PAYMENT` invitation can be freshly activated; any other
   * (non-active) status is a 409.
   *
   * Token uniqueness (the `token` column is unique) is guarded by regenerating
   * on the rare collision; activation never hands out a token for an unpaid
   * invitation because callers (the webhook handler) only invoke it once the
   * payment is SUCCEEDED (Property 1).
   */
  async activate(invitationId: string): Promise<ActivationResult> {
    const invitation = await this.repo.findById(invitationId);
    if (!invitation) {
      throw new InvitationServiceError(404, 'Invitation not found.', 'not_found');
    }

    // Idempotent: an already-activated invitation keeps its token (Property 2).
    if (invitation.status === 'ACTIVE' && invitation.token) {
      return { token: invitation.token, url: this.buildInvitationUrl(invitation.token) };
    }

    if (invitation.status !== 'PENDING_PAYMENT') {
      throw new InvitationServiceError(
        409,
        'Only invitations awaiting payment can be activated.',
        'not_pending_payment',
      );
    }

    const token = await this.generateUniqueToken();
    const activated = await this.repo.setTokenAndActivate(invitationId, token);

    return {
      token: activated.token ?? token,
      url: this.buildInvitationUrl(activated.token ?? token),
    };
  }

  /** Build the public invitation URL for a token. */
  private buildInvitationUrl(token: string): string {
    const base = env.appUrl.replace(/\/$/, '');
    return `${base}/i/${token}`;
  }

  /**
   * Generate a token not already taken by another invitation. Collisions are
   * astronomically unlikely at this length, but we retry a few times to be safe
   * rather than risk a unique-constraint violation.
   */
  private async generateUniqueToken(maxAttempts = 5): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const token = generateToken();
      const existing = await this.repo.findByToken(token);
      if (!existing) return token;
    }
    throw new InvitationServiceError(
      // 400-class wouldn't fit; this is an internal exhaustion. Surface as 409.
      409,
      'Could not generate a unique token.',
      'token_generation_failed',
    );
  }
}

/** Default service wired with the real repository and template registry. */
export const invitationService = new InvitationService({
  registry: defaultRegistry,
  repo: defaultInvitationRepo,
  responseRepo: defaultResponseRepo,
  openEventRepo: defaultOpenEventRepo,
  // Enqueue the matching outbox row in the same transaction as the domain write
  // (Property 8). The hook is the NotificationService; failures roll the
  // transaction back so an event is never lost.
  onDomainEvent: (event, tx) => notificationService.handleDomainEvent(event, tx),
  runTransaction: (fn) => prisma.$transaction((tx) => fn(tx)),
});
