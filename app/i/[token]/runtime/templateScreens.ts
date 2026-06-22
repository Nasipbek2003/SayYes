/**
 * Pure, framework-independent helpers that derive the per-screen UI config for
 * the detailed template screens (tasks 8.x), starting with Template 1
 * «Приглашение на свидание» (`simple-date`).
 *
 * The scenario engine and the `kind` → component mapping are shared by all
 * templates, so the detailed, template-specific layout is selected by
 * `templateId` inside the screen components ({@link screens}). To keep that
 * selection logic testable without a DOM (the project's test env is node), the
 * *data extraction* — which element holds the heading, which button carries the
 * "yes" action, how many runaway attempts to allow, which texts are the success
 * copy — lives here as pure functions over the declarative
 * {@link ScreenSchema}. The React components only render the result.
 */
import type { ScreenElement, ScreenSchema } from '@/templates/types';

import { substitute } from './controller';

/** Template id of Template 1 «Приглашение на свидание». */
export const SIMPLE_DATE_TEMPLATE_ID = 'simple-date';

/** Whether a screen belongs to Template 1 and should use its detailed UI. */
export function isSimpleDate(templateId: string | undefined): boolean {
  return templateId === SIMPLE_DATE_TEMPLATE_ID;
}

/** First element matching `predicate`, or `undefined`. */
function findElement(
  screen: ScreenSchema,
  predicate: (element: ScreenElement) => boolean,
): ScreenElement | undefined {
  return screen.elements.find(predicate);
}

/**
 * Find the action of the first button whose `action` includes `needle`
 * (e.g. `"yes"` → `"click:yes"`). Falls back to `fallback` so the UI still has
 * a working action if a schema omits it.
 */
export function findButtonAction(
  screen: ScreenSchema,
  needle: string,
  fallback: string,
): string {
  const button = findElement(
    screen,
    (el) => el.kind === 'button' && typeof el.action === 'string' && el.action.includes(needle),
  );
  return button?.action ?? fallback;
}

/** Config for Template 1 «Заставка» (intro screen). */
export interface SimpleDateIntroConfig {
  /** Resolved photo URL, or empty string to fall back to the heart icon. */
  photo: string;
  /** Resolved greeting heading text. */
  heading: string;
  /** Label of the "Открыть" button. */
  openLabel: string;
  /** Engine action dispatched when "Открыть" is tapped. */
  openAction: string;
}

/** Derive the intro-screen config from its schema + substitution vars. */
export function simpleDateIntroConfig(
  screen: ScreenSchema,
  vars: Record<string, unknown>,
): SimpleDateIntroConfig {
  const image = findElement(screen, (el) => el.kind === 'image');
  const heading = findElement(screen, (el) => el.kind === 'heading');
  const openButton = findElement(screen, (el) => el.kind === 'button');
  return {
    photo: substitute(image?.src, vars),
    heading: substitute(heading?.text, vars),
    openLabel: substitute(openButton?.text, vars) || 'Открыть',
    openAction: openButton?.action ?? findButtonAction(screen, 'open', 'click:open'),
  };
}

/** Config for Template 1 «Приглашение» (invite screen). */
export interface SimpleDateInviteConfig {
  /** Resolved invitation body text. */
  inviteText: string;
  /** Resolved signature line (e.g. "— Лео"). */
  signature: string;
  /** Label of the accent "Да" button. */
  yesLabel: string;
  /** Label of the runaway "Нет" button. */
  noLabel: string;
  /** Engine action dispatched when "Да" is tapped. */
  yesAction: string;
  /** Attempts before the runaway "Нет" disappears (Requirement 6.3). */
  attemptLimit: number;
}

/**
 * Derive the invite-screen config from its schema. The first text element is
 * the invitation body, the second (if any) is the signature line; the "Да"
 * button's action and the "Нет" button's `maxAttempts` prop drive the
 * {@link RunawayButton}.
 */
