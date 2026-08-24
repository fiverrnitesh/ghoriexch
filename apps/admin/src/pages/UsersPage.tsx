import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type Paginated } from '../lib/admin-api';
import { PageHeader, DataTable, StatusBadge, Pagination } from '../components/AdminLayout';

interface UserRow {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  status: string;
  roles: string[];
  createdAt: string;
}

export function UsersPage() {
  const [data, setData] = useState<Paginated<UserRow> | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    adminApi.get<Paginated<UserRow>>(`/api/admin/users?${params}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, search]);

  return (
    <div>
      <PageHeader title="User Management" subtitle="Search, view, and manage player accounts" />
      <div className="toolbar panel">
        <input
          className="input"
          placeholder="Search email, username, display name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>
      <DataTable
        loading={loading}
        columns={[
          { key: 'username', label: 'User', render: (r) => (
            <Link to={`/users/${r.id}`} className="link-gold">{String(r.username)}</Link>
          )},
          { key: 'email', label: 'Email' },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> },
          { key: 'roles', label: 'Roles', render: (r) => (r.roles as string[]).join(', ') },
          { key: 'createdAt', label: 'Registered', render: (r) => new Date(String(r.createdAt)).toLocaleDateString() },
        ]}
        rows={(data?.items ?? []) as unknown as Record<string, unknown>[]}
      />
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
