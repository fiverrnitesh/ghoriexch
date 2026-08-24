import { useEffect, useState, type CSSProperties } from 'react';
import { formatChoiceLabel } from '../utils/choiceLabels';
import './DiceControls.css';

export const CHIP_COLORS = ['#e53935', '#1e88e5', '#43a047', '#8e24aa', '#fb8c00', '#ffd700'];

export function chipPresets(minBet: number, maxBet: number) {
  const presets = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  const chips = presets.filter((n) => n >= minBet && n <= maxBet);
  if (!chips.includes(minBet)) chips.unshift(minBet);
  return chips.slice(0, 6);
}

export function DiceControls({
  betAmount,
  onAmountChange,
  amountOptions,
  minBet = 10,
  maxBet = 5000,
  onBet,
  onRoll,
  canBet,
  canRoll,
  lockedChoice,
  lockedAmount,
  formatAmount = (n) => `$${n}`,
  rolling = false,
  variant = 'bar',
  statusText,
  timerSeconds,
  timerMaxSeconds = 15,
  timerLabel,
}: {
  betAmount: number;
  onAmountChange: (n: number) => void;
  amountOptions: number[];
  minBet?: number;
  maxBet?: number;
  onBet: (choice: 'ODD' | 'EVEN', amount?: number) => void | Promise<void>;
  onRoll?: () => void | Promise<void>;
  canBet: boolean;
  canRoll: boolean;
  lockedChoice?: 'ODD' | 'EVEN' | null;
  lockedAmount?: number | null;
  formatAmount?: (n: number) => string;
  rolling?: boolean;
  variant?: 'bar' | 'table' | 'dock';
  statusText?: string;
  timerSeconds?: number;
  timerMaxSeconds?: number;
  timerLabel?: string;
}) {
  const [pending, setPending] = useState(false);
  const [paoActive, setPaoActive] = useState(false);
  const [amountOpen, setAmountOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const controlsLocked = !!lockedChoice || rolling || canRoll;

  const yourBet = lockedAmount ?? (lockedChoice ? betAmount : 0);
  const lockedIsPao = lockedChoice === 'ODD';
  const showingPao = lockedChoice ? lockedIsPao : paoActive;

  const clampAmount = (n: number) => Math.min(maxBet, Math.max(minBet, n));

  useEffect(() => {
    if (canBet) {
      setPaoActive(false);
      setAmountOpen(true);
      setCustomAmount(String(betAmount));
      setActionError(null);
      return;
    }
    setPaoActive(false);
    setAmountOpen(false);
  }, [canBet]);

  const handleBet = async () => {
    if (!canBet || lockedChoice || rolling) return;
    const parsed = parseFloat(customAmount);
    if (!Number.isFinite(parsed) || parsed < minBet || parsed > maxBet) {
      setActionError(`Enter an amount between ${formatAmount(minBet)} and ${formatAmount(maxBet)}`);
      return;
    }
    const amount = clampAmount(parsed);
    onAmountChange(amount);
    setPending(true);
    setActionError(null);
    try {
      await onBet(paoActive ? 'ODD' : 'EVEN', amount);
      setAmountOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Bet failed');
    } finally {
      setPending(false);
    }
  };

  const handleRoll = async () => {
    if (!canRoll || rolling || !onRoll) return;
    setPending(true);
    setActionError(null);
    try {
      await onRoll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Roll failed');
    } finally {
      setPending(false);
    }
  };

  const stepAmount = (delta: number) => {
    if (controlsLocked) return;
    onAmountChange(clampAmount(betAmount + delta));
  };

  const confirmCustom = () => {
    const parsed = parseFloat(customAmount);
    if (!Number.isFinite(parsed)) return;
    onAmountChange(clampAmount(parsed));
    setAmountOpen(false);
  };

  const amountPopup = amountOpen && !controlsLocked ? (
    <div className="dice-amount-popup" role="dialog" aria-label="Bet amount">
      <p className="dice-amount-popup__title">BET AMOUNT</p>
      <div className="dice-amount-popup__chips">
        {amountOptions.map((amt) => (
          <button
            key={amt}
            type="button"
            className={`dice-amount-popup__chip ${betAmount === amt ? 'dice-amount-popup__chip--active' : ''}`}
            onClick={() => {
              onAmountChange(clampAmount(amt));
              setAmountOpen(false);
            }}
          >
            {formatAmount(amt)}
          </button>
        ))}
      </div>
      <label className="dice-amount-popup__custom">
        <span>CUSTOM</span>
        <input
          type="number"
          min={minBet}
          max={maxBet}
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          placeholder={`${minBet}–${maxBet}`}
        />
      </label>
      <button type="button" className="dice-amount-popup__confirm" onClick={confirmCustom}>
        CONFIRM
      </button>
    </div>
  ) : null;

  if (variant === 'dock') {
    const showTimer = timerSeconds !== undefined;
    const timerClosed = (timerSeconds ?? 0) <= 0;
    const mainLabel = rolling
      ? 'ROLLING…'
      : canRoll
        ? (pending ? 'ROLLING…' : 'ROLL DICE')
        : canBet
          ? 'PLAY'
          : (statusText ?? 'WAITING');
    const mainEnabled = !pending && !rolling && (canBet || canRoll);

    return (
      <div className="dice-controls dice-controls--dock">
        {showTimer ? (
          <div className={`dice-dock-timer ${timerClosed ? 'dice-dock-timer--closed' : ''}`}>
            <span className="dice-dock-timer__label">{timerClosed ? 'CLOSED' : (timerLabel ?? 'TIME')}</span>
            <strong>{String(Math.max(0, timerSeconds ?? 0)).padStart(2, '0')}s</strong>
            <span className="dice-dock-timer__track" aria-hidden="true">
              <span
                className="dice-dock-timer__fill"
                style={{
                  width: `${Math.min(100, ((timerSeconds ?? 0) / Math.max(1, timerMaxSeconds)) * 100)}%`,
                }}
              />
            </span>
          </div>
        ) : null}

        {canBet && amountOpen ? (
          <div className="dice-dock-popup" role="dialog" aria-label="Place bet">
            <p className="dice-dock-popup__title">PLACE YOUR BET</p>

            <label className="dice-dock-popup__amount">
              <span>ENTER AMOUNT</span>
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
                  setActionError(null);
                  const parsed = parseFloat(next);
                  if (Number.isFinite(parsed)) onAmountChange(clampAmount(parsed));
                }}
              />
            </label>

            <button
              type="button"
              className={[
                'dice-dock-pao',
                showingPao && 'dice-dock-pao--on',
              ].filter(Boolean).join(' ')}
              disabled={pending || rolling}
              onClick={() => setPaoActive((v) => !v)}
              aria-pressed={showingPao}
            >
              <span>PAO</span>
              <em>{showingPao ? 'ON — ODD' : 'OFF — EVEN'}</em>
            </button>

            {actionError ? <p className="dice-dock-popup__error">{actionError}</p> : null}

            <button
              type="button"
              className="dice-hud-btn dice-hud-btn--place dice-dock-place"
              disabled={!canBet || pending || rolling}
              onClick={() => void handleBet()}
            >
              {pending ? 'PLACING…' : 'PLACE BET'}
            </button>
          </div>
        ) : actionError ? (
          <p className="dice-dock-popup__error">{actionError}</p>
        ) : null}

        <button
          type="button"
          className={[
            'dice-dock-main',
            canRoll && 'dice-dock-main--roll',
            canBet && amountOpen && 'dice-dock-main--open',
            !mainEnabled && 'dice-dock-main--idle',
          ].filter(Boolean).join(' ')}
          disabled={!mainEnabled}
          aria-expanded={canBet ? amountOpen : undefined}
          onClick={() => {
            if (canRoll) {
              void handleRoll();
              return;
            }
            if (canBet) {
              setActionError(null);
              setAmountOpen((v) => !v);
            }
          }}
        >
          {mainLabel}
        </button>
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className="dice-controls dice-controls--table">
        <div className="dice-controls__hud">
          <button
            type="button"
            className={[
              'dice-hud-btn',
              'dice-hud-btn--pao',
              showingPao && 'dice-hud-btn--selected',
            ].filter(Boolean).join(' ')}
            disabled={!canBet || !!lockedChoice || pending || rolling}
            onClick={() => setPaoActive((v) => !v)}
            aria-pressed={showingPao}
          >
            PAO
          </button>

          <div className="dice-controls__amount-wrap">
            <button
              type="button"
              className="dice-hud-btn dice-hud-btn--amount"
              disabled={controlsLocked}
              onClick={() => setAmountOpen((v) => !v)}
            >
              {formatAmount(betAmount)}
            </button>
            {amountPopup}
          </div>

          <button
            type="button"
            className="dice-hud-btn dice-hud-btn--place"
            disabled={!canBet || !!lockedChoice || pending || rolling}
            onClick={() => void handleBet()}
          >
            {pending ? 'PLACING…' : 'PLACE BET'}
          </button>

          {onRoll && canRoll && (
            <button
              type="button"
              className="dice-hud-btn dice-hud-btn--roll"
              disabled={!canRoll || rolling}
              onClick={() => void onRoll()}
            >
              {rolling ? 'ROLLING…' : 'ROLL DICE'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dice-controls">
      <div className="dice-controls__bar">
        <div className="dice-controls__your-bet">
          <span className="dice-controls__label">Your Bet</span>
          <span className="dice-controls__your-bet-amount">{formatAmount(yourBet)}</span>
          {lockedChoice && (
            <span className="dice-controls__your-bet-choice">{formatChoiceLabel(lockedChoice)}</span>
          )}
        </div>

        <div className="dice-controls__choice-block">
          <span className="dice-controls__label">Choice</span>
          <div className={`dice-controls__default ${!showingPao ? 'dice-controls__default--active' : ''}`}>
            EVEN — DEFAULT
          </div>
          <button
            type="button"
            className={[
              'dice-controls__pao',
              showingPao && 'dice-controls__pao--selected',
              lockedIsPao && 'dice-controls__pao--locked',
            ].filter(Boolean).join(' ')}
            disabled={!canBet || !!lockedChoice || pending || rolling}
            onClick={() => setPaoActive((v) => !v)}
            aria-pressed={showingPao}
          >
            <span className="dice-controls__choice-label">PAO</span>
            {showingPao && <span className="dice-controls__choice-mult">PAO = ODD</span>}
          </button>
        </div>

        <div className="dice-controls__amount-stepper">
          <span className="dice-controls__label">Bet Amount</span>
          <div className="dice-controls__stepper">
            <button
              type="button"
              className="dice-controls__step-btn"
              disabled={controlsLocked}
              onClick={() => stepAmount(-10)}
              aria-label="Decrease bet"
            >
              −
            </button>
            <span className="dice-controls__step-value">{formatAmount(betAmount)}</span>
            <button
              type="button"
              className="dice-controls__step-btn"
              disabled={controlsLocked}
              onClick={() => stepAmount(10)}
              aria-label="Increase bet"
            >
              +
            </button>
          </div>
        </div>

        <div className="dice-controls__chips-row">
          <span className="dice-controls__label">Chips</span>
          <div className="dice-controls__chips">
            {amountOptions.map((amt, i) => (
              <button
                key={amt}
                type="button"
                className={`dice-controls__chip ${betAmount === amt ? 'dice-controls__chip--active' : ''}`}
                style={{ '--chip-color': CHIP_COLORS[i % CHIP_COLORS.length] } as CSSProperties}
                onClick={() => !controlsLocked && onAmountChange(clampAmount(amt))}
                disabled={controlsLocked}
                title={formatAmount(amt)}
              >
                <span className="dice-controls__chip-inner">
                  {amt >= 1000 ? `$${amt / 1000}K` : formatAmount(amt)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="dice-controls__place-bet"
          disabled={!canBet || !!lockedChoice || pending || rolling}
          onClick={() => void handleBet()}
        >
          {pending ? 'Placing…' : 'Place Bet'}
        </button>

        {onRoll && canRoll && (
          <button
            type="button"
            className="dice-controls__roll"
            disabled={!canRoll || rolling}
            onClick={() => void onRoll()}
          >
            {rolling ? 'Rolling…' : 'Roll Dice'}
          </button>
        )}
      </div>
    </div>
  );
}
