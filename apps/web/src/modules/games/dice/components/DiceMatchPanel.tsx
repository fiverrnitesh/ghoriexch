import { useEffect, useState } from 'react';
import type { DiceGameState } from '@games/game-engine/browser';
import { formatChoiceLabel } from '../utils/choiceLabels';
import { getOccupantDisplayName } from '../utils/phaseLabels';
import {
  isBettingPhase,
  isRollReadyPhase,
  isSideBettingPhase,
  resolveOccupantKey,
} from '../utils/diceUiHelpers';
import './DiceMatchPanel.css';

function playerName(
  userId: string,
  state: DiceGameState,
  playerMeta: Record<string, { displayName: string }>,
): string {
  if (playerMeta[userId]?.displayName) return playerMeta[userId].displayName;
  const seat = state.seats.find((s) => {
    const occ = s.occupant;
    if (!occ) return false;
    if (occ.type === 'USER' && occ.userId === userId) return true;
    if (occ.type === 'BOT' && (occ.botId === userId || `player_${occ.botId}` === userId)) return true;
    return false;
  });
  if (seat?.occupant) return getOccupantDisplayName(seat, playerMeta);
  if (userId === 'player_tiger' || userId === 'tiger') return 'Shoot';
  return userId.slice(0, 8);
}

function phaseLabel(state: DiceGameState): string {
  if (isBettingPhase(state)) return 'BETTING';
  if (isSideBettingPhase(state)) return 'PEER BETS';
  if (isRollReadyPhase(state)) return 'ROLL';
  if (state.phase === 'DICE_ROLLING') return 'ROLLING';
  if (state.phase === 'RESULT' || state.phase === 'SETTLEMENT') return 'RESULT';
  return String(state.phase).replace(/_/g, ' ');
}

