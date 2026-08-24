import { useEffect, useState, type CSSProperties } from 'react';
import { Modal } from '../../../../design-system';
import { formatCurrency } from '../utils/seatPositions';
import { CHIP_COLORS, chipPresets } from './DiceControls';
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
  const [amount, setAmount] = useState(minBet);
  const [customAmount, setCustomAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fmt = formatAmount ?? ((n: number) => formatCurrency(n, currency));
  const chips = chipPresets(minBet, maxBet);

  useEffect(() => {
    if (open) {
      setPrediction('WIN');
      setAmount(minBet);
      setCustomAmount('');
      setError(null);
      setPending(false);
    }
  }, [open, minBet, targetName]);

  const clamp = (n: number) => Math.min(maxBet, Math.max(minBet, n));

  const submit = async () => {
    setError(null);
    setPending(true);
    try {
      await onSubmit(prediction, clamp(amount));
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

        <div className="dice-sidebet-modal__amount">
          <span className="dice-sidebet-modal__label">Amount · {fmt(amount)}</span>
          <div className="dice-controls__chips dice-sidebet-modal__chips">
            {chips.map((chip, i) => (
              <button
                key={chip}
                type="button"
                className={`dice-controls__chip ${amount === chip ? 'dice-controls__chip--active' : ''}`}
                style={{ '--chip-color': CHIP_COLORS[i % CHIP_COLORS.length] } as CSSProperties}
                onClick={() => setAmount(clamp(chip))}
                title={fmt(chip)}
              >
                <span className="dice-controls__chip-inner">
                  {chip >= 1000 ? `$${chip / 1000}K` : fmt(chip)}
                </span>
              </button>
            ))}
          </div>
          <label className="dice-sidebet-modal__amount-input">
            <span>{currency === 'INR' ? '₹' : '$'}</span>
            <input
              type="number"
              min={minBet}
              max={maxBet}
              value={customAmount}
              placeholder={`${minBet}–${maxBet}`}
              onChange={(e) => setCustomAmount(e.target.value)}
            />
            <button
              type="button"
              className="dice-sidebet-modal__set-amt"
              onClick={() => {
                const parsed = parseFloat(customAmount);
                if (Number.isFinite(parsed)) setAmount(clamp(parsed));
              }}
            >
              SET
            </button>
          </label>
        </div>

        {error ? <p className="dice-sidebet-modal__error">{error}</p> : null}

        <div className="dice-sidebet-modal__actions">
          <button
            type="button"
            className="dice-sidebet-modal__submit"
            disabled={pending}
            onClick={() => void submit()}
          >
            {pending ? 'PLACING…' : 'PLACE SIDE BET'}
          </button>
          <button type="button" className="dice-sidebet-modal__reject" disabled={pending} onClick={onClose}>
            CANCEL
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
