import { useEffect, useState } from 'react';
import { Modal } from '../../../../design-system';
import { formatCurrency } from '../utils/seatPositions';
import { DiceStakePresets } from './DiceStakePresets';
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
  const [amount, setAmount] = useState<number>(0);
  const [customAmount, setCustomAmount] = useState('');
  const [paoActive, setPaoActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fmt = formatAmount ?? ((n: number) => formatCurrency(n, currency));

  useEffect(() => {
    if (open) {
      setAmount(0);
      setCustomAmount('');
      setPaoActive(false);
      setError(null);
      setPending(false);
    }
  }, [open]);

  const handleAddAmount = (increment: number) => {
    setAmount((prev) => {
      const base = customAmount ? parseFloat(customAmount) || 0 : (prev || 0);
      const next = Math.min(maxBet, base + increment);
      setCustomAmount(String(next));
      return next;
    });
  };

  const handleClear = () => {
    setAmount(0);
    setCustomAmount('');
  };

  const submit = async () => {
    setError(null);
    const parsed = customAmount ? parseFloat(customAmount) : amount;
    const finalAmount = Number.isFinite(parsed) ? parsed : 0;
    if (finalAmount <= 0) {
      setError('Please enter or select a bet amount');
      return;
    }
    if (finalAmount < minBet) {
      setError(`Minimum bet is ${fmt(minBet)}`);
      return;
    }
    if (finalAmount > maxBet) {
      setError(`Maximum bet is ${fmt(maxBet)}`);
      return;
    }
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
        <button
          type="button"
          className="dice-sidebet-modal__pao-btn"
          onClick={() => setPaoActive(true)}
        >
          <span className="dice-sidebet-modal__pao-title">PAO</span>
        </button>

        <DiceStakePresets
          onAddAmount={handleAddAmount}
          onClear={handleClear}
          currency={currency}
        />

        <div className="dice-sidebet-modal__amount-dual-row">
          <div className="dice-sidebet-modal__amount-col">
            <span className="dice-sidebet-modal__amount-col-label">AMOUNT</span>
            <input
              type="number"
              min={minBet}
              max={maxBet}
              inputMode="decimal"
              className="dice-sidebet-modal__amount-input"
              placeholder=""
              value={customAmount}
              onChange={(e) => {
                const next = e.target.value;
                setCustomAmount(next);
                const parsed = parseFloat(next);
                setAmount(Number.isFinite(parsed) ? parsed : 0);
              }}
            />
          </div>
          <div className="dice-sidebet-modal__amount-col">
            <span className="dice-sidebet-modal__amount-col-label">SUM AMOUNT</span>
            <div className="dice-sidebet-modal__amount-box">
              {amount > 0 ? fmt(amount) : ''}
            </div>
          </div>
        </div>

        {error ? <p className="dice-sidebet-modal__error">{error}</p> : null}

        <div className="dice-sidebet-modal__actions">
          <button
            type="button"
            className="ds-btn ds-btn--secondary"
            onClick={handleClear}
            disabled={pending}
          >
            RESET
          </button>
          <button
            type="button"
            className="ds-btn ds-btn--gold"
            onClick={() => void submit()}
            disabled={pending || amount > availableBalance || amount <= 0}
          >
            {pending ? 'PLACING…' : 'SUBMIT'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

