/**
 * Data-driven template schema types (task 3.1).
 *
 * Every invitation template is a *declarative* schema: a list of screens, the
 * elements drawn on each screen, the transitions/forks between them, the fields
 * the author fills in, and which events are pushed back to the author. The
 * client runtime ({@link ScenarioEngine}, task 7.1) interprets the schema to
 * render screens, and the server reuses the same schema to validate the guest's
 * response (task 3.3).
 *
 * These types mirror the "Components and Interfaces → 1. Template Registry"
 * section of the design document. Concrete template schemas (simple-date,
 * story-fork, event-rsvp) are added by task 3.2.
 */

/** Identifier of a colour theme available for a template (e.g. "romantic"). */
export type ThemeId = string;

/** Kinds of author-supplied input fields, used to drive validation. */
export type TemplateFieldType =
  | 'text'
  | 'longtext'
  | 'image'
  | 'placesList'
  | 'datetime'
  | 'boolean';

/**
 * A single field the author fills in when creating an invitation. The set of
 * fields for a template defines the `{{переменные}}` available to its screens.
 */
export interface TemplateField {
  /** Stable key referenced by `{{key}}` in screen elements, e.g. "имя_адресата". */
  key: string;
  /** Human-readable label shown in the author form. */
  label: string;
  /** Value type, drives validation in {@link TemplateRegistry.validateAuthorData}. */
  type: TemplateFieldType;
  /** Whether the author must provide a value. */
  required: boolean;
  /**
   * Optional maximum length. For string-valued fields (text/longtext/image)
   * this bounds the string length; for `placesList` it bounds the number of
   * places.
   */
  maxLength?: number;
  /**
   * Example/hint text shown in the empty input (greyed placeholder) so the
   * author understands what to write, e.g. «Например: Пойдёшь со мной на
   * свидание?». Not persisted — purely a UI hint.
   */
  placeholder?: string;
  /**
   * Default value used to seed the form when no draft value exists, e.g. «Да» /
   * «Нет» for button labels. Unlike {@link placeholder} this is a real value the
   * author can edit and that appears in the preview.
   */
  defaultValue?: string;
}

/** Kinds of screens the scenario engine knows how to render. */
export type ScreenKind =
  | 'intro'
  | 'invite'
  | 'fork'
  | 'placePicker'
  | 'timePicker'
  | 'rsvp'
  | 'eventDetails'
  | 'final';

/** Kinds of visual/interactive elements that can appear on a screen. */
export type ScreenElementKind =
  | 'heading'
  | 'text'
  | 'button'
  | 'image'
  | 'input'
  | 'placesGrid'
  | 'countdown';

/**
 * A visual or interactive element on a screen. Text-bearing properties
 * (`text`, `src`) may embed `{{переменные}}` that the runtime substitutes from
 * the author's data and the accumulated guest context.
 */
export interface ScreenElement {
  /** What this element is (text, button, image, ...). */
  kind: ScreenElementKind;
  /** Optional element id (useful for referencing/testing). */
  id?: string;
  /** Text content; may contain `{{variable}}` placeholders. */
  text?: string;
  /**
   * For `button`: the action dispatched to the engine (matches a
   * {@link Transition.on}), e.g. "click:yes".
   */
  action?: string;
  /** For `image`: source URL or a `{{variable}}` reference. */
  src?: string;
  /** For `input`/`placesGrid`: the field/context key this element writes to. */
  field?: string;
  /** Arbitrary element-specific presentation props. */
  props?: Record<string, unknown>;
}

/** A directed edge between screens, taken when `on` action is dispatched. */
export interface Transition {
  /** Action that triggers the transition, e.g. "click:yes", "select:place". */
  on: string;
  /** Id of the destination screen. */
  to: string;
}

/** An event pushed to the author when the guest reaches/acts on a screen. */
export interface AuthorEvent {
  /** Event category. */
  type: 'opened' | 'accepted' | 'declined' | 'rsvp';
  /** Notification text template, with `{{variable}}` substitution. */
  messageTemplate: string;
}