export function DiceMatchPanel({
  state,
  playerMeta,
  userId,
  formatAmount,
  availableBalance,
  timerSeconds,
  timerMaxSeconds,
  canBet,
  canRoll,
  canSideBet,
  rolling = false,
  betAmount,
  onAmountChange,
  minBet,
  maxBet,
  onPlaceMainBet,
  onRoll,
  visibleSeatIndexes,
  onSideBet,
  onAccept,
  onReject,
}: {
  state: DiceGameState;
  playerMeta: Record<string, { displayName: string }>;
  userId?: string;
  formatAmount: (n: number) => string;
  availableBalance: number;
  timerSeconds?: number;
  timerMaxSeconds?: number;
  canBet: boolean;
  canRoll: boolean;
  canSideBet: boolean;
  rolling?: boolean;
  betAmount: number;
  onAmountChange: (n: number) => void;
  minBet: number;
  maxBet: number;
  onPlaceMainBet: (amount: number, choice: 'ODD' | 'EVEN') => void | Promise<void>;
  onRoll: () => void | Promise<void>;
  visibleSeatIndexes?: Set<number>;
  onSideBet: (targetUserId: string, name: string) => void;
  onAccept: (sideBetId: string, amount?: number) => void | Promise<void>;
  onReject: (sideBetId: string) => void | Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [paoActive, setPaoActive] = useState(false);
  const [customAmount, setCustomAmount] = useState(String(betAmount));
  const [error, setError] = useState<string | null>(null);

  const match = state.activeMatch;
  const holderSeat = match ? state.seats.find((s) => s.seatIndex === match.holderSeatIndex) : null;
  const oppSeat = match ? state.seats.find((s) => s.seatIndex === match.opponentSeatIndex) : null;

  // If the match points to seats not rendered on the visual table, show a warning
  const holderVisible = !visibleSeatIndexes || !match || visibleSeatIndexes.has(match.holderSeatIndex);
  const oppVisible = !visibleSeatIndexes || !match || visibleSeatIndexes.has(match.opponentSeatIndex);
  const matchDesync = match && (!holderVisible || !oppVisible);

  const holderName = holderVisible ? getOccupantDisplayName(holderSeat, playerMeta) : '(not on table)';
  const oppName = oppVisible ? getOccupantDisplayName(oppSeat, playerMeta) : '(not on table)';
  const holderKey = holderVisible ? resolveOccupantKey(holderSeat?.occupant ?? null) : null;
  const oppKey = oppVisible ? resolveOccupantKey(oppSeat?.occupant ?? null) : null;
  const phase = phaseLabel(state);
  const showTimer = timerSeconds != null && timerSeconds >= 0 && !!match;
  const timerPct = showTimer && timerMaxSeconds
    ? Math.min(100, (Math.max(0, timerSeconds ?? 0) / Math.max(1, timerMaxSeconds)) * 100)
    : 0;

  const canRespond = !!userId && (isSideBettingPhase(state) || (isBettingPhase(state) && !!state.mainBet));
  const clampAmount = (n: number) => Math.min(maxBet, Math.max(minBet, n));

  useEffect(() => {
    if (canBet) {
      setPaoActive(false);
      setCustomAmount(String(betAmount));
      setError(null);
    }
  }, [canBet]);

  const handlePlaceBet = async () => {
    if (!canBet || rolling) return;
    const parsed = parseFloat(customAmount);
    if (!Number.isFinite(parsed) || parsed < minBet || parsed > maxBet) {
      setError(`Enter ${formatAmount(minBet)}–${formatAmount(maxBet)}`);
      return;
    }
    const amount = clampAmount(parsed);
    onAmountChange(amount);
    setPending(true);
    setError(null);
    try {
      await onPlaceMainBet(amount, paoActive ? 'ODD' : 'EVEN');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bet failed');
    } finally {
      setPending(false);
    }
  };

  const handleRoll = async () => {
    if (!canRoll || rolling) return;
    setPending(true);
    setError(null);
    try {
      await onRoll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Roll failed');
    } finally {
      setPending(false);
    }
  };

  const handleAccept = async (id: string, requested: number) => {
    const cap = Math.min(requested, Math.max(0, availableBalance));
    if (cap <= 0) {
      setError('Insufficient balance to accept');
      return;
    }
    setError(null);
    setBusyId(id);
    try {
      await onAccept(id, cap < requested ? cap : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Accept failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    setError(null);
    setBusyId(id);
    try {
      await onReject(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setBusyId(null);
    }
  };

  const mainBet = state.mainBet;
  const holderBetLabel = mainBet
    ? `${formatAmount(mainBet.amount)} · ${formatChoiceLabel(mainBet.choice)}`
    : 'Waiting for bet';
  const opponentBetLabel = mainBet?.locked
    ? `${formatAmount(mainBet.opponentStake ?? mainBet.amount)} matched`
    : mainBet
      ? 'Matching…'
      : '—';

  const showCarpetActions = canBet || canRoll || canSideBet;

  return (
    <div className="dice-match-rail">
      <aside className="dice-match-panel" aria-label="Match info">
        <header className="dice-match-panel__header">
          <p className="dice-match-panel__kicker">CURRENT MATCH</p>
          {match ? (
            <h2 className="dice-match-panel__vs">
              <span>{holderName}</span>
              <em>VS</em>
              <span>{oppName}</span>
            </h2>
          ) : (
            <h2 className="dice-match-panel__vs dice-match-panel__vs--idle">Waiting for match</h2>
          )}
          <div className="dice-match-panel__phase">
            <strong>{phase}</strong>
            {showTimer ? <span>{String(Math.max(0, timerSeconds ?? 0)).padStart(2, '0')}s</span> : null}
          </div>
          {showTimer ? (
            <span className="dice-match-panel__track" aria-hidden="true">
              <span className="dice-match-panel__fill" style={{ width: `${timerPct}%` }} />
            </span>
          ) : null}
          {matchDesync ? (
            <p className="dice-match-panel__desync">Match players not on visual table — Force Start Round to fix</p>
          ) : null}
        </header>

        {match ? (
          <section className="dice-match-panel__section">
            <h3>Active players</h3>
            <div className="dice-match-panel__player">
              <div className="dice-match-panel__player-head">
                <strong>{holderName}</strong>
                <span className="dice-match-panel__badge">HOLDER</span>
              </div>
              <p className="dice-match-panel__player-state">{holderBetLabel}</p>
            </div>
            <div className="dice-match-panel__player">
              <div className="dice-match-panel__player-head">
                <strong>{oppName}</strong>
                <span className="dice-match-panel__badge dice-match-panel__badge--opp">OPPONENT</span>
              </div>
              <p className="dice-match-panel__player-state">{opponentBetLabel}</p>
            </div>
          </section>
        ) : null}

        <section className="dice-match-panel__section">
          <h3>Peer bets (Haar / Zeet)</h3>
          {state.sideBets.length === 0 ? (
            <p className="dice-match-panel__empty">None this round</p>
          ) : (
            <ul className="dice-match-panel__list">
              {state.sideBets.map((sb) => {
                const isTarget = canRespond && sb.status === 'PENDING' && sb.targetUserId === userId;
                const busy = busyId === sb.id;
                return (
                  <li key={sb.id} className="dice-match-panel__row">
                    <p className="dice-match-panel__names">
                      <strong>{playerName(sb.backerUserId, state, playerMeta)}</strong>
                      <span>→ {playerName(sb.counterpartyUserId ?? sb.targetUserId ?? '', state, playerMeta)}</span>
                    </p>
                    <p className="dice-match-panel__meta">
                      <span>{formatAmount(sb.amount)}</span>
                      <span>{sb.prediction}</span>
                      <span className={`dice-match-panel__status dice-match-panel__status--${sb.status.toLowerCase()}`}>
                        {sb.status}
                      </span>
                    </p>
                    {isTarget ? (
                      <div className="dice-match-panel__actions">
                        <button
                          type="button"
                          className="dice-match-panel__accept"
                          disabled={busy || Math.min(sb.amount, availableBalance) <= 0}
                          onClick={() => void handleAccept(sb.id, sb.amount)}
                        >
                          {busy ? '…' : 'ACCEPT'}
                        </button>
                        <button
                          type="button"
                          className="dice-match-panel__reject"
                          disabled={busy}
                          onClick={() => void handleReject(sb.id)}
                        >
                          REJECT
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        {error ? <p className="dice-match-panel__error">{error}</p> : null}
      </aside>

      {showCarpetActions ? (
        <div className="dice-match-rail__actions">
          {canBet ? (
            <>
              <label className="dice-match-rail__amount">
                <span>AMOUNT</span>
                <input
                  type="number"
                  min={minBet}
                  max={maxBet}
                  inputMode="decimal"
                  value={customAmount}
                  placeholder={`${minBet}–${maxBet}`}
                  onChange={(e) => {
                    const next = e.target.value;
                    setCustomAmount(next);
                    setError(null);
                    const parsed = parseFloat(next);
                    if (Number.isFinite(parsed)) onAmountChange(clampAmount(parsed));
                  }}
                />
              </label>
              <button
                type="button"
                className={['dice-match-rail__pao', paoActive && 'dice-match-rail__pao--on'].filter(Boolean).join(' ')}
                disabled={pending || rolling}
                onClick={() => setPaoActive((v) => !v)}
                aria-pressed={paoActive}
              >
                <span>PAO</span>
                <em>{paoActive ? 'ON — ODD' : 'OFF — EVEN'}</em>
              </button>
              <button
                type="button"
                className="dice-match-rail__btn dice-match-rail__btn--roll"
                disabled={pending || rolling}
                onClick={() => void handlePlaceBet()}
              >
                {pending ? 'PLACING…' : 'PLACE BET'}
              </button>
            </>
          ) : null}

          {canSideBet && holderKey ? (
            <button
              type="button"
              className="dice-match-rail__btn dice-match-rail__btn--roll"
              onClick={() => onSideBet(holderKey, holderName)}
            >
              Bet on {holderName}
            </button>
          ) : null}
          {canSideBet && oppKey ? (
            <button
              type="button"
              className="dice-match-rail__btn dice-match-rail__btn--roll"
              onClick={() => onSideBet(oppKey, oppName)}
            >
              Bet on {oppName}
            </button>
          ) : null}

          {canRoll ? (
            <button
              type="button"
              className="dice-match-rail__btn dice-match-rail__btn--roll"
              disabled={pending || rolling}
              onClick={() => void handleRoll()}
            >
              {pending || rolling ? 'ROLLING…' : 'ROLL DICE'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
