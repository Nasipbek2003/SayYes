/**
 * Pure, framework-independent helpers for the author creation form (task 10.2).
 *
 * The create page (`app/create/page.tsx` → `CreateForm`) renders an input for
 * every {@link TemplateField} of the chosen template, edits a places list,
 * runs client-side validation and auto-saves a draft. All of that *logic* lives
 * here (no React / DOM) so it can be unit-tested in the project's `node` test
 * environment, leaving the React component a thin rendering layer.
 *
 * Responsibilities:
 *  - {@link fieldInputKind}: map a {@link TemplateFieldType} to the concrete
 *    input control the form should render.
 *  - {@link buildInitialData}: seed the form's data bag from a template schema
 *    (and any existing draft data).
 *  - {@link setFieldValue}: immutable update of one field.
 *  - Places editor (Requirement 2.4): {@link emptyPlace}, {@link addPlace},
 *    {@link updatePlace}, {@link removePlace}, {@link sanitizePlaces}.
 *  - {@link validateAuthorForm}: client-side validation mirroring the server
 *    (`TemplateRegistry.validateAuthorData`), projected to a per-field message
 *    map for easy rendering (Requirement 2.3).
 */
import { templateRegistry } from '@/lib/templates/registry';
import type {
  ScreenSchema,
  TemplateField,
  TemplateFieldType,
  TemplateRegistry,
  TemplateSchema,
} from '@/templates/types';

/** Author data bag — `{{переменные}}` keyed by field key. */
export type FormData = Record<string, unknown>;

/** Concrete input control a field maps to in the form UI. */
export type FieldInputKind =
  | 'text'
  | 'textarea'
  | 'image'
  | 'places'
  | 'datetime'
  | 'checkbox';

/** One editable place in a `placesList` field (Requirement 2.4). */
export interface PlaceDraft {
  название: string;
  фото?: string;
  описание?: string;
}

/** Map a template field type to the form control that should render it. */
export function fieldInputKind(type: TemplateFieldType): FieldInputKind {
  switch (type) {
    case 'text':
      return 'text';
    case 'longtext':
      return 'textarea';
    case 'image':
      return 'image';
    case 'placesList':
      return 'places';
    case 'datetime':
      return 'datetime';
    case 'boolean':
      return 'checkbox';
    default:
      return 'text';
  }
}

/** Default empty value for a field, used to seed the form data bag. */
function defaultValueFor(field: TemplateField): unknown {
  switch (field.type) {
    case 'boolean':
      return false;
    case 'placesList':
      return [] as PlaceDraft[];
    default:
      // Prefer an explicit template default (e.g. button labels «Да»/«Нет»).
      return field.defaultValue ?? '';
  }
}

/**
 * Build the initial form data for a template, overlaying any `existing` draft
 * data on top of per-field defaults. Unknown keys in `existing` are preserved
 * so a draft created by an older schema is never silently dropped.
 */
export function buildInitialData(
  schema: Pick<TemplateSchema, 'fields'>,
  existing: FormData = {},
): FormData {
  const data: FormData = {};
  for (const field of schema.fields) {
    const value = existing[field.key];
    data[field.key] = value === undefined ? defaultValueFor(field) : value;
  }
  // Preserve any extra keys the schema no longer declares.
  for (const [key, value] of Object.entries(existing)) {
    if (!(key in data)) data[key] = value;
  }
  return data;
}

/** Immutably set a single field value, returning a new data bag. */
export function setFieldValue(data: FormData, key: string, value: unknown): FormData {
  return { ...data, [key]: value };
}

/* --- Places editor (Requirement 2.4) --- */

/** A fresh, empty place row. */
export function emptyPlace(): PlaceDraft {
  return { название: '' };
}

/** Read a `placesList` value as a typed array (tolerant of bad shapes). */
export function readPlaces(value: unknown): PlaceDraft[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === 'string') return { название: entry };
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const name = record['название'] ?? record['name'] ?? record['title'];
      const photo = record['фото'] ?? record['photo'] ?? record['image'];
      const description = record['описание'] ?? record['description'];
      return {
        название: typeof name === 'string' ? name : '',
        ...(typeof photo === 'string' && photo !== '' ? { фото: photo } : {}),
        ...(typeof description === 'string' && description !== ''
          ? { описание: description }
          : {}),
      };
    }
    return emptyPlace();
  });
}

