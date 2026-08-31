import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi, type Paginated } from '../lib/admin-api';
import { PageHeader, DataTable, StatusBadge, SandboxBanner } from '../components/AdminLayout';

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [tx, setTx] = useState<Paginated<Record<string, unknown>> | null>(null);
  const [history, setHistory] = useState<Paginated<Record<string, unknown>> | null>(null);
  const [sessions, setSessions] = useState<Record<string, unknown>[]>([]);
  const [tab, setTab] = useState<'profile' | 'wallet' | 'transactions' | 'history' | 'sessions'>('profile');
  const [statusSaving, setStatusSaving] = useState(false);

  const refresh = () => {
    if (!id) return;
    adminApi.get<Record<string, unknown>>(`/api/admin/users/${id}`).then(setUser).catch(console.error);
    adminApi.get<Paginated<Record<string, unknown>>>(`/api/admin/users/${id}/transactions`).then(setTx).catch(console.error);
    adminApi.get<Paginated<Record<string, unknown>>>(`/api/admin/users/${id}/game-history`).then(setHistory).catch(console.error);
    adminApi.get<Record<string, unknown>[]>(`/api/admin/users/${id}/sessions`).then(setSessions).catch(console.error);
  };

  useEffect(refresh, [id]);

  const updateStatus = async (status: string) => {
    if (!id) return;
    setStatusSaving(true);
    try {
      await adminApi.patch(`/api/admin/users/${id}/status`, { status });
      refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setStatusSaving(false);
    }
  };

  if (!user) return <div className="loading">Loading user...</div>;

  const wallet = user.wallet as Record<string, string> | null;

  return (
    <div>
      <PageHeader
        title={String(user.displayName ?? user.username)}
        subtitle={`@${user.username}`}
        actions={<Link to="/users" className="btn btn--ghost">← Back</Link>}
      />

      <div className="detail-tabs">
        {(['profile', 'wallet', 'transactions', 'history', 'sessions'] as const).map((t) => (
          <button key={t} type="button" className={`tab-btn ${tab === t ? 'tab-btn--active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="detail-grid">
          <div className="panel detail-card">
            <h3>Account & Hierarchy</h3>
            <dl className="detail-dl">
              <dt>Account ID</dt><dd className="mono">{String(user.id)}</dd>
              <dt>Status</dt><dd><StatusBadge status={String(user.status)} /></dd>
              <dt>Role Level</dt><dd>{(user.roles as string[]).join(', ')}</dd>
              <dt>Upline Agent</dt><dd>{user.parent ? `@${(user.parent as { username: string }).username}` : 'Direct / Company'}</dd>
              <dt>Downlines</dt><dd>{String(user.downlineCount ?? 0)} accounts</dd>
              <dt>Registered</dt><dd>{new Date(String(user.createdAt)).toLocaleString()}</dd>
              <dt>Last Login</dt><dd>{user.lastLoginAt ? new Date(String(user.lastLoginAt)).toLocaleString() : '—'}</dd>
            </dl>
            <div className="action-row">
              <button type="button" className="btn btn--ghost" disabled={statusSaving} onClick={() => updateStatus('ACTIVE')}>Activate</button>
              <button type="button" className="btn btn--ghost" disabled={statusSaving} onClick={() => updateStatus('SUSPENDED')}>Suspend</button>
              <button type="button" className="btn btn--ghost" disabled={statusSaving} onClick={() => updateStatus('BANNED')}>Ban</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'wallet' && (
        <div className="panel detail-card">
          <SandboxBanner message="Viewing sandbox wallet data when sandbox mode is enabled." />
          {wallet ? (
            <dl className="detail-dl">
              <dt>Balance</dt><dd>₨ {wallet.balance}</dd>
              <dt>Available</dt><dd>₨ {wallet.availableBalance}</dd>
              <dt>Locked</dt><dd>₨ {wallet.lockedBalance}</dd>
              <dt>Currency</dt><dd>{wallet.currency}</dd>
            </dl>
          ) : <p className="text-muted">No wallet</p>}
        </div>
      )}

      {tab === 'transactions' && (
        <DataTable
          columns={[
            { key: 'type', label: 'Type' },
            { key: 'amount', label: 'Amount', render: (r) => `₨ ${r.amount}` },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> },
            { key: 'createdAt', label: 'Date', render: (r) => new Date(String(r.createdAt)).toLocaleString() },
          ]}
          rows={tx?.items ?? []}
          emptyMessage="No transactions"
        />
      )}

      {tab === 'history' && (
        <DataTable
          columns={[
            { key: 'game', label: 'Game', render: (r) => String((r.game as { name: string })?.name ?? '—') },
            { key: 'amount', label: 'Amount', render: (r) => `₨ ${r.amount}` },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> },
            { key: 'createdAt', label: 'Date', render: (r) => new Date(String(r.createdAt)).toLocaleString() },
          ]}
          rows={history?.items ?? []}
          emptyMessage="No game history"
        />
      )}

      {tab === 'sessions' && (
        <DataTable
          columns={[
            { key: 'sessionId', label: 'Session' },
            { key: 'game', label: 'Game', render: (r) => String((r.game as { name: string })?.name ?? '—') },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> },
            { key: 'isTestMode', label: 'Test', render: (r) => r.isTestMode ? 'YES' : '—' },
          ]}
          rows={sessions as unknown as Record<string, unknown>[]}
          emptyMessage="No active sessions"
        />
      )}
    </div>
  );
}
