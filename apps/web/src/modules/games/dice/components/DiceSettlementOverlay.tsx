import { useEffect, useState } from 'react';
import type { DiceRoundResult } from '@games/game-engine/browser';
import { formatCurrency } from '../utils/seatPositions';
import { soundService } from '../services/sound.service';
import './DiceSettlementOverlay.css';

const SHOW_MS = 2200;
const FADE_MS = 500;

export function DiceSettlementOverlay({
  result,
  winnerName,
  currency = 'USD',
  personalOutcome,
  roundId,
}: {
  result: DiceRoundResult;
  winnerName: string;
  currency?: string;
  personalOutcome?: 'WON' | 'LOST' | null;
  roundId?: string;
}) {
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [gone, setGone] = useState(false);

  useEffect(() => {
    setPhase('in');
    setGone(false);
    if (personalOutcome === 'WON') soundService.play('win');
    else if (personalOutcome === 'LOST') soundService.play('loss');
    else soundService.play(result.outcome === 'WIN' ? 'win' : 'loss');
    const fade = window.setTimeout(() => setPhase('out'), SHOW_MS);
    const hide = window.setTimeout(() => setGone(true), SHOW_MS + FADE_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(hide);
    };
  }, [roundId, result.outcome, winnerName, personalOutcome]);

  if (gone || result.outcome === 'NO_RESULT') return null;

  const youWon = personalOutcome === 'WON';
  const youLost = personalOutcome === 'LOST';
  const headline = youWon ? 'YOU WON' : youLost ? 'ROUND LOST' : 'WINNER';

  return (
    <div
      className={[
        'dice-settlement-overlay',
        `dice-settlement-overlay--${phase}`,
        youWon && 'dice-settlement-overlay--won',
        youLost && 'dice-settlement-overlay--lost',
      ].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
    >
      <div className="dice-settlement-overlay__burst" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className={`dice-settlement-overlay__spark dice-settlement-overlay__spark--${i}`} />
        ))}
      </div>
      <div className="dice-settlement-overlay__ribbon">
        <span className="dice-settlement-overlay__label">{headline}</span>
        <strong className="dice-settlement-overlay__winner">{winnerName.toUpperCase()}</strong>
        <p className="dice-settlement-overlay__result">
          {result.outcome}
          {result.die1 != null && result.die2 != null ? ` · ${result.die1} + ${result.die2}` : ''}
          {result.parity ? ` · ${result.parity}` : ''}
        </p>
        {youWon ? (
          <p className="dice-settlement-overlay__personal dice-settlement-overlay__personal--won">
            +{formatCurrency(result.winnerPayout, currency)}
          </p>
        ) : youLost ? (
          <p className="dice-settlement-overlay__personal dice-settlement-overlay__personal--lost">
            Next round incoming
          </p>
        ) : (
          <p className="dice-settlement-overlay__meta">
            Payout {formatCurrency(result.winnerPayout, currency)}
          </p>
        )}
      </div>
    </div>
  );
}