export function simpleDateInviteConfig(
  screen: ScreenSchema,
  vars: Record<string, unknown>,
): SimpleDateInviteConfig {
  const texts = screen.elements.filter((el) => el.kind === 'text');
  const yesButton = findElement(
    screen,
    (el) => el.kind === 'button' && el.id === 'yes',
  );
  const noButton = findElement(
    screen,
    (el) => el.kind === 'button' && el.id === 'no',
  );
  const rawLimit = noButton?.props?.['maxAttempts'];
  const attemptLimit = typeof rawLimit === 'number' && rawLimit > 0 ? rawLimit : 5;
  return {
    inviteText: substitute(texts[0]?.text, vars),
    signature: substitute(texts[1]?.text, vars),
    yesLabel: substitute(yesButton?.text, vars) || 'Да!',
    noLabel: substitute(noButton?.text, vars) || 'Нет',
    yesAction: yesButton?.action ?? findButtonAction(screen, 'yes', 'click:yes'),
    attemptLimit,
  };
}

/** Config for a success/agreement final screen (shared by templates). */
export interface FinalScreenConfig {
  /** Resolved success copy lines (every text element with content). */
  successLines: string[];
  /** Whether a confetti effect element is declared on the screen. */
  hasConfetti: boolean;
}

/** Backwards-compatible alias for Template 1's «Согласие» config shape. */
export type SimpleDateFinalConfig = FinalScreenConfig;

/**
 * Derive a final/agreement screen's config: the visible success copy and
 * whether the screen declares a confetti effect (the
 * `{ props: { effect: 'confetti' } }` element in the schema). Shared by the
 * Template 1 «Согласие» and Template 2 «Финал согласия» screens.
 */
export function finalScreenConfig(
  screen: ScreenSchema,
  vars: Record<string, unknown>,
): FinalScreenConfig {
  const successLines: string[] = [];
  let hasConfetti = false;
  for (const element of screen.elements) {
    if (element.props?.['effect'] === 'confetti') {
      hasConfetti = true;
      continue;
    }
    if (element.kind === 'text' || element.kind === 'heading') {
      const text = substitute(element.text, vars);
      if (text) successLines.push(text);
    }
  }
  return { successLines, hasConfetti };
}

/** @deprecated Use {@link finalScreenConfig}; kept for task 8.1 callers/tests. */
export function simpleDateFinalConfig(
  screen: ScreenSchema,
  vars: Record<string, unknown>,
): SimpleDateFinalConfig {
  return finalScreenConfig(screen, vars);
}

/* --- Template 2 «Ты реально мне отказала?» (story-fork) detailed UI (task 8.2) --- */

/** Template id of Template 2 «Ты реально мне отказала?». */
export const STORY_FORK_TEMPLATE_ID = 'story-fork';

/** Whether a screen belongs to Template 2 and should use its detailed UI. */
export function isStoryFork(templateId: string | undefined): boolean {
  return templateId === STORY_FORK_TEMPLATE_ID;
}

/** Find the first button whose `id` equals `id`. */
function findButtonById(
  screen: ScreenSchema,
  id: string,
): ScreenElement | undefined {
  return findElement(screen, (el) => el.kind === 'button' && el.id === id);
}

/** Config for Template 2 — Экран 1 «Приглашение». */
export interface StoryForkInviteConfig {
  /** Resolved intro/invitation text. */
  introText: string;
  /** Label + action of the «Давай!» (accept) button → выбор места. */
  yesLabel: string;
  yesAction: string;
  /** Label + action of the «Нет, спасибо» button → «реально отказала?». */
  noLabel: string;
  noAction: string;
}

/** Derive the invite-screen config (screen-1) from its schema. */
export function storyForkInviteConfig(
  screen: ScreenSchema,
  vars: Record<string, unknown>,
): StoryForkInviteConfig {
  const text = findElement(screen, (el) => el.kind === 'text');
  const yes = findButtonById(screen, 'yes');
  const no = findButtonById(screen, 'no');
  return {
    introText: substitute(text?.text, vars),
    yesLabel: substitute(yes?.text, vars) || 'Давай!',
    yesAction: yes?.action ?? findButtonAction(screen, 'yes', 'click:yes'),
    noLabel: substitute(no?.text, vars) || 'Нет, спасибо',
    noAction: no?.action ?? findButtonAction(screen, 'no', 'click:no'),
  };
}

