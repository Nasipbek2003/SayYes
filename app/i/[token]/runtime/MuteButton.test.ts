/**
 * Component tests for the mute/unmute control (task 7.2, Requirement 5.6).
 *
 * Verifies (without a DOM, matching the project's node test env) that:
 *  - the control reflects the muted state (default-muted is owned by the parent
 *    runtime, initialised from {@link INITIAL_MUTED});
 *  - toggling invokes the parent's `onToggle`;
 *  - accessible labels describe the action for each state.
 *
 * **Validates: Requirements 5.6**
 */
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import { INITIAL_MUTED } from './controller';
import { MuteButton } from './MuteButton';

function render(props: { muted: boolean; onToggle: () => void }): ReactElement {
  return MuteButton(props) as ReactElement;
}

describe('MuteButton (Requirement 5.6)', () => {
  it('music is muted by default (parent initial state)', () => {
    // The default state the runtime starts from must be muted.
    expect(INITIAL_MUTED).toBe(true);
  });

  it('reflects the muted state on the element', () => {
    const el = render({ muted: true, onToggle: vi.fn() });
    expect(el.props['data-muted']).toBe(true);
    // aria-pressed tracks "playing": muted → not pressed.
    expect(el.props['aria-pressed']).toBe(false);
    expect(el.props['aria-label']).toBe('Включить музыку');
  });

  it('reflects the unmuted state on the element', () => {
    const el = render({ muted: false, onToggle: vi.fn() });
    expect(el.props['data-muted']).toBe(false);
    expect(el.props['aria-pressed']).toBe(true);
    expect(el.props['aria-label']).toBe('Выключить музыку');
  });

  it('invokes onToggle when clicked', () => {
    const onToggle = vi.fn();
    const el = render({ muted: true, onToggle });
    (el.props.onClick as () => void)();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
