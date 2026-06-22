'use client';

/**
 * Countdown — live countdown to the event date (task 7.3, Template 3 /
 * Requirement 8.1).
 *
 * Renders the time remaining until `{{дата}}` and ticks every second on the
 * client. All the maths lives in the pure {@link countdown} module
 * ({@link computeRemaining} / {@link formatRemaining}); this component only owns
 * the interval and re-render. When the target time passes it shows a "started"
 * label instead of negative numbers.
 */
import { useEffect, useState } from 'react';

import { type Remaining, computeRemaining } from './countdownMath';

export interface CountdownProps {
  /** Target event date (ISO string, epoch ms, or Date). */
  target: Date | string | number;
  /** Label shown once the event time has arrived. */
  startedLabel?: string;
}

/** Short labels for each unit (Russian, matching the rest of the UI). */
const UNIT_LABELS: { key: keyof Pick<Remaining, 'days' | 'hours' | 'minutes' | 'seconds'>; label: string }[] = [
  { key: 'days', label: 'дн' },
  { key: 'hours', label: 'ч' },
  { key: 'minutes', label: 'мин' },
  { key: 'seconds', label: 'сек' },
];

/** Live countdown to the event date (Requirement 8.1). */
export function Countdown({ target, startedLabel = 'Уже началось!' }: CountdownProps) {
  const [remaining, setRemaining] = useState<Remaining>(() => computeRemaining(target));

  useEffect(() => {
    // Re-sync immediately (target may have changed) then tick every second.
    setRemaining(computeRemaining(target));
    const timer = setInterval(() => setRemaining(computeRemaining(target)), 1000);
    return () => clearInterval(timer);
  }, [target]);

  if (remaining.isPast) {
    return (
      <div className="countdown countdown--past" role="timer" aria-live="polite">
        {startedLabel}
      </div>
    );
  }

  return (
    <div className="countdown" role="timer" aria-live="polite">
      {UNIT_LABELS.map(({ key, label }) => (
        <span key={key} className="countdown__unit">
          <span className="countdown__value">{remaining[key]}</span>
          <span className="countdown__label">{label}</span>
        </span>
      ))}
    </div>
  );
}
