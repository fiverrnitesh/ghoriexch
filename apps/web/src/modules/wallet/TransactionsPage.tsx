import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet, useTransactions } from './hooks/useWallet';
import { TransactionList, LoadingState, SecondaryButton } from '../../design-system';
import { SandboxBanner } from './components/SandboxBanner';
import './WalletPages.css';

const TX_TYPES = [
  '', 'DEPOSIT', 'WITHDRAWAL', 'SANDBOX_CREDIT', 'SANDBOX_DEBIT',
  'GAME_DEBIT', 'GAME_CREDIT', 'REFUND', 'LOCK', 'UNLOCK',
];

export function TransactionsPage() {
  const { environment } = useWallet();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const { data, loading } = useTransactions(page, 20, typeFilter || undefined);

  return (
    <div className="wallet-module">
      <div className="wallet-module__header">
        <h1>Transaction History</h1>
        <Link to="/wallet"><SecondaryButton size="sm">← Wallet</SecondaryButton></Link>
      </div>

      <SandboxBanner environment={environment} />

      <div className="wallet-filters">
        <label>
          Filter by type
          <select className="ds-input" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
            <option value="">All types</option>
            {TX_TYPES.filter(Boolean).map((t) => (
              <option key={t} value={t}>{t?.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <LoadingState message="Loading transactions..." />
      ) : (
        <>
          <div className="ds-panel ds-panel--chrome">
            <div className="ds-panel__body">
              <TransactionList
                items={(data?.items ?? []).map((tx) => ({
                  id: tx.id,
                  type: tx.type,
                  amount: tx.amount,
                  status: tx.status,
                  description: tx.description,
                  date: new Date(tx.createdAt).toLocaleString(),
                }))}
              />
            </div>
          </div>

          {data && data.totalPages > 1 && (
            <div className="wallet-pagination">
              <SecondaryButton size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</SecondaryButton>
              <span>Page {page} of {data.totalPages}</span>
              <SecondaryButton size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</SecondaryButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
