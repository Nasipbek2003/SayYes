'use client';

/**
 * Background-music mute/unmute control (task 7.2, Requirement 5.6).
 *
 * Background music is OFF by default (messengers block autoplay), so this
 * control lets the guest opt in. It is purely presentational: the parent
 * runtime owns the `muted` state (initialised to {@link INITIAL_MUTED} = muted)
 * and toggles it. Actual audio playback wiring is deferred to the premium music
 * feature; here we only expose an accessible, always-available toggle so the
 * default-muted invariant is visible and testable.
 */
export interface MuteButtonProps {
  /** Whether background music is currently muted. */
  muted: boolean;
  /** Toggle the muted state. */
  onToggle: () => void;
}

/** Accessible mute/unmute toggle, fixed to the corner of the screen. */
export function MuteButton({ muted, onToggle }: MuteButtonProps) {
  return (
    <button
      type="button"
      className="mute-button"
      data-muted={muted}
      aria-pressed={!muted}
      aria-label={muted ? 'Включить музыку' : 'Выключить музыку'}
      title={muted ? 'Включить музыку' : 'Выключить музыку'}
      onClick={onToggle}
    >
      <span aria-hidden>{muted ? '🔇' : '🔊'}</span>
    </button>
  );
}
