import { Link } from 'react-router-dom';
import { useWallet } from './hooks/useWallet';
import { SandboxBanner } from './components/SandboxBanner';
import {
  WalletDisplay,
  TransactionList,
  LoadingState,
  ErrorState,
  GoldButton,
  SecondaryButton,
} from '../../design-system';
import './WalletPages.css';

export function WalletOverviewPage() {
  const { balance, environment, recentTx, loading, error, refresh } = useWallet();

  if (loading) return <LoadingState message="Loading wallet..." />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="wallet-module">
      <div className="wallet-module__header">
        <h1>Wallet</h1>
        <div className="wallet-module__nav">
          <Link to="/wallet/deposit"><GoldButton size="sm">Deposit</GoldButton></Link>
          <Link to="/wallet/withdraw"><SecondaryButton size="sm">Withdraw</SecondaryButton></Link>
          <Link to="/wallet/transactions"><SecondaryButton size="sm">All Transactions</SecondaryButton></Link>
        </div>
      </div>

      <SandboxBanner environment={environment} />

      {balance && (
        <WalletDisplay
          balance={balance.balance}
          available={balance.availableBalance}
          locked={balance.lockedBalance}
          currency={balance.currency}
        />
      )}

      <div className="ds-panel ds-panel--chrome" style={{ marginTop: '1.5rem' }}>
        <div className="ds-panel__header"><h3 className="ds-panel__title">Recent Transactions</h3></div>
        <div className="ds-panel__body">
          <TransactionList
            items={recentTx.map((tx) => ({
              id: tx.id,
              type: tx.type,
              amount: tx.amount,
              status: tx.status,
              description: tx.description,
              date: new Date(tx.createdAt).toLocaleString(),
            }))}
            emptyMessage="No transactions yet — make a sandbox deposit to get started"
          />
        </div>
      </div>
    </div>
  );
}