/** Config for Template 2 — Экран 2 «Ты реально мне отказала?». */
export interface StoryForkConfirmConfig {
  /** Resolved prompt text («Ты реально мне отказала?? 🥺»). */
  prompt: string;
  /** «Да» — confirms the decline → soft final. */
  confirmLabel: string;
  confirmAction: string;
  /** «Нет» — changed her mind → place picker. */
  cancelLabel: string;
  cancelAction: string;
}

/** Derive the «реально отказала?» fork config (screen-2). */
export function storyForkConfirmConfig(
  screen: ScreenSchema,
  vars: Record<string, unknown>,
): StoryForkConfirmConfig {
  const text = findElement(screen, (el) => el.kind === 'text');
  const confirm = findButtonById(screen, 'confirm-no');
  const cancel = findButtonById(screen, 'cancel-no');
  return {
    prompt: substitute(text?.text, vars),
    confirmLabel: substitute(confirm?.text, vars) || 'Да',
    confirmAction: confirm?.action ?? findButtonAction(screen, 'yes', 'click:yes'),
    cancelLabel: substitute(cancel?.text, vars) || 'Нет',
    cancelAction: cancel?.action ?? findButtonAction(screen, 'no', 'click:no'),
  };
}

/** Config for Template 2 — Экран 3 «Мягкий финал отказа». */
export interface StoryForkSoftDeclineConfig {
  /** Resolved respectful decline copy lines. */
  textLines: string[];
  /** Label + action of the «Передумала?» button → back to screen-1. */
  reconsiderLabel: string;
  reconsiderAction: string;
}

/**
 * Whether a `final`-kind screen is the *soft decline* (screen-3) rather than
 * the agreement final (screen-6). The soft-decline screen carries a button (the
 * «Передумала?» path back to the start), the agreement final does not.
 */
export function isSoftDeclineScreen(screen: ScreenSchema): boolean {
  return screen.elements.some((el) => el.kind === 'button');
}

/** Derive the soft-decline config (screen-3). */
export function storyForkSoftDeclineConfig(
  screen: ScreenSchema,
  vars: Record<string, unknown>,
): StoryForkSoftDeclineConfig {
  const textLines: string[] = [];
  for (const element of screen.elements) {
    if (element.kind === 'text' || element.kind === 'heading') {
      const text = substitute(element.text, vars);
      if (text) textLines.push(text);
    }
  }
  const reconsider = findElement(screen, (el) => el.kind === 'button');
  return {
    textLines,
    reconsiderLabel: substitute(reconsider?.text, vars) || 'Передумала?',
    reconsiderAction:
      reconsider?.action ?? findButtonAction(screen, 'reconsider', 'click:reconsider'),
  };
}

/** A normalised place card surfaced to the place-picker grid. */
export interface PlaceCard {
  /** Place name (required). */
  name: string;
  /** Optional photo URL. */
  photo?: string;
  /** Optional short description. */
  description?: string;
}

/** Loosely-typed author place entry (localized or generic keys). */
interface AuthorPlace {
  название?: unknown;
  name?: unknown;
  title?: unknown;
  фото?: unknown;
  photo?: unknown;
  image?: unknown;
  описание?: unknown;
  description?: unknown;
}

/**
 * Map normalised author places (the {@link PublicInvitation.places} projection,
 * which uses localized keys) into {@link PlaceCard}s for the grid. Entries
 * without a usable name are dropped.
 */
