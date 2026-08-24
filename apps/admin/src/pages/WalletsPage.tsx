import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type Paginated } from '../lib/admin-api';
import { PageHeader, DataTable, SandboxBanner, Pagination } from '../components/AdminLayout';

export function WalletsPage() {
  const [data, setData] = useState<Paginated<Record<string, unknown>> | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    adminApi.get<Paginated<Record<string, unknown>>>(`/api/admin/wallets?page=${page}`).then(setData).catch(console.error);
  }, [page]);

  return (
    <div>
      <PageHeader title="Wallet Management" subtitle="Platform wallet balances and user holdings" />
      <SandboxBanner message="All wallet values shown in sandbox mode are simulated — NOT real money." />
      <DataTable
        columns={[
          { key: 'user', label: 'User', render: (r) => {
            const u = r.user as { id: string; username: string };
            return <Link to={`/users/${u.id}`} className="link-gold">{u.username}</Link>;
          }},
          { key: 'balance', label: 'Balance', render: (r) => `$${r.balance}` },
          { key: 'availableBalance', label: 'Available', render: (r) => `$${r.availableBalance}` },
          { key: 'lockedBalance', label: 'Locked', render: (r) => `$${r.lockedBalance}` },
          { key: 'currency', label: 'Currency' },
        ]}
        rows={data?.items ?? []}
      />
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}

export function TransactionsPage() {
  const [data, setData] = useState<Paginated<Record<string, unknown>> | null>(null);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (typeFilter) params.set('type', typeFilter);
    adminApi.get<Paginated<Record<string, unknown>>>(`/api/admin/transactions?${params}`).then(setData).catch(console.error);
  }, [page, typeFilter]);

  return (
    <div>
      <PageHeader title="Transaction History" subtitle="Deposits, withdrawals, game transactions, and wallet movements" />
      <div className="toolbar panel">
        <select className="input" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          {['DEPOSIT', 'WITHDRAWAL', 'GAME_DEBIT', 'GAME_CREDIT', 'REFUND', 'SANDBOX_CREDIT', 'SANDBOX_DEBIT', 'LOCK', 'UNLOCK'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <DataTable
        columns={[
          { key: 'user', label: 'User', render: (r) => String((r.user as { username: string })?.username ?? '—') },
          { key: 'type', label: 'Type' },
          { key: 'amount', label: 'Amount', render: (r) => `$${r.amount}` },
          { key: 'status', label: 'Status' },
          { key: 'description', label: 'Description' },
          { key: 'createdAt', label: 'Date', render: (r) => new Date(String(r.createdAt)).toLocaleString() },
        ]}
        rows={data?.items ?? []}
      />
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
