import type { DiceGameState } from '@games/game-engine/browser';
import { DiceCountdownTimer } from './DiceCountdownTimer';
import { SettlementPanel } from './SettlementPanel';
import { getDisplayPhase, getOccupantDisplayName, getPhaseBadgeLabel } from '../utils/phaseLabels';
import { formatCurrency } from '../utils/seatPositions';
import { shouldShowTurnCountdown } from '../utils/turnCountdown';
import type { DiceSettlementDisplay, DiceStatusBanner } from '../hooks/useDiceGame';
import type { PhaseTimerKind } from '../utils/diceUiHelpers';
import './GameInfoPanel.css';

function phaseTimerLabel(kind: PhaseTimerKind | null | undefined): string {
  if (kind === 'OPPONENT_MATCH') return 'Opponent Match';
  if (kind === 'FINAL_LOCK') return 'Roll Window';
  if (kind === 'INTER_ROUND_PAUSE') return 'Next Round';
  return 'Phase Timer';
}

export function GameInfoPanel({
  state,
  phaseTimerSeconds,
  phaseTimerKind,
  turnTimerSeconds,
  isHolder,
  isSpectator,
  isOpponent,
  playerMeta,
  pendingSideBetCount,
  settlementDisplay,
  statusBanner,
  onReviewSideBet,
  currency = 'PKR',
}: {
  state: DiceGameState;
  phaseTimerSeconds?: number;
  phaseTimerKind?: PhaseTimerKind | null;
  turnTimerSeconds?: number;
  isHolder: boolean;
  isSpectator: boolean;
  isOpponent: boolean;
  playerMeta: Record<string, { displayName: string }>;
  pendingSideBetCount: number;
  settlementDisplay?: DiceSettlementDisplay | null;
  statusBanner?: DiceStatusBanner | null;
  onReviewSideBet?: () => void;
  currency?: string;
}) {
  const match = state.activeMatch;
  const holderSeat = match ? state.seats.find((s) => s.seatIndex === match.holderSeatIndex) : null;
  const oppSeat = match ? state.seats.find((s) => s.seatIndex === match.opponentSeatIndex) : null;
  const holderName = getOccupantDisplayName(holderSeat, playerMeta);
  const oppName = getOccupantDisplayName(oppSeat, playerMeta);
  const displayPhase = getDisplayPhase(state, phaseTimerSeconds);
  const phaseBadge = getPhaseBadgeLabel(displayPhase);
  const peerBetOpen = state.phase === 'BETTING';
  const showTurnCountdown = shouldShowTurnCountdown(state);
  const turnLabel = isHolder ? 'YOUR TURN' : `${holderName.toUpperCase()}'S TURN`;

  const occupied = state.seats.filter((s) => s.occupant);
  const activeCount = match ? 2 : 0;
  const spectatingCount = Math.max(0, occupied.length - activeCount);

  const winnerName = settlementDisplay?.winnerSeatIndex != null
    ? getOccupantDisplayName(
        state.seats.find((s) => s.seatIndex === settlementDisplay.winnerSeatIndex) ?? null,
        playerMeta,
      )
    : '—';

  return (
    <aside className="dice-info-panel">
      <div className="dice-info-panel__header">
        <h2 className="dice-info-panel__title">Table Info</h2>
        <span className="dice-info-panel__round">Round {state.roundNumber || '—'}</span>
      </div>

      {statusBanner && (
        <div className={`dice-info-panel__banner dice-info-panel__banner--${statusBanner.type.toLowerCase()}`}>
          {statusBanner.message}
        </div>
      )}

      <section className="dice-info-panel__section">
        <h3>Game Phase</h3>
        <span className="dice-info-panel__phase">{phaseBadge}</span>
      </section>

      {match && (
        <section className="dice-info-panel__section">
          <h3>Dice Holder</h3>
          <div className="dice-info-panel__holder">
            <strong>{holderName.toUpperCase()}</strong>
            {state.mainBet?.choice && (
              <span className="dice-info-panel__holder-choice">
                {formatCurrency(state.mainBet.amount, currency)} · {state.mainBet.choice}
              </span>
            )}
          </div>
        </section>
      )}

      {match ? (
        <section className="dice-info-panel__section">
          <h3>Current Match</h3>
          <div className="dice-info-panel__match-card">
            <div>
              <span className="dice-info-panel__role-tag">Holder</span>
              <div className="dice-info-panel__match-name">{holderName.toUpperCase()}</div>
            </div>
            <div className="dice-info-panel__match-vs">VS</div>
            <div>
              <span className="dice-info-panel__role-tag">Opponent</span>
              <div className="dice-info-panel__match-name">{oppName.toUpperCase()}</div>
            </div>
          </div>
        </section>
      ) : (
        <section className="dice-info-panel__section">
          <p className="dice-info-panel__waiting">Waiting for players…</p>
        </section>
      )}

      {showTurnCountdown && turnTimerSeconds !== undefined && (
        <section className="dice-info-panel__section dice-info-panel__section--timer">
          <h3>Player Turn</h3>
          <DiceCountdownTimer
            seconds={turnTimerSeconds}
            label={turnLabel}
            maxSeconds={state.config.turnTimeoutSeconds}
            format="mmss"
          />
        </section>
      )}

      {phaseTimerKind && phaseTimerSeconds !== undefined && !showTurnCountdown && (
        <section className="dice-info-panel__section dice-info-panel__section--timer">
          <h3>{phaseTimerLabel(phaseTimerKind)}</h3>
          <DiceCountdownTimer
            seconds={phaseTimerSeconds}
            label={phaseTimerKind === 'FINAL_LOCK' ? 'ROLLING IN' : phaseTimerLabel(phaseTimerKind).toUpperCase()}
            maxSeconds={phaseTimerKind === 'FINAL_LOCK' ? state.config.finalLockSeconds : state.config.sideBetWindowSeconds}
            format={phaseTimerKind === 'FINAL_LOCK' ? 'seconds' : 'mmss'}
          />
        </section>
      )}

      {isSpectator && match && (
        <div className="dice-info-panel__role dice-info-panel__role--spectator">Spectating — Haar/Zeet available during the 30s betting window</div>
      )}
      {isHolder && match && showTurnCountdown && (
        <div className="dice-info-panel__role dice-info-panel__role--active">Place your main bet before the timer expires</div>
      )}
      {isOpponent && match && (state.phase === 'OPPONENT_MATCHING' || state.phase === 'MAIN_BET_PLACED') && (
        <div className="dice-info-panel__role dice-info-panel__role--active">Match the exact stake to continue</div>
      )}

      <section className="dice-info-panel__section">
        <h3>Table Players</h3>
        <div className="dice-info-panel__player-stats">
          <span className="dice-info-panel__player-total">
            {occupied.length} / {state.maxSeats}
          </span>
          <ul className="dice-info-panel__player-legend">
            <li><span className="dice-info-panel__dot dice-info-panel__dot--active" /> {activeCount} Active</li>
            <li><span className="dice-info-panel__dot dice-info-panel__dot--spectator" /> {spectatingCount} Spectating</li>
          </ul>
        </div>
      </section>

      <section className="dice-info-panel__section dice-info-panel__section--limits">
        <div className="dice-info-panel__limit">
          <span>Min Bet</span>
          <strong>{formatCurrency(state.config.minBet, currency)}</strong>
        </div>
        <div className="dice-info-panel__limit">
          <span>Max Bet</span>
          <strong>{formatCurrency(state.config.maxBet, currency)}</strong>
        </div>
      </section>

      {state.mainBet && (
        <p className="dice-info-panel__meta">
          Main bet: {state.mainBet.choice} · {formatCurrency(state.mainBet.amount, currency)}
          {state.mainBet.locked ? ' · locked' : ''}
        </p>
      )}

      {settlementDisplay && (
        <SettlementPanel
          result={settlementDisplay.result}
          winnerName={winnerName}
          currency={currency}
        />
      )}

      {state.sideBets.length > 0 && (
        <section className="dice-info-panel__section">
          <h3>Peer Bets</h3>
          <ul className="dice-info-panel__sidebets">
            {state.sideBets.slice(-4).map((sb) => (
              <li key={sb.id}>
                <span>{sb.prediction}</span>
                <span>{formatCurrency(sb.amount, currency)}</span>
                <span className={`dice-info-panel__sb-status dice-info-panel__sb-status--${sb.status.toLowerCase()}`}>
                  {sb.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(isHolder || isOpponent) && pendingSideBetCount > 0 && onReviewSideBet && peerBetOpen && (
        <button type="button" className="dice-info-panel__review-btn" onClick={onReviewSideBet}>
          Review {pendingSideBetCount} peer bet request{pendingSideBetCount > 1 ? 's' : ''}
        </button>
      )}
    </aside>
  );
}