/** One screen of a scenario. */
export interface ScreenSchema {
  /** Unique screen id within the template, e.g. "screen-1". */
  id: string;
  /** Screen kind, mapped to a React component by the renderer. */
  kind: ScreenKind;
  /** Elements drawn on the screen. */
  elements: ScreenElement[];
  /** Outgoing transitions (forks) from this screen. */
  transitions: Transition[];
  /** Author events emitted when the guest reaches/acts on this screen. */
  emits?: AuthorEvent[];
}

/** A complete declarative template definition. */
export interface TemplateSchema {
  /** Stable template id, e.g. "simple-date" | "story-fork" | "event-rsvp". */
  id: string;
  /** Display name for the gallery. */
  name: string;
  /** Short description of the occasion. */
  description: string;
  /** Available colour themes (2-3 per template). */
  themes: ThemeId[];
  /** Fields the author fills in. */
  fields: TemplateField[];
  /** Id of the first screen shown to the guest. */
  startScreen: string;
  /** All screens of the scenario. */
  screens: ScreenSchema[];
  /** Human-readable list of features unlocked by the premium tier. */
  premiumFeatures: string[];
}

/** Lightweight projection of a template for the gallery (Requirement 1.1). */
export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  themes: ThemeId[];
}

/** A single validation problem. */
export interface ValidationError {
  /** Field/response key the error relates to (omitted for whole-object errors). */
  field?: string;
  /** Machine-readable code, e.g. "required", "maxLength", "type". */
  code: string;
  /** Human-readable explanation. */
  message: string;
}

/** Outcome of a validation pass. */
export interface ValidationResult {
  /** True when there are no errors. */
  ok: boolean;
  /** Collected errors (empty when `ok`). */
  errors: ValidationError[];
}

/**
 * The guest's final answer, sent to the server and validated against the
 * template schema. Fields are optional because they vary by template/outcome;
 * the index signature keeps the type open for template-specific extras.
 */
export interface GuestResponse {
  /** Outcome category, must be one of the template's emitted event types. */
  type: 'opened' | 'accepted' | 'declined' | 'rsvp';
  /** Guest display name (RSVP / Template 3). */
  guestName?: string;
  /** Stable per-guest idempotency key (RSVP / Template 3). */
  guestKey?: string;
  /** Chosen place (Template 2). */
  place?: string;
  /** Chosen time (Template 2, optional). */
  time?: string;
  /** RSVP decision (Template 3). */
  rsvp?: 'yes' | 'no';
  /** Party size (Template 3, when enabled). */
  guests?: number;
  [key: string]: unknown;
}

/**
 * Accumulated guest state while moving through a scenario on the client. The
 * engine fills `answers` as the guest makes choices and derives a
 * {@link GuestResponse} from it.
 */
export interface GuestContext {
  /** Template being played. */
  templateId: string;
  /** Id of the screen currently shown. */
  currentScreen: string;
  /** Accumulated answers keyed by field/context name. */
  answers: Record<string, unknown>;
}

/**
 * Read-only registry of template schemas. In the MVP schemas live in code
 * (`/templates/*.ts`); the registry exposes them for the gallery, the author
 * form (data validation) and the server-side response validation.
 */
export interface TemplateRegistry {
  /** Summaries for the gallery. */
  list(): TemplateSummary[];
  /** Full schema by id. Throws {@link TemplateNotFoundError} if unknown. */
  get(id: string): TemplateSchema;
  /** Validate author-entered data against the template's fields. */
  validateAuthorData(id: string, data: Record<string, unknown>): ValidationResult;
  /**
   * Validate a guest's response against the template schema.
   *
   * The optional `authorData` is the author's `{{переменные}}` for the concrete
   * invitation (the same shape passed to {@link validateAuthorData}). It is
   * needed because some response rules depend on what the author entered — e.g.
   * for `story-fork` a chosen place must be one of the names in the author's
   * `список_мест`, and for `event-rsvp` a party size is only required when the
   * author enabled `сбор_числа_гостей`. When `authorData` is omitted, only the
   * author-independent checks (response shape, outcome type, field types) run.
   */
  validateResponse(
    id: string,
    response: GuestResponse,
    authorData?: Record<string, unknown>,
  ): ValidationResult;
}