export function toPlaceCards(
  places: ReadonlyArray<AuthorPlace | string> | undefined,
): PlaceCard[] {
  if (!Array.isArray(places)) return [];
  const cards: PlaceCard[] = [];
  for (const entry of places) {
    if (typeof entry === 'string') {
      const name = entry.trim();
      if (name !== '') cards.push({ name });
      continue;
    }
    if (entry && typeof entry === 'object') {
      const rawName = entry.название ?? entry.name ?? entry.title;
      const name = typeof rawName === 'string' ? rawName.trim() : '';
      if (name === '') continue;
      const photo = entry.фото ?? entry.photo ?? entry.image;
      const description = entry.описание ?? entry.description;
      cards.push({
        name,
        ...(typeof photo === 'string' && photo.trim() !== '' ? { photo } : {}),
        ...(typeof description === 'string' && description.trim() !== ''
          ? { description }
          : {}),
      });
    }
  }
  return cards;
}

/** Config for Template 2 — Экран 4 «Выбор места». */
export interface StoryForkPlacePickerConfig {
  /** Resolved prompt text («Отлично! Тогда выбери, куда хотим 👇»). */
  prompt: string;
  /** Context key the chosen place is written to (e.g. `выбранное_место`). */
  placeField: string;
  /** Label + action of the «Готово» button. */
  doneLabel: string;
  doneAction: string;
  /** Place cards to choose from. */
  places: PlaceCard[];
  /** True when there are no places → free «Напиши, куда хочешь» input. */
  isEmpty: boolean;
  /** Placeholder/label for the free-text fallback (Requirement 7.6). */
  emptyLabel: string;
}

/** Default key the place picker writes the chosen place to. */
export const DEFAULT_PLACE_FIELD = 'выбранное_место';

/**
 * Derive the place-picker config (screen-4). The places come from the
 * invitation's normalised list; when it is empty the screen falls back to a
 * free-text field (Requirement 7.6) labelled by the grid element's
 * `emptyFallback` prop.
 */
export function storyForkPlacePickerConfig(
  screen: ScreenSchema,
  places: ReadonlyArray<AuthorPlace | string> | undefined,
  vars: Record<string, unknown>,
): StoryForkPlacePickerConfig {
  const text = findElement(screen, (el) => el.kind === 'text');
  const grid = findElement(screen, (el) => el.kind === 'placesGrid');
  const done = findButtonById(screen, 'done') ?? findElement(screen, (el) => el.kind === 'button');
  const cards = toPlaceCards(places);
  const fallback = grid?.props?.['emptyFallback'];
  return {
    prompt: substitute(text?.text, vars),
    placeField: grid?.field ?? DEFAULT_PLACE_FIELD,
    doneLabel: substitute(done?.text, vars) || 'Готово',
    doneAction: done?.action ?? findButtonAction(screen, 'place', 'select:place'),
    places: cards,
    isEmpty: cards.length === 0,
    emptyLabel: typeof fallback === 'string' ? fallback : 'Напиши, куда хочешь',
  };
}

/** Config for Template 2 — Экран 5 «Выбор времени». */
export interface StoryForkTimePickerConfig {
  /** Resolved prompt text («Когда тебе удобно?»). */
  prompt: string;
  /** Context key the chosen time is written to (e.g. `выбранное_время`). */
  timeField: string;
  /** Label + action of the «Подтвердить» button. */
  confirmLabel: string;
  confirmAction: string;
  /** Optional fixed time slots declared by the schema; empty → free input. */
  options: string[];
}

/** Default key the time picker writes the chosen time to. */
export const DEFAULT_TIME_FIELD = 'выбранное_время';

/**
 * Derive the time-picker config (screen-5). Fixed slots may be declared on the
 * input element's `options` prop; otherwise the guest types a free value.
 */