/** Append a new empty place to the list. */
export function addPlace(places: readonly PlaceDraft[]): PlaceDraft[] {
  return [...places, emptyPlace()];
}

/** Immutably update one field of the place at `index`. */
export function updatePlace(
  places: readonly PlaceDraft[],
  index: number,
  patch: Partial<PlaceDraft>,
): PlaceDraft[] {
  return places.map((place, i) => (i === index ? { ...place, ...patch } : place));
}

/** Remove the place at `index`. */
export function removePlace(
  places: readonly PlaceDraft[],
  index: number,
): PlaceDraft[] {
  return places.filter((_, i) => i !== index);
}

/**
 * Normalise a places list for persistence: trim strings, drop empty optional
 * fields and discard rows without a name. Keeps the stored data clean so the
 * runtime/preview never renders blank place cards.
 */
export function sanitizePlaces(places: readonly PlaceDraft[]): PlaceDraft[] {
  const result: PlaceDraft[] = [];
  for (const place of places) {
    const name = (place.название ?? '').trim();
    if (name === '') continue;
    const photo = (place.фото ?? '').trim();
    const description = (place.описание ?? '').trim();
    result.push({
      название: name,
      ...(photo !== '' ? { фото: photo } : {}),
      ...(description !== '' ? { описание: description } : {}),
    });
  }
  return result;
}

/* --- Client-side validation (Requirement 2.3) --- */

/** Outcome of validating the form, projected for per-field rendering. */
export interface FormValidation {
  /** True when there are no errors. */
  ok: boolean;
  /** First error message per field key (for inline messages). */
  fieldErrors: Record<string, string>;
}

/**
 * Validate the form data for a template, mirroring the server's
 * {@link TemplateRegistry.validateAuthorData} so client and server agree. The
 * registry is injectable for testing; it defaults to the app singleton.
 *
 * Places are sanitised before validation so half-filled rows (an empty trailing
 * row the author hasn't completed) don't count toward a non-empty required
 * list — matching what we persist.
 */
export function validateAuthorForm(
  templateId: string,
  data: FormData,
  registry: TemplateRegistry = templateRegistry,
): FormValidation {
  const normalised: FormData = { ...data };
  for (const [key, value] of Object.entries(normalised)) {
    if (Array.isArray(value)) {
      normalised[key] = sanitizePlaces(readPlaces(value));
    }
  }

  const result = registry.validateAuthorData(templateId, normalised);
  const fieldErrors: Record<string, string> = {};
  for (const error of result.errors) {
    const key = error.field ?? '_';
    if (!fieldErrors[key]) fieldErrors[key] = error.message;
  }
  return { ok: result.ok, fieldErrors };
}

/**
 * Build the payload persisted for a draft: the form data with its places list
 * sanitised. Used both for auto-save and before checkout so stored data is
 * always clean.
 */
export function toPersistedData(data: FormData): FormData {
  const out: FormData = { ...data };
  for (const [key, value] of Object.entries(out)) {
    if (Array.isArray(value)) {
      out[key] = sanitizePlaces(readPlaces(value));
    }
  }
  return out;
}

/** Matches `{{ ключ }}` placeholders in screen element text/src. */
const FIELD_PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Map each author field to the first scenario screen that references it — via a
 * `{{ключ}}` placeholder in an element's text/src, or an element's `field`.
 *
 * The author form uses this to follow the editor with the live preview: when an
 * author focuses a field, the preview jumps to the screen that field affects.
 * Fields not referenced by any screen are simply absent from the map (callers
 * fall back to the start screen).
 */
export function buildFieldScreenMap(
  screens: ReadonlyArray<ScreenSchema>,
  fields: ReadonlyArray<TemplateField>,
): Record<string, string> {
  const fieldKeys = new Set(fields.map((f) => f.key));
  const map: Record<string, string> = {};
  for (const screen of screens) {
    for (const element of screen.elements) {
      const refs = new Set<string>();
      for (const text of [element.text, element.src]) {
        if (!text) continue;
        FIELD_PLACEHOLDER.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = FIELD_PLACEHOLDER.exec(text)) !== null) {
          refs.add(match[1].trim());
        }
      }
      if (element.field) refs.add(element.field);
      for (const key of refs) {
        if (fieldKeys.has(key) && !(key in map)) map[key] = screen.id;
      }
    }
  }
  return map;
}
