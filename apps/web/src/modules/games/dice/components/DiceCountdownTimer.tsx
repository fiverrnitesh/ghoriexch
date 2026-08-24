import type { CSSProperties } from 'react';
import { formatTurnCountdown } from '../utils/turnCountdown';
import './DiceCountdownTimer.css';

export function DiceCountdownTimer({
  seconds,
  label = 'BETTING',
  closed = false,
  maxSeconds = 10,
  format = 'seconds',
  size = 'default',
}: {
  seconds?: number;
  label?: string;
  closed?: boolean;
  /** Total duration for progress ring (10 side bet, 60 player turn). */
  maxSeconds?: number;
  format?: 'seconds' | 'mmss';
  size?: 'default' | 'table';
}) {
  if (seconds === undefined && !closed) return null;

  const display = closed ? 0 : Math.max(0, seconds ?? 0);
  const isClosed = closed || display <= 0;
  const progress = isClosed ? 0 : Math.min(100, (display / maxSeconds) * 100);
  const valueText = format === 'mmss'
    ? (isClosed ? '—' : formatTurnCountdown(display))
    : (isClosed ? '—' : String(display).padStart(2, '0'));

  return (
    <div
      className={`dice-countdown ${isClosed ? 'dice-countdown--closed' : ''} ${format === 'mmss' ? 'dice-countdown--turn' : ''} ${size === 'table' ? 'dice-countdown--table' : ''}`}
      role="timer"
      aria-live="polite"
    >
      <div className="dice-countdown__ring" style={{ '--progress': `${progress}%` } as CSSProperties}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="dice-countdown__track" cx="50" cy="50" r="42" />
          <circle className="dice-countdown__fill" cx="50" cy="50" r="42" />
        </svg>
        <span className="dice-countdown__value">{valueText}</span>
      </div>
      <span className="dice-countdown__label">
        {isClosed ? (format === 'mmss' ? 'TURN EXPIRED' : 'BETTING CLOSED') : label}
      </span>
    </div>
  );
}