export function storyForkTimePickerConfig(
  screen: ScreenSchema,
  vars: Record<string, unknown>,
): StoryForkTimePickerConfig {
  const text = findElement(screen, (el) => el.kind === 'text');
  const input = findElement(screen, (el) => el.kind === 'input');
  const confirm = findElement(screen, (el) => el.kind === 'button');
  const rawOptions = input?.props?.['options'];
  const options = Array.isArray(rawOptions)
    ? rawOptions.filter((o): o is string => typeof o === 'string' && o.trim() !== '')
    : [];
  return {
    prompt: substitute(text?.text, vars),
    timeField: input?.field ?? DEFAULT_TIME_FIELD,
    confirmLabel: substitute(confirm?.text, vars) || 'Подтвердить',
    confirmAction: confirm?.action ?? findButtonAction(screen, 'time', 'select:time'),
    options,
  };
}

/**
 * Whether a selection (chosen place or typed value) is ready to submit — i.e.
 * the «Готово»/«Подтвердить» button should be enabled. A trimmed, non-empty
 * value is required (Requirement 7.5: «Готово» active only after a choice).
 */
export function isSelectionReady(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Build the engine dispatch payload for a selection: a single-key object that
 * the {@link ScenarioEngine} merges into its `answers` and that
 * {@link RESPONSE_KEY_MAP} maps onto the {@link GuestResponse} (`place`/`time`).
 * The value is trimmed; returns `null` when the value is not ready so callers
 * never dispatch an empty selection.
 */
export function buildSelectionPayload(
  field: string,
  value: string | undefined | null,
): Record<string, string> | null {
  if (!isSelectionReady(value)) return null;
  return { [field]: (value as string).trim() };
}

/* --- Template 3 «Той / праздник» (event-rsvp) detailed UI (task 8.3) ---
 *
 * Pure config/derivation for the event RSVP screens, mirroring the
 * Template 1/2 helpers above: the React components ({@link screens}) only
 * render what these functions extract from the declarative schema + vars, so
 * the selection logic stays unit-testable without a DOM. Covers the cover
 * (Экран 1), event details (Экран 2 — countdown/map/dress code), the RSVP form
 * (Экран 3) and the confirmation (Экран 4 — attend vs decline), plus the
 * guest-side RSVP payload that feeds {@link RESPONSE_KEY_MAP}.
 */

/** Template id of Template 3 «Той / праздник». */
export const EVENT_RSVP_TEMPLATE_ID = 'event-rsvp';

/** Whether a screen belongs to Template 3 and should use its detailed UI. */
export function isEventRsvp(templateId: string | undefined): boolean {
  return templateId === EVENT_RSVP_TEMPLATE_ID;
}

/** Config for Template 3 — Экран 1 «Обложка». */
export interface EventRsvpCoverConfig {
  /** Resolved full-screen cover photo URL (empty → gradient-only fallback). */
  cover: string;
  /** Resolved event title («{{название_события}}»). */
  title: string;
  /** Label + action of the «Открыть приглашение» button → детали события. */
  openLabel: string;
  openAction: string;
}

/** Derive the cover config (screen-1). */
export function eventRsvpCoverConfig(
  screen: ScreenSchema,
  vars: Record<string, unknown>,
): EventRsvpCoverConfig {
  const image = findElement(screen, (el) => el.kind === 'image');
  const heading = findElement(screen, (el) => el.kind === 'heading');
  const open = findElement(screen, (el) => el.kind === 'button');
  return {
    cover: substitute(image?.src, vars),
    title: substitute(heading?.text, vars),
    openLabel: substitute(open?.text, vars) || 'Открыть приглашение',
    openAction: open?.action ?? findButtonAction(screen, 'open', 'click:open'),
  };
}

/**
 * Build a maps URL that opens a search for `address` (Requirement 8.2: «Показать
 * на карте» opens `{{адрес}}`). Uses the Google Maps universal search URL, which
 * resolves on web and hands off to the native maps app on mobile. Returns an
 * empty string when there is no usable address, so the button can be hidden.
 */
export function buildMapUrl(address: string | undefined | null): string {
  if (typeof address !== 'string') return '';
  const trimmed = address.trim();
  if (trimmed === '') return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}

/** Config for Template 3 — Экран 2 «Детали события». */
export interface EventRsvpDetailsConfig {
  /** Resolved invitation body text. */
  inviteText: string;
  /** Resolved details line (📅 дата · 🕐 время · 📍 место). */
  details: string;
  /** Resolved dress-code line, or empty when the author left it blank. */
  dressCode: string;
  /** ISO/string target for the {@link Countdown} (the event `{{дата}}`). */
  countdownTarget: string;
  /** Maps URL for «Показать на карте», or empty when no address. */
  mapUrl: string;
  /** Label of the «Показать на карте» button. */
  mapLabel: string;
  /** Label + action of the «Подтвердить участие» button → форма RSVP. */
  confirmLabel: string;
  confirmAction: string;
}

/**
 * Derive the event-details config (screen-2). The dress-code line is only
 * surfaced when the author filled `{{дресс_код}}` (the substituted text still
 * carries content beyond the static «Дресс-код: » label). The countdown target
 * is the raw author date so {@link Countdown} can parse it.
 */
export function eventRsvpDetailsConfig(
  screen: ScreenSchema,
  vars: Record<string, unknown>,
): EventRsvpDetailsConfig {
  const inviteEl = findElement(screen, (el) => el.kind === 'text' && el.id === 'invite-text');
  const detailsEl = findElement(screen, (el) => el.kind === 'text' && el.id === 'details');
  const dressEl = findElement(screen, (el) => el.kind === 'text' && el.id === 'dresscode');
  const countdownEl = findElement(screen, (el) => el.kind === 'countdown');
  const mapBtn = findButtonById(screen, 'map');
  const confirmBtn = findButtonById(screen, 'rsvp') ?? findElement(
    screen,
    (el) => el.kind === 'button' && el.id !== 'map',
  );

  // Dress code is optional: only show the line when the author provided a value.
  const dressCodeValue = typeof vars['дресс_код'] === 'string' ? (vars['дресс_код'] as string).trim() : '';
  const dressCode = dressCodeValue !== '' ? substitute(dressEl?.text, vars) : '';

  const rawAddress = vars['адрес'];
  const mapUrl = buildMapUrl(typeof rawAddress === 'string' ? rawAddress : '');

  const rawUntil = countdownEl?.props?.['until'];
  const countdownTarget =
    typeof rawUntil === 'string' ? substitute(rawUntil, vars) : '';

  return {
    inviteText: substitute(inviteEl?.text, vars),
    details: substitute(detailsEl?.text, vars),
    dressCode,
    countdownTarget,
    mapUrl,
    mapLabel: substitute(mapBtn?.text, vars) || 'Показать на карте',
    confirmLabel: substitute(confirmBtn?.text, vars) || 'Подтвердить участие',
    confirmAction:
      confirmBtn?.action ?? findButtonAction(screen, 'rsvp', 'click:rsvp'),
  };
}

/** RSVP decision: attending («Приду») or not («Не смогу»). */
export type RsvpStatus = 'yes' | 'no';

/** Config for Template 3 — Экран 3 «RSVP». */
export interface EventRsvpFormConfig {
  /** Label of the «Приду» choice button. */
  attendLabel: string;
  /** Label of the «Не смогу» choice button. */
  declineLabel: string;
  /** Whether the author enabled collecting the party size (`+1`). */
  collectsGuests: boolean;
  /** Engine action that submits the RSVP (schema transition `on`). */
  submitAction: string;
  /** Placeholder for the guest-name input. */
  namePlaceholder: string;
  /** Placeholder/label for the party-size input. */
  guestsPlaceholder: string;
  /** Label of the «Отправить» submit button. */
  submitLabel: string;
}

/**
 * Derive the RSVP-form config (screen-3). Whether the party-size field shows is
 * driven by the author's `{{сбор_числа_гостей}}` flag (Requirement 8.3). The
 * submit action is taken from the screen's outgoing transition so it always
 * matches the schema.
 */
export function eventRsvpFormConfig(
  screen: ScreenSchema,
  vars: Record<string, unknown>,
): EventRsvpFormConfig {
  const attend = findButtonById(screen, 'attend');
  const decline = findButtonById(screen, 'decline');
  const submitAction = screen.transitions[0]?.on ?? 'submit:rsvp';
  return {
    attendLabel: substitute(attend?.text, vars) || 'Приду',
    declineLabel: substitute(decline?.text, vars) || 'Не смогу',
    collectsGuests: vars['сбор_числа_гостей'] === true,
    submitAction,
    namePlaceholder: 'Ваше имя',
    guestsPlaceholder: 'Сколько вас будет?',
    submitLabel: 'Отправить',
  };
}

/** Parse the raw party-size input into a positive integer, or `null`. */
export function parseGuests(raw: string | undefined | null): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

/** Local form state for the RSVP screen (before submit). */
export interface RsvpFormState {
  /** Guest name as typed. */
  name: string;
  /** Chosen decision, or empty until the guest picks. */
  status: RsvpStatus | '';
  /** Raw party-size input. */
  guests: string;
}

/**
 * Whether the RSVP form is ready to submit (so «Отправить» enables). A name and
 * a decision are always required; when the author collects guests and the guest
 * is attending, a valid positive party size is also required (Requirement 8.3).
 */
export function isRsvpReady(state: RsvpFormState, collectsGuests: boolean): boolean {
  if (state.name.trim() === '' || state.status === '') return false;
  if (collectsGuests && state.status === 'yes') {
    return parseGuests(state.guests) !== null;
  }
  return true;
}

/**
 * Build the engine dispatch payload for an RSVP submit. Returns a flat object
 * keyed by the domain keys {@link RESPONSE_KEY_MAP} understands
 * (`имя_гостя` → guestName, `статус_rsvp` → rsvp, `число_гостей` → guests,
 * `guestKey` → guestKey), so the engine's {@link ScenarioEngine.buildResponse}
 * assembles a correct {@link GuestResponse}. The party size is included only
 * when collected and attending. Returns `null` when the form is not ready, so
 * callers never dispatch an incomplete RSVP.
 *
 * The `guestKey` makes a repeat RSVP from the same browser update the same
 * record instead of duplicating it (Requirement 8.5).
 */
export function buildRsvpPayload(
  state: RsvpFormState,
  collectsGuests: boolean,
  guestKey: string,
): Record<string, unknown> | null {
  if (!isRsvpReady(state, collectsGuests)) return null;
  const payload: Record<string, unknown> = {
    имя_гостя: state.name.trim(),
    статус_rsvp: state.status,
    guestKey,
  };
  if (collectsGuests && state.status === 'yes') {
    const guests = parseGuests(state.guests);
    if (guests !== null) payload['число_гостей'] = guests;
  }
  return payload;
}

/** Default polite copy shown when the guest declines («Не смогу»). */
export const RSVP_DECLINE_TEXT = 'Жаль, что не получится. Спасибо, что ответил(а) 💛';

/** Config for Template 3 — Экран 4 «Подтверждение». */
export interface EventRsvpConfirmationConfig {
  /** Whether the guest is attending («Приду»). */
  attending: boolean;
  /** Confirmation copy lines (attend success copy or the polite decline text). */
  lines: string[];
  /** Whether to fire confetti (attending only). */
  hasConfetti: boolean;
}

/**
 * Derive the confirmation config (screen-4) from the RSVP decision carried in
 * `vars` (the accumulated `статус_rsvp` answer). Attending shows the schema's
 * success copy + confetti; declining shows the polite {@link RSVP_DECLINE_TEXT}
 * with no confetti (Requirement 8.4).
 */
export function eventRsvpConfirmationConfig(
  screen: ScreenSchema,
  vars: Record<string, unknown>,
): EventRsvpConfirmationConfig {
  const attending = vars['статус_rsvp'] !== 'no';
  const base = finalScreenConfig(screen, vars);
  if (attending) {
    return { attending: true, lines: base.successLines, hasConfetti: base.hasConfetti };
  }
  return { attending: false, lines: [RSVP_DECLINE_TEXT], hasConfetti: false };
}
