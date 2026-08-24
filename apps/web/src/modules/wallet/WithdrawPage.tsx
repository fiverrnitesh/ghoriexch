import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from './hooks/useWallet';
import { SandboxBanner } from './components/SandboxBanner';
import { GoldButton, SecondaryButton, useToast, LoadingState } from '../../design-system';
import './WalletPages.css';

export function WithdrawPage() {
  const { toast } = useToast();
  const { balance, environment, loading, withdraw } = useWallet();
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      toast('Enter a valid amount', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await withdraw(value, destination || undefined);
      toast(
        environment?.sandbox
          ? `Sandbox withdrawal of $${value} completed — NOT real money`
          : 'Withdrawal initiated',
        'success',
      );
      setAmount('');
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
        <h1>{environment?.sandbox ? 'Sandbox Withdrawal' : 'Withdraw'}</h1>
        <Link to="/wallet"><SecondaryButton size="sm">← Wallet</SecondaryButton></Link>
      </div>

      <SandboxBanner environment={environment} />

      <div className="ds-panel ds-panel--chrome wallet-form-card">
        <div className="ds-panel__header">
          <h3 className="ds-panel__title">
            {environment?.sandbox ? 'Remove Sandbox Funds' : 'Withdraw Funds'}
          </h3>
        </div>
        <div className="ds-panel__body">
          {balance && (
            <p className="wallet-form-card__balance">
              Available: <strong>${balance.availableBalance}</strong>
            </p>
          )}

          <form onSubmit={handleWithdraw} className="wallet-form">
            <label className="wallet-form__label">
              Amount (USD)
              <input className="ds-input" type="number" min="1" step="0.01" max={balance?.availableBalance} value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </label>

            {!environment?.sandbox && (
              <label className="wallet-form__label">
                Destination (optional)
                <input className="ds-input" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Bank account / wallet address" />
              </label>
            )}

            {environment?.sandbox && (
              <p className="wallet-form__notice">
                Removes simulated funds from your sandbox wallet. No real payout occurs.
              </p>
            )}

            <GoldButton type="submit" fullWidth loading={submitting}>
              {environment?.sandbox ? 'Withdraw Sandbox Funds' : 'Initiate Withdrawal'}
            </GoldButton>
          </form>
        </div>
      </div>
    </div>
  );
}
