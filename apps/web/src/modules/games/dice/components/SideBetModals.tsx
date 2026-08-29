import { useEffect, useState } from 'react';
import { Modal } from '../../../../design-system';
import { formatCurrency } from '../utils/seatPositions';
import { DiceStakePresets } from './DiceStakePresets';
import './DiceControls.css';
import './SideBetModals.css';

export function SideBetModal({
  open,
  onClose,
  targetName,
  currency = 'USD',
  minBet = 10,
  maxBet = 10000,
  formatAmount,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  targetName: string;
  currency?: string;
  minBet?: number;
  maxBet?: number;
  formatAmount?: (n: number) => string;
  onSubmit: (prediction: 'WIN' | 'LOSS', amount: number) => void | Promise<void>;
}) {
  const [prediction, setPrediction] = useState<'WIN' | 'LOSS'>('WIN');
  const [amount, setAmount] = useState<number>(0);
  const [customAmount, setCustomAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fmt = formatAmount ?? ((n: number) => formatCurrency(n, currency));

  useEffect(() => {
    if (open) {
      setPrediction('WIN');
      setAmount(0);
      setCustomAmount('');
      setError(null);
      setPending(false);
    }
  }, [open, targetName]);

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
    setPending(true);
    try {
      await onSubmit(prediction, finalAmount);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="" size="sm">
      <div className="dice-sidebet-modal">
        <div className="dice-sidebet-modal__header">
          <span className="dice-sidebet-modal__eyebrow">Spectator Side Bet</span>
          <h2>BACK {targetName.toUpperCase()}</h2>
        </div>

        <div className="dice-sidebet-modal__predictions">
          <span className="dice-sidebet-modal__label">They will</span>
          <div className="dice-sidebet-modal__pred-row">
            <button
              type="button"
              className={`dice-sidebet-modal__pred ${prediction === 'WIN' ? 'dice-sidebet-modal__pred--active' : ''}`}
              onClick={() => setPrediction('WIN')}
            >
              WIN
            </button>
            <button
              type="button"
              className={`dice-sidebet-modal__pred ${prediction === 'LOSS' ? 'dice-sidebet-modal__pred--active' : ''}`}
              onClick={() => setPrediction('LOSS')}
            >
              PAO / LOSS
            </button>
          </div>
        </div>

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
            disabled={pending || amount <= 0}
          >
            {pending ? 'PLACING…' : 'SUBMIT'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function IncomingSideBetModal({
  open,
  request,
  onAccept,
  onReject,
  onClose,
  currency = 'USD',
  availableBalance,
  formatAmount,
}: {
  open: boolean;
  request: { id: string; backerName: string; amount: number; prediction: string } | null;
  onAccept: (amount: number) => void | Promise<void>;
  onReject: () => void | Promise<void>;
  onClose: () => void;
  currency?: string;
  availableBalance?: number;
  formatAmount?: (n: number) => string;
}) {
  const [acceptAmount, setAcceptAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fmt = formatAmount ?? ((n: number) => formatCurrency(n, currency));

  useEffect(() => {
    if (open && request) {
      setAcceptAmount(String(request.amount));
      setError(null);
      setPending(false);
    }
  }, [open, request?.id, request?.amount]);

  if (!request) return null;

  const available = Math.max(0, availableBalance ?? request.amount);
  const typed = parseFloat(acceptAmount);
  const requested = Number.isFinite(typed) && typed > 0 ? typed : request.amount;
  const finalAccept = Math.min(requested, available, request.amount);
  const partial = finalAccept > 0 && finalAccept < request.amount;

  const handleAccept = async () => {
    if (finalAccept <= 0) {
      setError('Insufficient balance to accept');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onAccept(finalAccept);
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  };

  const handleReject = async () => {
    setError(null);
    setPending(true);
    try {
      await onReject();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="" size="sm">
      <div className="dice-sidebet-modal dice-sidebet-modal--incoming">
        <div className="dice-sidebet-modal__header">
          <span className="dice-sidebet-modal__eyebrow">Side Bet Request</span>
          <h2>ACCEPT OR REJECT</h2>
        </div>
        <p className="dice-sidebet-modal__copy">
          <strong>{request.backerName}</strong> bets {fmt(request.amount)} you will{' '}
          <strong>{request.prediction === 'LOSS' ? 'PAO / LOSS' : 'WIN'}</strong>
        </p>

        <label className="dice-sidebet-modal__amount">
          <span className="dice-sidebet-modal__label">Accept amount (partial OK)</span>
          <div className="dice-sidebet-modal__amount-input">
            <span>{currency === 'INR' ? '₹' : '$'}</span>
            <input
              type="number"
              min={1}
              max={request.amount}
              value={acceptAmount}
              onChange={(e) => setAcceptAmount(e.target.value)}
            />
          </div>
          {partial ? (
            <p className="dice-sidebet-modal__hint">
              Available {fmt(available)} · Shoot covers {fmt(request.amount - finalAccept)}
            </p>
          ) : null}
        </label>

        {error ? <p className="dice-sidebet-modal__error">{error}</p> : null}

        <div className="dice-sidebet-modal__actions">
          <button
            type="button"
            className="dice-sidebet-modal__submit"
            disabled={pending || finalAccept <= 0}
            onClick={() => void handleAccept()}
          >
            {pending ? '…' : `ACCEPT ${fmt(finalAccept)}`}
          </button>
          <button type="button" className="dice-sidebet-modal__reject" disabled={pending} onClick={() => void handleReject()}>
            REJECT
          </button>
        </div>
      </div>
    </Modal>
  );
}
