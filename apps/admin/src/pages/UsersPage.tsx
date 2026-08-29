import { useEffect, useState, useCallback } from 'react';
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
  isUnlimited?: boolean;
  parent?: { id: string; username: string; displayName?: string } | null;
  wallet?: { balance: string; availableBalance: string } | null;
  createdAt: string;
}

interface HierarchyInfo {
  role: string;
  level: number;
  allowedChildRoles: string[];
  defaultChildRole: string | null;
  isUnlimited: boolean;
  balance: string;
}

const ROLE_COLORS: Record<string, string> = {
  COMPANY: 'badge--gold',
  PANEL: 'badge--test',
  SUPER_ADMIN: 'badge--live',
  ADMIN: 'badge--warn',
  SUPER_MASTER: 'badge--live',
  MASTER: 'badge--gold',
  USER: 'badge--ghost',
};

const ROLE_LABELS: Record<string, string> = {
  COMPANY: 'Level 1: Company',
  PANEL: 'Level 2: Panel',
  SUPER_ADMIN: 'Level 3: Super Admin',
  ADMIN: 'Level 4: Admin',
  SUPER_MASTER: 'Level 5: Super Master',
  MASTER: 'Level 6: Master',
  USER: 'Level 7: User (Player)',
};

export function UsersPage() {
  const [data, setData] = useState<Paginated<UserRow> | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hierarchyInfo, setHierarchyInfo] = useState<HierarchyInfo | null>(null);

  // Quick Create Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState('USER');
  const [newInitialCoins, setNewInitialCoins] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // Transfer Coins Modal State
  const [transferTarget, setTransferTarget] = useState<UserRow | null>(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDirection, setTransferDirection] = useState<'deposit' | 'withdraw'>('deposit');
  const [transferring, setTransferring] = useState(false);

  const loadUsers = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search.trim()) params.set('search', search.trim());

    adminApi.get<Paginated<UserRow>>(`/api/admin/users?${params}`)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        console.warn('Admin user list fetch fallback:', err);
        adminApi.get<Paginated<UserRow>>(`/api/agent/downlines?${params}`)
          .then(setData)
          .catch(console.error);
      })
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    adminApi.get<HierarchyInfo>('/api/agent/hierarchy-info')
      .then((info) => {
        setHierarchyInfo(info);
        if (info.allowedChildRoles && info.allowedChildRoles.length > 0) {
          setNewRole(info.defaultChildRole || info.allowedChildRoles[0] || 'USER');
        }
      })
      .catch(() => {});
  }, []);

  const handleOpenCreate = () => {
    setCreateError('');
    setCreateSuccess('');
    if (hierarchyInfo?.allowedChildRoles && hierarchyInfo.allowedChildRoles.length > 0) {
      setNewRole(hierarchyInfo.defaultChildRole || hierarchyInfo.allowedChildRoles[0] || 'USER');
    }
    setCreateOpen(true);
  };

  const handleCreateDownline = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    setCreateSuccess('');
    try {
      await adminApi.post('/api/agent/downlines', {
        username: newUsername.trim(),
        password: newPassword,
        roleName: newRole,
        displayName: newDisplayName.trim() || undefined,
        initialCoins: newInitialCoins ? Number(newInitialCoins) : 0,
      });
      setCreateSuccess(`Account @${newUsername.trim()} created successfully!`);
      setTimeout(() => {
        setCreateOpen(false);
        setNewUsername('');
        setNewPassword('');
        setNewDisplayName('');
        setNewInitialCoins('');
        setCreateSuccess('');
        loadUsers();
      }, 800);
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTarget) return;
    const amount = Number(transferAmount);
    if (!amount || amount <= 0) return;
    setTransferring(true);
    try {
      await adminApi.post(`/api/agent/downlines/${transferTarget.id}/transfer-coins`, {
        amount,
        direction: transferDirection,
      });
      setTransferTarget(null);
      setTransferAmount('');
      loadUsers();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setTransferring(false);
    }
  };

  const availableRoles = hierarchyInfo?.allowedChildRoles?.length
    ? hierarchyInfo.allowedChildRoles
    : ['PANEL', 'SUPER_ADMIN', 'ADMIN', 'SUPER_MASTER', 'MASTER', 'USER'];

  return (
    <div>
      <PageHeader
        title="Agent Hierarchy & User Management"
        subtitle="7-Tier Betting Exchange Tree (Company → Panel → Super Admin → Admin → Super Master → Master → User)"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn--ghost" onClick={loadUsers} title="Refresh users list">
              ↻ Refresh
            </button>
            <button type="button" className="btn btn--gold" onClick={handleOpenCreate}>
              + Create Hierarchy User
            </button>
          </div>
        }
      />

      <div className="toolbar panel" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <input
          className="input"
          placeholder="Search by username, display name, or email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ maxWidth: '380px' }}
        />
        {data && (
          <span className="text-muted" style={{ fontSize: '0.85rem' }}>
            Total users: <strong>{data.total}</strong>
          </span>
        )}
      </div>

      <DataTable
        loading={loading}
        columns={[
          {
            key: 'username',
            label: 'Account',
            render: (r) => (
              <div>
                <Link to={`/users/${r.id}`} className="link-gold">@{String(r.username)}</Link>
                {Boolean(r.displayName) && <div className="text-muted" style={{ fontSize: '0.76rem' }}>{String(r.displayName)}</div>}
              </div>
            ),
          },
          {
            key: 'roles',
            label: 'Hierarchy Level',
            render: (r) => {
              const roleList = (r.roles as string[]) || [];
              const primaryRole = roleList[0] || 'USER';
              return (
                <span className={`badge ${ROLE_COLORS[primaryRole] || 'badge--gold'}`}>
                  {primaryRole}
                </span>
              );
            },
          },
          {
            key: 'parent',
            label: 'Upline Agent',
            render: (r) => {
              const p = r.parent as { id: string; username: string } | null;
              return p ? (
                <Link to={`/users/${p.id}`} className="link-gold" style={{ fontSize: '0.82rem' }}>
                  @{p.username}
                </Link>
              ) : (
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>Direct / Root</span>
              );
            },
          },
          {
            key: 'wallet',
            label: 'Available Coins',
            render: (r) => {
              if (r.isUnlimited) return <strong style={{ color: '#f5c842' }}>∞ Unlimited</strong>;
              const w = r.wallet as { availableBalance: string } | null;
              return <strong>{w ? `$${Number(w.availableBalance).toLocaleString()}` : '$0'}</strong>;
            },
          },
          {
            key: 'status',
            label: 'Status',
            render: (r) => <StatusBadge status={String(r.status)} />,
          },
          {
            key: 'createdAt',
            label: 'Created',
            render: (r) => new Date(String(r.createdAt)).toLocaleDateString(),
          },
          {
            key: 'actions',
            label: 'Coin Operations',
            render: (r) => (
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  type="button"
                  className="btn btn--gold"
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                  onClick={() => {
                    setTransferTarget(r as unknown as UserRow);
                    setTransferDirection('deposit');
                  }}
                >
                  + Give Coins
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                  onClick={() => {
                    setTransferTarget(r as unknown as UserRow);
                    setTransferDirection('withdraw');
                  }}
                >
                  - Take Coins
                </button>
              </div>
            ),
          },
        ]}
        rows={(data?.items ?? []) as unknown as Record<string, unknown>[]}
      />
      {data && data.totalPages > 1 && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}

      {/* Modal: Create Hierarchy Downline */}
      {createOpen && (
        <div className="login-page" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel login-card" style={{ maxWidth: '480px', width: '100%' }}>
            <h2 style={{ color: '#f5c842', marginBottom: '1rem' }}>Create Hierarchy User</h2>
            {createError && <div className="login-error">{createError}</div>}
            {createSuccess && <div style={{ color: '#4ade80', marginBottom: '0.75rem', fontSize: '0.9rem' }}>{createSuccess}</div>}
            <form className="login-form" onSubmit={handleCreateDownline}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#a89888' }}>
                Role Level:
                <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  {availableRoles.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role] || role}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#a89888' }}>
                Username:
                <input className="input" type="text" placeholder="e.g. master_ahmed" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required pattern="[a-zA-Z0-9_]{3,30}" />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#a89888' }}>
                Display Name (Optional):
                <input className="input" type="text" placeholder="e.g. Ahmed VIP Master" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#a89888' }}>
                Password:
                <input className="input" type="password" placeholder="Min 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#a89888' }}>
                Initial Coins (Optional):
                <input className="input" type="number" placeholder="0" value={newInitialCoins} onChange={(e) => setNewInitialCoins(e.target.value)} min="0" />
              </label>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn--gold" disabled={creating}>{creating ? 'Creating...' : 'Create Account'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Transfer Coins */}
      {transferTarget && (
        <div className="login-page" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel login-card" style={{ maxWidth: '420px', width: '100%' }}>
            <h2 style={{ color: '#f5c842', marginBottom: '0.5rem' }}>
              {transferDirection === 'deposit' ? 'Give Coins' : 'Recall Coins'}
            </h2>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Target: <strong>@{transferTarget.username}</strong> ({transferTarget.roles?.join(', ')})
            </p>
            <form className="login-form" onSubmit={handleTransfer}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#a89888' }}>
                Coin Amount:
                <input
                  className="input"
                  type="number"
                  placeholder="Enter coin amount..."
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  required
                  min="1"
                  autoFocus
                />
              </label>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--ghost" onClick={() => setTransferTarget(null)}>Cancel</button>
                <button type="submit" className="btn btn--gold" disabled={transferring}>
                  {transferring ? 'Processing...' : transferDirection === 'deposit' ? 'Deposit Coins' : 'Withdraw Coins'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
