/**
 * Demo sample-data builder (live gallery demo — "try as guest").
 *
 * Produces plausible author `{{переменные}}` for any template purely from its
 * declared {@link TemplateField}s, so a visitor can play through a template
 * interactively *before* creating/paying (a strong conversion lever). It is
 * generic (works for all templates, current and future) with a few key-based
 * overrides for the most common fields so the demo reads naturally.
 *
 * No network, no persistence — the result is fed straight into a client-side
 * scenario engine on the demo page.
 */
import type { TemplateField, TemplateSchema } from '@/templates/types';

/** Natural-sounding sample values for common field keys. */
const KEY_SAMPLES: Record<string, string> = {
  имя_адресата: 'Алиса',
  имя_гостя: 'Алиса',
  имя_автора: 'Артур',
  подпись: 'С любовью, Артур',
  текст_приглашения: 'Пойдёшь со мной на свидание в эту субботу?',
  название_события: 'День рождения Алисы',
  адрес: 'Бишкек, ул. Киевская 95',
  дресс_код: 'Smart casual',
};

/** A ready-made demo place list for `placesList` fields. */
const DEMO_PLACES = [
  { название: 'Кофейня «Уют»', описание: 'Тихое место с лучшим капучино' },
  { название: 'Набережная', описание: 'Прогулка на закате' },
  { название: 'Кинотеатр', описание: 'Новинка, которую все ждут' },
];

/** Sample value for a single field, chosen by key then by type. */
function sampleFor(field: TemplateField): unknown {
  // Explicit template default wins — it's what the author would see pre-filled.
  if (field.defaultValue !== undefined && field.defaultValue !== '') {
    return field.defaultValue;
  }
  if (field.key in KEY_SAMPLES) return KEY_SAMPLES[field.key];

  switch (field.type) {
    case 'placesList':
      return DEMO_PLACES;
    case 'boolean':
      return false;
    case 'select':
      return field.options?.[0]?.value ?? '';
    case 'datetime': {
      // Two weeks out, on the hour — good for countdowns.
      const d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      d.setMinutes(0, 0, 0);
      return d.toISOString().slice(0, 16);
    }
    case 'image':
      // Leave empty so screens fall back to their built-in decorative visuals
      // (a heart/emoji) instead of a broken image.
      return '';
    case 'longtext':
      return field.placeholder ?? 'Мне давно хотелось сказать тебе кое-что важное…';
    case 'text':
    default:
      return field.placeholder ?? 'Пример';
  }
}

/** Build a full demo author-data bag for a template schema. */
export function buildDemoData(schema: TemplateSchema): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of schema.fields) {
    data[field.key] = sampleFor(field);
  }
  return data;
}
