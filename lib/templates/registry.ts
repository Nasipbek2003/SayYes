/**
 * In-code implementation of the {@link TemplateRegistry} (task 3.1).
 *
 * The registry is constructed from an injected set of {@link TemplateSchema}s
 * (dependency injection keeps it testable without depending on the concrete
 * MVP templates added in task 3.2). The default singleton
 * {@link templateRegistry} is built from `templates/index.ts`'s
 * `templateSchemas` array.
 *
 * ## Method contracts
 * - `list()` → {@link TemplateSummary}[]: lightweight projections for the
 *   gallery. Never throws; returns `[]` when no templates are registered.
 * - `get(id)` → {@link TemplateSchema}: full schema. **Throws**
 *   {@link TemplateNotFoundError} when `id` is unknown. (Chosen over returning
 *   `undefined` so callers fail loudly; the design types `get` as returning a
 *   non-optional `TemplateSchema`.)
 * - `validateAuthorData(id, data)` → {@link ValidationResult}: checks required
 *   fields, per-`type` value shape and `maxLength`. **Throws**
 *   {@link TemplateNotFoundError} for an unknown `id`.
 * - `validateResponse(id, response, authorData?)` → {@link ValidationResult}:
 *   server-side validation of a guest's answer (task 3.3). It runs in two
 *   layers:
 *     1. **Author-independent base checks** (always): the response is an
 *        object, its `type` is one the template can emit, and the typed fields
 *        (`place`, `guests`, `rsvp`) have the right primitive shape.
 *     2. **Template-specific rules** (dispatched by template id): these encode
 *        Requirements 7.5/7.6 (story-fork place selection) and 8.3 (event-rsvp
 *        required RSVP fields). Rules that depend on what the author entered
 *        (e.g. "the place must be one of the author's `список_мест`") only run
 *        when `authorData` is supplied — callers should pass the invitation's
 *        author data so the server never trusts the client.
 *   **Throws** {@link TemplateNotFoundError} for an unknown `id`.
 *
 *   ### Design notes on the contract
 *   - We extended `validateResponse` with an **optional** third argument
 *     `authorData` (rather than adding a separate function) so existing callers
 *     and the `TemplateRegistry` interface stay backwards compatible: omitting
 *     it simply skips the author-dependent rules.
 *   - **guestKey** is intentionally NOT required by `validateResponse`.
 *     Idempotency is a storage concern handled by the responses repository
 *     (`upsertResponse` / `resolveGuestKey`): single-addressee templates
 *     (`simple-date`, `story-fork`) fall back to the `SINGLE_GUEST_KEY`
 *     sentinel, and for `event-rsvp` a stable key is derived from the guest
 *     name when absent. Validation therefore checks that a usable identity
 *     exists for RSVP (a non-empty `guestName`, from which a key can be
 *     derived) instead of demanding a `guestKey` from the client.
 */
import { templateSchemas } from '@/templates';
import type {
  GuestResponse,
  TemplateField,
  TemplateRegistry,
  TemplateSchema,
  TemplateSummary,
  ValidationError,
  ValidationResult,
} from '@/templates/types';

/** Thrown by `get`/`validate*` when a template id is not registered. */
export class TemplateNotFoundError extends Error {
  constructor(public readonly templateId: string) {
    super(`Template not found: ${templateId}`);
    this.name = 'TemplateNotFoundError';
  }
}

const fail = (errors: ValidationError[]): ValidationResult => ({
  ok: errors.length === 0,
  errors,
});

