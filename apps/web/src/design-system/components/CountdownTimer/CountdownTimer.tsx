import { useEffect, useState } from 'react';
import './CountdownTimer.css';

export interface CountdownTimerProps {
  /** Target timestamp (ms) or duration in seconds from mount */
  targetTime?: number;
  durationSeconds?: number;
  label?: string;
  onComplete?: () => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'urgent' | 'gold';
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function CountdownTimer({
  targetTime,
  durationSeconds,
  label,
  onComplete,
  size = 'md',
  variant = 'default',
}: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(() => {
    if (targetTime) return Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
    return durationSeconds ?? 0;
  });

  useEffect(() => {
    if (remaining <= 0) {
      onComplete?.();
      return;
    }

    const id = setInterval(() => {
      setRemaining((prev) => {
        const next = targetTime
          ? Math.max(0, Math.ceil((targetTime - Date.now()) / 1000))
          : prev - 1;
        if (next <= 0) onComplete?.();
        return next;
      });
    }, 250);

    return () => clearInterval(id);
  }, [targetTime, remaining, onComplete]);

  const urgent = remaining <= 10 && remaining > 0;

  return (
    <div
      className={[
        'ds-countdown',
        `ds-countdown--${size}`,
        `ds-countdown--${variant}`,
        urgent ? 'ds-countdown--urgent' : '',
      ].filter(Boolean).join(' ')}
      role="timer"
      aria-live="polite"
      aria-label={label ?? 'Countdown timer'}
    >
      {label && <span className="ds-countdown__label">{label}</span>}
      <span className="ds-countdown__time">{formatTime(remaining)}</span>
    </div>
  );
}
