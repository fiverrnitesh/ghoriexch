import { useEffect, useState } from 'react';
import { Modal } from '../../../../design-system';
import { formatCurrency } from '../utils/seatPositions';
import { chipPresets } from './DiceControls';
import './DiceControls.css';
import './SideBetModals.css';

export function DiceMainBetModal({
  open,
  onClose,
  minBet = 10,
  maxBet = 10000,
  currency = 'USD',
  formatAmount,
  availableBalance,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  minBet?: number;
  maxBet?: number;
  currency?: string;
  formatAmount?: (n: number) => string;
  availableBalance: number;
  onSubmit: (amount: number, choice: 'ODD' | 'EVEN') => void | Promise<void>;
}) {
  const [amount, setAmount] = useState(minBet);
  const [customAmount, setCustomAmount] = useState('');
  const [paoActive, setPaoActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fmt = formatAmount ?? ((n: number) => formatCurrency(n, currency));
  const chips = chipPresets(minBet, maxBet);

  useEffect(() => {
    if (open) {
      setAmount(minBet);
      setCustomAmount('');
      setPaoActive(false);
      setError(null);
      setPending(false);
    }
  }, [open, minBet]);

  const clamp = (n: number) => Math.min(maxBet, Math.max(minBet, n));

  const submit = async () => {
    setError(null);
    const finalAmount = clamp(amount);
    if (finalAmount > availableBalance) {
      setError('Insufficient available balance');
      return;
    }
    setPending(true);
    try {
      await onSubmit(finalAmount, paoActive ? 'ODD' : 'EVEN');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place bet');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="" size="sm">
      <div className="dice-sidebet-modal">
        <div className="dice-sidebet-modal__header">
          <span className="dice-sidebet-modal__eyebrow">YOUR TURN TO HOLD DICE</span>
          <h2>PLACE MAIN BET</h2>
        </div>

        <span className="dice-sidebet-modal__label">PREDICTION</span>
        <div className="dice-sidebet-modal__pred-row" style={{ marginBottom: '1.25rem' }}>
          <button
            type="button"
            className={`dice-sidebet-modal__pred-btn ${!paoActive ? 'dice-sidebet-modal__pred-btn--active' : ''}`}
            onClick={() => setPaoActive(false)}
          >
            <span className="dice-sidebet-modal__pred-title">EVEN (DEFAULT)</span>
            <span className="dice-sidebet-modal__pred-sub">4, 6 or Blank+Even</span>
          </button>
          <button
            type="button"
            className={`dice-sidebet-modal__pred-btn ${paoActive ? 'dice-sidebet-modal__pred-btn--active' : ''}`}
            onClick={() => setPaoActive(true)}
          >
            <span className="dice-sidebet-modal__pred-title">PAO (ODD)</span>
            <span className="dice-sidebet-modal__pred-sub">1, 3 or Blank+Odd</span>
          </button>
        </div>

        <span className="dice-sidebet-modal__label">CHIP PRESETS</span>
        <div className="dice-sidebet-modal__chips-grid">
          {chips.map((val) => {
            const isSelected = amount === val && !customAmount;
            return (
              <button
                key={val}
                type="button"
                className={`dice-sidebet-modal__chip-btn ${isSelected ? 'dice-sidebet-modal__chip-btn--active' : ''}`}
                onClick={() => {
                  setAmount(val);
                  setCustomAmount('');
                }}
              >
                {fmt(val)}
              </button>
            );
          })}
        </div>

        <span className="dice-sidebet-modal__label">CUSTOM AMOUNT</span>
        <input
          type="number"
          min={minBet}
          max={maxBet}
          inputMode="decimal"
          className="ds-input"
          style={{ width: '100%', marginBottom: '1.25rem' }}
          placeholder={`${minBet} – ${maxBet}`}
          value={customAmount}
          onChange={(e) => {
            const next = e.target.value;
            setCustomAmount(next);
            const parsed = parseFloat(next);
            if (Number.isFinite(parsed)) setAmount(parsed);
          }}
        />

        {error ? <p className="dice-sidebet-modal__error">{error}</p> : null}

        <div className="dice-sidebet-modal__summary">
          <span>Total Stake</span>
          <strong>{fmt(clamp(amount))}</strong>
        </div>

        <div className="dice-sidebet-modal__actions">
          <button
            type="button"
            className="ds-btn ds-btn--secondary"
            onClick={onClose}
            disabled={pending}
          >
            CANCEL
          </button>
          <button
            type="button"
            className="ds-btn ds-btn--gold"
            onClick={() => void submit()}
            disabled={pending || clamp(amount) > availableBalance}
          >
            {pending ? 'PLACING…' : 'CONFIRM BET'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
