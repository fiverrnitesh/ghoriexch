import type { ReactNode } from 'react';
import { GoldButton, SecondaryButton } from '../Button/Button';
import './BettingPanel.css';

export interface BetOption {
  id: string;
  label: string;
  odds?: string;
  disabled?: boolean;
}

export interface BettingPanelProps {
  title?: string;
  balance?: string;
  selectedAmount?: number;
  amountOptions?: number[];
  onAmountChange?: (amount: number) => void;
  betOptions?: BetOption[];
  onBet?: (optionId: string) => void;
  onClear?: () => void;
  footer?: ReactNode;
  disabled?: boolean;
}

export function BettingPanel({
  title = 'Place Bet',
  balance,
  selectedAmount,
  amountOptions = [10, 25, 50, 100, 250],
  onAmountChange,
  betOptions = [],
  onBet,
  onClear,
  footer,
  disabled,
}: BettingPanelProps) {
  return (
    <aside className="ds-betting-panel ds-panel ds-panel--chrome">
      <div className="ds-panel__header">
        <h3 className="ds-panel__title">{title}</h3>
        {balance && <span className="ds-betting-panel__balance">{balance}</span>}
      </div>
      <div className="ds-panel__body">
        <div className="ds-betting-panel__amounts">
          <span className="ds-betting-panel__section-label">Stake</span>
          <div className="ds-betting-panel__chips">
            {amountOptions.map((amt) => (
              <button
                key={amt}
                type="button"
                className={`ds-betting-chip ${selectedAmount === amt ? 'ds-betting-chip--active' : ''}`}
                onClick={() => onAmountChange?.(amt)}
                disabled={disabled}
              >
                {amt}
              </button>
            ))}
          </div>
        </div>

        {betOptions.length > 0 && (
          <div className="ds-betting-panel__options">
            <span className="ds-betting-panel__section-label">Selection</span>
            <div className="ds-betting-panel__grid">
              {betOptions.map((opt) => (
                <GoldButton
                  key={opt.id}
                  size="sm"
                  disabled={disabled || opt.disabled}
                  onClick={() => onBet?.(opt.id)}
                  fullWidth
                >
                  {opt.label}
                  {opt.odds && <span className="ds-betting-panel__odds">{opt.odds}</span>}
                </GoldButton>
              ))}
            </div>
          </div>
        )}

        {onClear && (
          <SecondaryButton size="sm" onClick={onClear} disabled={disabled} fullWidth>
            Clear
          </SecondaryButton>
        )}

        {footer && <div className="ds-betting-panel__footer">{footer}</div>}
      </div>
    </aside>
  );
}
