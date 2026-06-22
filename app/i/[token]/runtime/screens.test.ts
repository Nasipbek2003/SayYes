/**
 * Component tests for the screen renderer and the `kind` → component mapping
 * (task 7.2).
 *
 * Covers the render scaffold without a DOM (matching the project's node test
 * env) by resolving the returned React element tree manually:
 *  - {@link ScreenRenderer} picks the component matching the screen `kind` and
 *    renders a container tagged with that kind;
 *  - every {@link ScreenKind} has a mapped component (no unhandled kinds);
 *  - a button element dispatches its declared action via `onAction`, so a UI
 *    action drives the engine (Requirement 5.3);
 *  - `{{переменные}}` are substituted into rendered texts.
 *
 * **Validates: Requirements 5.2, 5.3**
 */
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import type { ScreenKind, ScreenSchema } from '@/templates/types';

import { SCREEN_COMPONENTS, ScreenRenderer } from './screens';

const ALL_KINDS: ScreenKind[] = [
  'intro',
  'invite',
  'fork',
  'placePicker',
  'timePicker',
  'rsvp',
  'eventDetails',
  'final',
];

/**
 * Recursively resolve a React element tree into host (string-typed) elements by
 * invoking any function components (these scaffold screens are hook-free, so
 * calling them directly is safe). Returns a flat list of host elements.
 */
function resolveHostElements(node: unknown): ReactElement[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(resolveHostElements);
  if (typeof node !== 'object') return [];

  const element = node as ReactElement;
  const { type, props } = element as { type: unknown; props: Record<string, unknown> };
  const hosts: ReactElement[] = [];

  if (typeof type === 'function') {
    // Function component: invoke and recurse into its output.
    const rendered = (type as (p: unknown) => unknown)(props);
    hosts.push(...resolveHostElements(rendered));
  } else if (typeof type === 'string') {
    // Host element (e.g. "section", "button"): record it, then recurse children.
    hosts.push(element);
    hosts.push(...resolveHostElements(props?.children));
  } else {
    // Fragment or similar: recurse children.
    hosts.push(...resolveHostElements(props?.children));
  }

  return hosts;
}

/** Find the first host element of a given tag. */
function findByTag(hosts: ReactElement[], tag: string): ReactElement | undefined {
  return hosts.find((el) => el.type === tag);
}

function screenOfKind(kind: ScreenKind): ScreenSchema {
  return {
    id: `screen-${kind}`,
    kind,
    elements: [
      { kind: 'heading', text: 'Привет, {{имя_адресата}}!' },
      { kind: 'button', text: 'Да!', action: 'click:yes' },
    ],
    transitions: [{ on: 'click:yes', to: 'final' }],
  };
}

describe('SCREEN_COMPONENTS mapping', () => {
  it('maps every screen kind to a component', () => {
    for (const kind of ALL_KINDS) {
      expect(typeof SCREEN_COMPONENTS[kind]).toBe('function');
    }
  });
});

describe('ScreenRenderer (Requirement 5.2/5.3)', () => {
  it.each(ALL_KINDS)('renders a container tagged with kind=%s', (kind) => {
    const element = ScreenRenderer({
      screen: screenOfKind(kind),
      vars: { имя_адресата: 'Айя' },
      onAction: vi.fn(),
    });

    const hosts = resolveHostElements(element);
    const section = findByTag(hosts, 'section');
    expect(section).toBeDefined();
    expect(section?.props['data-screen-kind']).toBe(kind);
  });

  it('substitutes {{переменные}} into rendered text', () => {
    const element = ScreenRenderer({
      screen: screenOfKind('intro'),
      vars: { имя_адресата: 'Лео' },
      onAction: vi.fn(),
    });

    const hosts = resolveHostElements(element);
    const heading = findByTag(hosts, 'h1');
    expect(heading?.props.children).toBe('Привет, Лео!');
  });

  it('dispatches a button action via onAction (Requirement 5.3)', () => {
    const onAction = vi.fn();
    const element = ScreenRenderer({
      screen: screenOfKind('invite'),
      vars: {},
      onAction,
    });

    const hosts = resolveHostElements(element);
    const button = findByTag(hosts, 'button');
    expect(button?.props['data-action']).toBe('click:yes');

    // Invoke the click handler the renderer wired up.
    (button?.props.onClick as () => void)();
    expect(onAction).toHaveBeenCalledWith('click:yes');
  });

  it('returns null for an unknown screen kind', () => {
    const element = ScreenRenderer({
      screen: { ...screenOfKind('intro'), kind: 'mystery' as ScreenKind },
      vars: {},
      onAction: vi.fn(),
    });
    expect(element).toBeNull();
  });
});
