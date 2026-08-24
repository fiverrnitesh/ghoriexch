import { useEffect, useState } from 'react';
import { adminApi, type Paginated } from '../lib/admin-api';
import { PageHeader, DataTable, Pagination } from '../components/AdminLayout';

export function AuditLogsPage() {
  const [data, setData] = useState<Paginated<Record<string, unknown>> | null>(null);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (actionFilter) params.set('action', actionFilter);
    adminApi.get<Paginated<Record<string, unknown>>>(`/api/admin/audit-logs?${params}`).then(setData).catch(console.error);
  }, [page, actionFilter]);

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Every important admin action with before/after values" />
      <div className="toolbar panel">
        <input className="input" placeholder="Filter by action..." value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} />
      </div>
      <DataTable
        columns={[
          { key: 'action', label: 'Action', render: (r) => <span className="badge badge--gold">{String(r.action)}</span> },
          { key: 'actor', label: 'Admin', render: (r) => String((r.actor as { username: string })?.username ?? '—') },
          { key: 'targetType', label: 'Target' },
          { key: 'before', label: 'Old Value', render: (r) => <code className="mono-sm">{JSON.stringify(r.before ?? null)}</code> },
          { key: 'after', label: 'New Value', render: (r) => <code className="mono-sm">{JSON.stringify(r.after ?? null)}</code> },
          { key: 'createdAt', label: 'Timestamp', render: (r) => new Date(String(r.createdAt)).toLocaleString() },
        ]}
        rows={data?.items ?? []}
      />
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
