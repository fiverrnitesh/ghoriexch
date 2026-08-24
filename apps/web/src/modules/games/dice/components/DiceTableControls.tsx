import { useState } from 'react';
import { DiceControls } from './DiceControls';
import { formatChoiceLabel } from '../utils/choiceLabels';
import './DiceTableControls.css';

export type BackingTarget = {
  userId: string;
  name: string;
  choice: 'ODD' | 'EVEN';
  amount: number;
};

export type IncomingBackingBet = {
  id: string;
  backerName: string;
  amount: number;
  prediction: string;
};

export function DiceTableControls({
  showHolderBetControls,
  canBet,
  betAmount,
  onAmountChange,
  amountOptions,
  minBet,
  maxBet,
  lockedChoice,
  lockedAmount,
  rolling,
  formatAmount,
  onBet,
  onRoll,
  showYourBet,
  backingTarget,
  onClearBackingTarget,
  onBackPlayer,
  incomingBets,
  availableBalance,
  onAcceptSideBet,
  onRejectSideBet,
  isFinalLock,
  isRoller,
  rollingPhase,
}: {
  showHolderBetControls: boolean;
  canBet: boolean;
  betAmount: number;
  onAmountChange: (n: number) => void;
  amountOptions: number[];
  minBet: number;
  maxBet: number;
  lockedChoice?: 'ODD' | 'EVEN' | null;
  lockedAmount?: number | null;
  rolling: boolean;
  formatAmount: (n: number) => string;
  onBet: (choice: 'ODD' | 'EVEN') => void | Promise<void>;
  onRoll?: () => void | Promise<void>;
  showYourBet?: boolean;
  backingTarget?: BackingTarget | null;
  onClearBackingTarget?: () => void;
  onBackPlayer?: (targetUserId: string, prediction: 'WIN' | 'LOSS') => void;
  incomingBets?: IncomingBackingBet[];
  availableBalance?: number;
  onAcceptSideBet?: (sideBetId: string, amount: number) => void;
  onRejectSideBet?: (sideBetId: string) => void;
  isFinalLock?: boolean;
  isRoller?: boolean;
  rollingPhase?: boolean;
}) {
  const [editAmounts, setEditAmounts] = useState<Record<string, string>>({});
  const [backPrediction, setBackPrediction] = useState<'WIN' | 'LOSS'>('WIN');

  const incoming = incomingBets ?? [];
  const showIncoming = incoming.length > 0 && onAcceptSideBet && onRejectSideBet;
  const showBackPopup = !!backingTarget && !!onBackPlayer;

  const holderHud = showHolderBetControls ? (
    <DiceControls
      variant="table"
      betAmount={betAmount}
      onAmountChange={onAmountChange}
      amountOptions={amountOptions}
      minBet={minBet}
      maxBet={maxBet}
      canBet={canBet}
      canRoll={false}
      lockedChoice={lockedChoice}
      lockedAmount={lockedAmount}
      rolling={rolling}
      formatAmount={formatAmount}
      onBet={onBet}
    />
  ) : null;

  const rollHud = isFinalLock && isRoller && onRoll ? (
    <button
      type="button"
      className="dice-hud-btn dice-hud-btn--roll"
      disabled={rolling}
      onClick={() => void onRoll()}
    >
      {rolling ? 'ROLLING…' : 'ROLL DICE'}
    </button>
  ) : null;

  const yourBetHud = showYourBet && lockedAmount != null && lockedChoice ? (
    <div className="dice-dock-note">
      <span>YOUR BET</span>
      <strong>{formatAmount(lockedAmount)} · {formatChoiceLabel(lockedChoice)}</strong>
    </div>
  ) : null;

  const incomingCards = showIncoming ? (
    <div className="dice-dock-cards" aria-label="Backing bets">
      <p className="dice-dock-cards__title">BACKING BET</p>
      {incoming.map((bet) => {
        const available = Math.max(0, availableBalance ?? 0);
        const typed = parseFloat(editAmounts[bet.id] ?? '');
        const requested = Number.isFinite(typed) && typed > 0 ? typed : bet.amount;
        const acceptAmount = Math.min(requested, available, bet.amount);
        const partial = acceptAmount < bet.amount && acceptAmount > 0;
        return (
          <div key={bet.id} className="dice-dock-card">
            <p className="dice-dock-card__name">{bet.backerName}</p>
            <p className="dice-dock-card__amt">{formatAmount(bet.amount)}</p>
            {partial ? <p className="dice-dock-card__hint">Available {formatAmount(available)}</p> : null}
            <label className="dice-dock-card__edit">
              EDIT AMOUNT
              <input
                type="number"
                min={1}
                max={bet.amount}
                value={editAmounts[bet.id] ?? ''}
                placeholder={String(bet.amount)}
                onChange={(e) => setEditAmounts((prev) => ({ ...prev, [bet.id]: e.target.value }))}
              />
            </label>
            <div className="dice-dock-card__actions">
              {acceptAmount > 0 ? (
                <button
                  type="button"
                  className="dice-dock-card__accept"
                  onClick={() => onAcceptSideBet(bet.id, acceptAmount)}
                >
                  ACCEPT {formatAmount(acceptAmount)}
                </button>
              ) : null}
              <button
                type="button"
                className="dice-dock-card__reject"
                onClick={() => onRejectSideBet(bet.id)}
              >
                REJECT
              </button>
            </div>
          </div>
        );
      })}
    </div>
  ) : null;

  const backPopup = showBackPopup && backingTarget ? (
    <div className="dice-dock-cards dice-dock-cards--back" role="dialog" aria-label="Back player">
      <p className="dice-dock-cards__title">BACK PLAYER</p>
      <p className="dice-dock-card__name">{backingTarget.name}</p>
      <div className="dice-dock-card__choices">
        <button
          type="button"
          className={`dice-dock-choice ${backPrediction === 'WIN' ? 'dice-dock-choice--active' : ''}`}
          onClick={() => setBackPrediction('WIN')}
        >
          WIN
        </button>
        <button
          type="button"
          className={`dice-dock-choice ${backPrediction === 'LOSS' ? 'dice-dock-choice--active' : ''}`}
          onClick={() => setBackPrediction('LOSS')}
        >
          PAO
        </button>
      </div>
      <div className="dice-dock-card__amount-row">
        <span>AMOUNT</span>
        <strong>{formatAmount(betAmount)}</strong>
      </div>
      <div className="dice-amount-popup__chips">
        {amountOptions.slice(0, 6).map((amt) => (
          <button
            key={amt}
            type="button"
            className={`dice-amount-popup__chip ${betAmount === amt ? 'dice-amount-popup__chip--active' : ''}`}
            onClick={() => onAmountChange(Math.min(maxBet, Math.max(minBet, amt)))}
          >
            {formatAmount(amt)}
          </button>
        ))}
      </div>
      <div className="dice-dock-card__actions">
        <button
          type="button"
          className="dice-dock-card__accept"
          onClick={() => {
            onBackPlayer(backingTarget.userId, backPrediction);
            onClearBackingTarget?.();
            setBackPrediction('WIN');
          }}
        >
          SEND BET
        </button>
        <button type="button" className="dice-dock-card__reject" onClick={onClearBackingTarget}>
          CLOSE
        </button>
      </div>
    </div>
  ) : null;

  const hasRight = holderHud || rollHud || yourBetHud;
  const hasLeft = incomingCards || backPopup;
  if (!hasRight && !hasLeft && !rollingPhase && !rolling) return null;

  return (
    <div className="dice-table-controls">
      <div className="dice-table-controls__left">
        {incomingCards}
        {backPopup}
      </div>
      <div className="dice-table-controls__right">
        {holderHud}
        {rollHud}
        {yourBetHud}
      </div>
    </div>
  );
}