/** Validate a single author field value against its declared type/limits. */
function validateField(field: TemplateField, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const missing =
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (field.type === 'placesList' && Array.isArray(value) && value.length === 0);

  if (missing) {
    if (field.required) {
      errors.push({
        field: field.key,
        code: 'required',
        message: `Field "${field.label}" is required.`,
      });
    }
    // An absent optional field needs no further checks.
    return errors;
  }

  switch (field.type) {
    case 'text':
    case 'longtext':
    case 'image': {
      if (typeof value !== 'string') {
        errors.push({
          field: field.key,
          code: 'type',
          message: `Field "${field.label}" must be a string.`,
        });
        break;
      }
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        errors.push({
          field: field.key,
          code: 'maxLength',
          message: `Field "${field.label}" must be at most ${field.maxLength} characters.`,
        });
      }
      break;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        errors.push({
          field: field.key,
          code: 'type',
          message: `Field "${field.label}" must be a boolean.`,
        });
      }
      break;
    }
    case 'datetime': {
      // Accept Date instances or parseable ISO-ish strings/timestamps.
      const valid =
        value instanceof Date
          ? !Number.isNaN(value.getTime())
          : (typeof value === 'string' || typeof value === 'number') &&
            !Number.isNaN(new Date(value as string | number).getTime());
      if (!valid) {
        errors.push({
          field: field.key,
          code: 'type',
          message: `Field "${field.label}" must be a valid date/time.`,
        });
      }
      break;
    }
    case 'placesList': {
      if (!Array.isArray(value)) {
        errors.push({
          field: field.key,
          code: 'type',
          message: `Field "${field.label}" must be a list of places.`,
        });
        break;
      }
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        errors.push({
          field: field.key,
          code: 'maxLength',
          message: `Field "${field.label}" must contain at most ${field.maxLength} places.`,
        });
      }
      break;
    }
    default: {
      // Exhaustiveness guard: unknown field types are a schema bug.
      errors.push({
        field: field.key,
        code: 'type',
        message: `Field "${field.label}" has an unsupported type.`,
      });
    }
  }

  return errors;
}

/**
 * Extract the list of place *names* from an author's `список_мест` value.
 *
 * The author's places list is an array of objects; the human-visible name may
 * live under a localized key (`название`) or a generic one (`name`/`title`).
 * Plain strings are also accepted (a list of bare names). Anything else is
 * ignored. Returns the trimmed, non-empty names.
 */
function extractPlaceNames(placesList: unknown): string[] {
  if (!Array.isArray(placesList)) return [];
  const names: string[] = [];
  for (const entry of placesList) {
    let name: unknown;
    if (typeof entry === 'string') {
      name = entry;
    } else if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      name = record['название'] ?? record['name'] ?? record['title'];
    }
    if (typeof name === 'string' && name.trim() !== '') {
      names.push(name.trim());
    }
  }
  return names;
}

/**
 * Template-specific response rules, keyed by template id (task 3.3). Each rule
 * receives the already-shape-checked response and the optional author data and
 * appends any domain errors. Author-dependent checks must guard on
 * `authorData === undefined` and skip themselves when it is absent.
 */
const responseRules: Record<
  string,
  (
    response: GuestResponse,
    authorData: Record<string, unknown> | undefined,
    errors: ValidationError[],
  ) => void
> = {
  // Template 2 — story-fork (Requirements 7.5, 7.6).
  'story-fork': (response, authorData, errors) => {
    // A decline is always valid without a place.
    if (response.type !== 'accepted') return;

    const places = authorData ? extractPlaceNames(authorData['список_мест']) : [];
    const place = typeof response.place === 'string' ? response.place.trim() : '';

    if (authorData === undefined) {
      // Author data not supplied: we can't check against the list, but an
      // "accepted" outcome still requires *some* chosen place.
      if (place === '') {
        errors.push({
          field: 'place',
          code: 'required',
          message: 'A place must be chosen to accept.',
        });
      }
      return;
    }

    if (places.length > 0) {
      // Non-empty author list → place is required and must be one of the names
      // (Requirement 7.5).
      if (place === '') {
        errors.push({
          field: 'place',
          code: 'required',
          message: 'A place must be chosen from the author\u2019s list.',
        });
      } else if (!places.includes(place)) {
        errors.push({
          field: 'place',
          code: 'enum',
          message: `Selected place "${place}" is not one of the author\u2019s places.`,
        });
      }
    } else {
      // Empty author list → free-form entry, any non-empty string is allowed
      // (Requirement 7.6).
      if (place === '') {
        errors.push({
          field: 'place',
          code: 'required',
          message: 'Please write where you would like to go.',
        });
      }
    }
  },

  // Template 3 — event-rsvp (Requirement 8.3).
  'event-rsvp': (response, authorData, errors) => {
    if (response.type !== 'rsvp') return;

    const guestName =
      typeof response.guestName === 'string' ? response.guestName.trim() : '';
    if (guestName === '') {
      // Identity for idempotency is derived from the guest name when no
      // explicit guestKey is provided, so a name is mandatory here.
      errors.push({
        field: 'guestName',
        code: 'required',
        message: 'Guest name is required for RSVP.',
      });
    }

    if (response.rsvp !== 'yes' && response.rsvp !== 'no') {
      errors.push({
        field: 'rsvp',
        code: 'required',
        message: 'RSVP decision ("yes"/"no") is required.',
      });
    }

    // Party size is only meaningful/required when the author enabled it and the
    // guest is attending.
    const collectsGuests = authorData?.['сбор_числа_гостей'] === true;
    if (collectsGuests && response.rsvp === 'yes') {
      const guests = response.guests;
      if (typeof guests !== 'number' || !Number.isInteger(guests) || guests < 1) {
        errors.push({
          field: 'guests',
          code: 'type',
          message: 'Number of guests must be a positive integer.',
        });
      }
    }
  },

  // Template 1 — simple-date: only an "accepted" outcome is expected; no place
  // or time is required. (The base check already rejects types the template
  // never emits, e.g. "rsvp".)
  'simple-date': () => {
    /* no extra rules beyond the base checks */
  },
};

