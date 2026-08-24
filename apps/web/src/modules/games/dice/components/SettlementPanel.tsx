import type { DiceRoundResult } from '@games/game-engine/browser';
import { formatCurrency } from '../utils/seatPositions';
import './SettlementPanel.css';

export function SettlementPanel({
  result,
  winnerName,
  currency = 'USD',
}: {
  result: DiceRoundResult;
  winnerName: string;
  currency?: string;
}) {
  const winnerNet = result.outcome === 'WIN' ? result.holderNet : result.opponentNet;

  return (
    <div className="dice-settlement-panel">
      <h3 className="dice-settlement-panel__title">Round Result</h3>
      <p className="dice-settlement-panel__winner">
        Winner: <strong>{winnerName}</strong>
      </p>
      <dl className="dice-settlement-panel__grid">
        <div>
          <dt>Matched Pool</dt>
          <dd>{formatCurrency(result.matchedPool, currency)}</dd>
        </div>
        <div>
          <dt>Platform Fee</dt>
          <dd>{formatCurrency(result.adminFee, currency)}</dd>
        </div>
        <div>
          <dt>Winner Payout</dt>
          <dd>{formatCurrency(result.winnerPayout, currency)}</dd>
        </div>
        <div>
          <dt>Winner Net</dt>
          <dd className={winnerNet >= 0 ? 'dice-settlement-panel__pos' : 'dice-settlement-panel__neg'}>
            {winnerNet >= 0 ? '+' : ''}{formatCurrency(winnerNet, currency)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
