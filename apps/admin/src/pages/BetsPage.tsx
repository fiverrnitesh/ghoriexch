import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type Paginated } from '../lib/admin-api';
import { PageHeader, DataTable, StatusBadge, Pagination } from '../components/AdminLayout';

export function BetsPage() {
  const [data, setData] = useState<Paginated<Record<string, unknown>> | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    adminApi.get<Paginated<Record<string, unknown>>>(`/api/admin/bets?page=${page}`).then(setData).catch(console.error);
  }, [page]);

  return (
    <div>
      <PageHeader title="Bet Management" subtitle="View all bets with user, game, room, prediction, and result" />
      <DataTable
        columns={[
          { key: 'id', label: 'Bet ID', render: (r) => <span className="mono">{String(r.id).slice(0, 10)}…</span> },
          { key: 'user', label: 'User', render: (r) => {
            const u = r.user as { id: string; username: string } | null;
            return u ? <Link to={`/users/${u.id}`} className="link-gold">{u.username}</Link> : '—';
          }},
          { key: 'game', label: 'Game', render: (r) => String((r.game as { name: string })?.name ?? '—') },
          { key: 'room', label: 'Room', render: (r) => String((r.room as { code: string })?.code ?? '—') },
          { key: 'amount', label: 'Amount', render: (r) => `₨ ${r.amount}` },
          { key: 'selection', label: 'Prediction', render: (r) => JSON.stringify(r.selection ?? {}) },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> },
          { key: 'payout', label: 'Payout', render: (r) => r.payout ? `₨ ${r.payout}` : '—' },
          { key: 'createdAt', label: 'Placed', render: (r) => new Date(String(r.createdAt)).toLocaleString() },
        ]}
        rows={data?.items ?? []}
      />
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
