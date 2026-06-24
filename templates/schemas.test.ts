/**
 * Schema-integrity tests for the three MVP templates (task 3.2).
 *
 * Property 4 — Целостность развилок: для каждой зарегистрированной схемы любой
 * путь по `transitions` из `startScreen` достижимо завершается экраном
 * `kind = 'final'`, и не существует «висячих» переходов на несуществующий
 * `screen.id`.
 *
 * **Validates: Requirements 7.1** (and the general fork-integrity invariant for
 * Requirements 6 and 8).
 *
 * Tests also cover valid author-data examples for each template via the
 * registry's `validateAuthorData`.
 */
import { describe, expect, it } from 'vitest';

import { InMemoryTemplateRegistry } from '@/lib/templates/registry';
import { eventRsvp } from './event-rsvp';
import { simpleDate } from './simple-date';
import { storyFork } from './story-fork';
import { templateSchemas } from './index';
import type { TemplateSchema } from './types';

/** Set of screen ids reachable from `startScreen` following transitions. */
function reachableScreens(schema: TemplateSchema): Set<string> {
  const byId = new Map(schema.screens.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const queue: string[] = [schema.startScreen];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const screen = byId.get(id);
    if (!screen) continue;
    for (const t of screen.transitions) {
      if (!seen.has(t.to)) queue.push(t.to);
    }
  }
  return seen;
}

/** Set of screen ids from which a `final` screen is reachable (reverse fixpoint). */
function screensThatCanReachFinal(schema: TemplateSchema): Set<string> {
  const byId = new Map(schema.screens.map((s) => [s.id, s]));
  const canReach = new Set<string>(
    schema.screens.filter((s) => s.kind === 'final').map((s) => s.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const screen of schema.screens) {
      if (canReach.has(screen.id)) continue;
      const leadsToFinal = screen.transitions.some(
        (t) => byId.has(t.to) && canReach.has(t.to),
      );
      if (leadsToFinal) {
        canReach.add(screen.id);
        changed = true;
      }
    }
  }
  return canReach;
}

describe('template registration', () => {
  it('registers the MVP templates', () => {
    expect(templateSchemas.map((s) => s.id)).toEqual([
      'date-ask',
      'secret-letter',
      'simple-date',
      'story-fork',
      'event-rsvp',
    ]);
  });

  it('has unique screen ids within each template', () => {
    for (const schema of templateSchemas) {
      const ids = schema.screens.map((s) => s.id);
      expect(new Set(ids).size, `duplicate screen id in ${schema.id}`).toBe(ids.length);
    }
  });
});

describe.each(templateSchemas.map((s) => [s.id, s] as const))(
  'Property 4 — fork integrity: %s',
  (_id, schema) => {
    const ids = new Set(schema.screens.map((s) => s.id));

    it('has no dangling transitions (every transition.to exists)', () => {
      for (const screen of schema.screens) {
        for (const t of screen.transitions) {
          expect(ids.has(t.to), `${screen.id} → ${t.to} (on "${t.on}")`).toBe(true);
        }
      }
    });

    it('declares a startScreen that exists', () => {
      expect(ids.has(schema.startScreen)).toBe(true);
    });

    it('has at least one final screen', () => {
      expect(schema.screens.some((s) => s.kind === 'final')).toBe(true);
    });

    it('every reachable screen can reach a final (no dead-ends, no final-less cycles)', () => {
      const reachable = reachableScreens(schema);
      const canReachFinal = screensThatCanReachFinal(schema);
      for (const id of reachable) {
        expect(canReachFinal.has(id), `screen "${id}" cannot reach a final`).toBe(true);
      }
    });

    it('every non-final reachable screen has at least one outgoing transition', () => {
      const reachable = reachableScreens(schema);
      for (const screen of schema.screens) {
        if (!reachable.has(screen.id)) continue;
        if (screen.kind === 'final') continue;
        expect(
          screen.transitions.length,
          `non-final screen "${screen.id}" has no transitions`,
        ).toBeGreaterThan(0);
      }
    });

    it('has no unreachable final screens', () => {
      const reachable = reachableScreens(schema);
      const finals = schema.screens.filter((s) => s.kind === 'final');
      for (const final of finals) {
        expect(reachable.has(final.id), `final "${final.id}" is unreachable`).toBe(true);
      }
    });
  },
);

describe('valid author data validates per template', () => {
  const registry = new InMemoryTemplateRegistry(templateSchemas);

  it('accepts valid simple-date author data', () => {
    const result = registry.validateAuthorData(simpleDate.id, {
      имя_адресата: 'Айгуль',
      текст_приглашения: 'Поужинаем вместе в субботу?',
      подпись: 'Айбек',
    });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('accepts valid story-fork author data (with places list)', () => {
    const result = registry.validateAuthorData(storyFork.id, {
      имя_адресата: 'Айгуль',
      вступительный_текст: 'Сходим куда-нибудь вдвоём?',
      подпись: 'Айбек',
      список_мест: [{ название: 'Парк' }, { название: 'Кафе' }],
    });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('accepts valid story-fork author data without the optional places list', () => {
    const result = registry.validateAuthorData(storyFork.id, {
      имя_адресата: 'Айгуль',
      вступительный_текст: 'Сходим куда-нибудь вдвоём?',
      подпись: 'Айбек',
    });
    expect(result.ok).toBe(true);
  });

  it('accepts valid event-rsvp author data', () => {
    const result = registry.validateAuthorData(eventRsvp.id, {
      название_события: 'Свадьба Айбека и Айгуль',
      дата: '2025-09-01T16:00:00Z',
      время: '16:00',
      место: 'Ресторан «Достар»',
      текст_приглашения: 'Будем рады видеть вас на нашем празднике!',
      сбор_числа_гостей: true,
    });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('rejects event-rsvp data missing a required field', () => {
    const result = registry.validateAuthorData(eventRsvp.id, {
      название_события: 'Свадьба Айбека и Айгуль',
      время: '16:00',
      место: 'Ресторан «Достар»',
      текст_приглашения: 'Будем рады видеть вас!',
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'дата', code: 'required' }),
    );
  });
});
