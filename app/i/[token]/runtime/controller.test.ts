/**
 * Unit tests for the pure runtime helpers (task 7.2).
 *
 * Covers the framework-independent core the client runtime relies on:
 *  - background music is muted by default (Requirement 5.6);
 *  - the loading screen duration is within the 1–1.5 s range (Requirement 5.1);
 *  - `{{переменная}}` substitution from author data + guest answers;
 *  - `dispatchAction` provably moves the {@link ScenarioEngine} along a
 *    transition (Requirement 5.3) and reports when an action has no transition.
 *
 * **Validates: Requirements 5.1, 5.3, 5.6**
 */
import { describe, expect, it } from 'vitest';

import { ScenarioEngine } from '@/lib/scenario/engine';
import { simpleDate } from '@/templates/simple-date';

import {
  INITIAL_MUTED,
  LOADING_MS,
  buildScreenVars,
  dispatchAction,
  substitute,
} from './controller';

describe('runtime constants', () => {
  it('starts muted by default (Requirement 5.6)', () => {
    expect(INITIAL_MUTED).toBe(true);
  });

  it('uses a loading duration within 1–1.5s (Requirement 5.1)', () => {
    expect(LOADING_MS).toBeGreaterThanOrEqual(1000);
    expect(LOADING_MS).toBeLessThanOrEqual(1500);
  });
});

describe('substitute', () => {
  it('replaces {{placeholders}} from the variable bag', () => {
    expect(substitute('Привет, {{имя_адресата}}!', { имя_адресата: 'Айя' })).toBe(
      'Привет, Айя!',
    );
  });

  it('tolerates surrounding whitespace inside the braces', () => {
    expect(substitute('{{ имя }}', { имя: 'Лео' })).toBe('Лео');
  });

  it('replaces unknown keys with an empty string (no raw markup leaks)', () => {
    expect(substitute('Эй {{missing}}!', {})).toBe('Эй !');
  });

  it('returns an empty string for undefined text', () => {
    expect(substitute(undefined, {})).toBe('');
  });
});

describe('buildScreenVars', () => {
  it('overlays guest answers on top of author data', () => {
    const vars = buildScreenVars(
      { имя_адресата: 'Айя', выбранное_место: 'из автора' },
      { answers: { выбранное_место: 'Парк' } },
    );
    expect(vars).toEqual({ имя_адресата: 'Айя', выбранное_место: 'Парк' });
  });
});

describe('dispatchAction (Requirement 5.3)', () => {
  it('moves the engine along a matching transition', () => {
    const engine = new ScenarioEngine(simpleDate);
    const result = dispatchAction(engine, 'click:open');
    expect(result.moved).toBe(true);
    expect(result.screenId).toBe('invite');
    expect(result.isFinal).toBe(false);
    expect(engine.current.id).toBe('invite');
  });

  it('reports no move for an action without a transition', () => {
    const engine = new ScenarioEngine(simpleDate);
    dispatchAction(engine, 'click:open');
    const result = dispatchAction(engine, 'click:no'); // runaway "no" — no transition
    expect(result.moved).toBe(false);
    expect(result.screenId).toBe('invite');
  });

  it('reaches the final screen on the accept path', () => {
    const engine = new ScenarioEngine(simpleDate);
    dispatchAction(engine, 'click:open');
    const result = dispatchAction(engine, 'click:yes');
    expect(result.isFinal).toBe(true);
  });
});
