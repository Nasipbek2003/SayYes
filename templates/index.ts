/**
 * Registry of concrete template schemas (MVP: schemas live in code).
 *
 * This array is the single place where templates are registered. Task 3.2 adds
 * the three MVP schemas — `simple-date`, `story-fork`, `event-rsvp` — by
 * importing each schema module and pushing it into this array, e.g.:
 *
 * ```ts
 * import { simpleDate } from './simple-date';
 * import { storyFork } from './story-fork';
 * import { eventRsvp } from './event-rsvp';
 *
 * export const templateSchemas: TemplateSchema[] = [simpleDate, storyFork, eventRsvp];
 * ```
 *
 * The default {@link templateRegistry} is built from this array, so registering
 * a schema here automatically surfaces it in the gallery, author-data
 * validation and response validation. Until task 3.2 lands, the list is empty
 * and the runtime/API simply have no templates to offer.
 */
import { eventRsvp } from './event-rsvp';
import { simpleDate } from './simple-date';
import { storyFork } from './story-fork';
import type { TemplateSchema } from './types';

export const templateSchemas: TemplateSchema[] = [simpleDate, storyFork, eventRsvp];
