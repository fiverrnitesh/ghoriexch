import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from './hooks/useWallet';
import { SandboxBanner } from './components/SandboxBanner';
import { GoldButton, SecondaryButton, useToast, LoadingState } from '../../design-system';
import './WalletPages.css';

export function DepositPage() {
  const { toast } = useToast();
  const { balance, environment, loading, deposit, sandboxCredit } = useWallet();
  const [amount, setAmount] = useState('100');
  const [submitting, setSubmitting] = useState(false);

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      toast('Enter a valid amount', 'error');
      return;
    }
    setSubmitting(true);
    try {
      if (environment?.sandbox) {
        await sandboxCredit(value, 'Sandbox deposit via deposit page');
        toast(`Sandbox deposit of $${value} completed — NOT real money`, 'success');
      } else {
        await deposit(value);
        toast('Deposit initiated', 'success');
      }
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState message="Loading..." />;

  return (
    <div className="wallet-module">
      <div className="wallet-module__header">
        <h1>{environment?.sandbox ? 'Sandbox Deposit' : 'Deposit'}</h1>
        <Link to="/wallet"><SecondaryButton size="sm">← Wallet</SecondaryButton></Link>
      </div>

      <SandboxBanner environment={environment} />

      <div className="ds-panel ds-panel--chrome wallet-form-card">
        <div className="ds-panel__header">
          <h3 className="ds-panel__title">
            {environment?.sandbox ? 'Add Sandbox Funds' : 'Deposit Funds'}
          </h3>
        </div>
        <div className="ds-panel__body">
          {balance && (
            <p className="wallet-form-card__balance">
              Available: <strong>${balance.availableBalance}</strong>
            </p>
          )}

          <form onSubmit={handleDeposit} className="wallet-form">
            <label className="wallet-form__label">
              Amount (USD)
              <input className="ds-input" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </label>

            <div className="wallet-form__chips">
              {[50, 100, 500, 1000].map((v) => (
                <button key={v} type="button" className="ds-betting-chip" onClick={() => setAmount(String(v))}>
                  ${v}
                </button>
              ))}
            </div>

            {environment?.sandbox ? (
              <p className="wallet-form__notice">
                This adds simulated funds for local testing only. No payment provider is connected.
              </p>
            ) : (
              <p className="wallet-form__notice">
                Payment gateway integration pending — deposits will be processed once a provider is configured.
              </p>
            )}

            <GoldButton type="submit" fullWidth loading={submitting}>
              {environment?.sandbox ? 'Add Sandbox Funds' : 'Initiate Deposit'}
            </GoldButton>
          </form>
        </div>
      </div>
    </div>
  );
}
