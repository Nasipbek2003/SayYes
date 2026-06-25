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
import { dateAsk } from './date-ask';
import { missionDate } from './mission-date';
import { moviePoster } from './movie-poster';
import { recipeDate } from './recipe-date';
import { secretLetter } from './secret-letter';
import { wishStar } from './wish-star';
import { exMessage } from './ex-message';
import { interrogation } from './interrogation';
import { tinderStory } from './tinder-story';
import { breakingNews } from './breaking-news';
import { horoscope } from './horoscope';
import { boarding } from './boarding';
import { quest } from './quest';
import { timeMachine } from './time-machine';
import { eventRsvp } from './event-rsvp';
import { simpleDate } from './simple-date';
import { storyFork } from './story-fork';
import type { TemplateSchema } from './types';

/** Многоэкранные и тематические шаблоны — порядок = порядок в галерее. */
const galleryTemplates: TemplateSchema[] = [
  dateAsk,
  secretLetter,
  missionDate,
  moviePoster,
  wishStar,
  recipeDate,
  exMessage,
  interrogation,
  tinderStory,
  breakingNews,
  horoscope,
  boarding,
  quest,
  timeMachine,
];

/** All schemas — used by the registry (lookup by id for existing invitations). */
export const templateSchemas: TemplateSchema[] = [
  ...galleryTemplates,
  simpleDate,
  storyFork,
  eventRsvp,
];

/** Only templates shown in the gallery for new invitations. */
export const gallerySchemas: TemplateSchema[] = galleryTemplates;