/**
 * Default in-code registry. Accepts the set of schemas at construction so it
 * can be unit-tested with fixtures independent of the concrete MVP templates.
 */
export class InMemoryTemplateRegistry implements TemplateRegistry {
  private readonly byId: Map<string, TemplateSchema>;

  constructor(schemas: readonly TemplateSchema[]) {
    this.byId = new Map(schemas.map((schema) => [schema.id, schema]));
  }

  list(): TemplateSummary[] {
    return [...this.byId.values()].map((schema) => ({
      id: schema.id,
      name: schema.name,
      description: schema.description,
      themes: schema.themes,
    }));
  }

  get(id: string): TemplateSchema {
    const schema = this.byId.get(id);
    if (!schema) {
      throw new TemplateNotFoundError(id);
    }
    return schema;
  }

  validateAuthorData(id: string, data: Record<string, unknown>): ValidationResult {
    const schema = this.get(id);
    const errors: ValidationError[] = [];
    for (const field of schema.fields) {
      errors.push(...validateField(field, data[field.key]));
    }
    return fail(errors);
  }

  validateResponse(
    id: string,
    response: GuestResponse,
    authorData?: Record<string, unknown>,
  ): ValidationResult {
    const schema = this.get(id);
    const errors: ValidationError[] = [];

    if (!response || typeof response !== 'object') {
      return fail([
        { code: 'type', message: 'Response must be an object.' },
      ]);
    }

    // The outcome type must be one the template can actually emit.
    const allowedTypes = new Set(
      schema.screens.flatMap((screen) => (screen.emits ?? []).map((e) => e.type)),
    );
    if (!response.type) {
      errors.push({
        field: 'type',
        code: 'required',
        message: 'Response type is required.',
      });
    } else if (allowedTypes.size > 0 && !allowedTypes.has(response.type)) {
      errors.push({
        field: 'type',
        code: 'enum',
        message: `Response type "${response.type}" is not produced by template "${id}".`,
      });
    }

    // Author-independent field-shape guards. Deeper, template-specific rules
    // (and author-data-dependent checks) run afterwards.
    if (response.place !== undefined && typeof response.place !== 'string') {
      errors.push({
        field: 'place',
        code: 'type',
        message: 'Selected place must be a string.',
      });
    }
    if (response.guests !== undefined && typeof response.guests !== 'number') {
      errors.push({
        field: 'guests',
        code: 'type',
        message: 'Guest count must be a number.',
      });
    }
    if (response.rsvp !== undefined && response.rsvp !== 'yes' && response.rsvp !== 'no') {
      errors.push({
        field: 'rsvp',
        code: 'enum',
        message: 'RSVP must be "yes" or "no".',
      });
    }

    // Template-specific rules (Requirements 7.5/7.6, 8.3). Only run when the
    // outcome type is valid for the template, so we don't pile domain errors on
    // top of an enum mismatch.
    const rule = responseRules[id];
    const typeOkForTemplate =
      !response.type || allowedTypes.size === 0 || allowedTypes.has(response.type);
    if (rule && typeOkForTemplate) {
      rule(response, authorData, errors);
    }

    return fail(errors);
  }
}

/** Default registry built from the in-code template schemas (task 3.2 fills these in). */
export const templateRegistry: TemplateRegistry = new InMemoryTemplateRegistry(
  templateSchemas,
);
