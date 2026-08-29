import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api-client';
import {
  GoldButton,
  SecondaryButton,
  Modal,
  LoadingState,
  ErrorState,
  useToast,
} from '../../design-system';
import { HIERARCHY_NAMES, RoleName } from '@games/shared';
import './DownlinesPage.css';

interface HierarchyInfo {
  userId: string;
  username: string;
  displayName?: string;
  role: RoleName;
  level: number;
  isUnlimited: boolean;
  balance: string;
  defaultChildRole: RoleName | null;
  allowedChildRoles: RoleName[];
  parent?: { id: string; username: string; displayName?: string; isUnlimited: boolean } | null;
  canCreateUsers: boolean;
}

interface DownlineUser {
  id: string;
  username: string;
  displayName?: string;
  role: RoleName;
  level: number;
  status: 'ACTIVE' | 'SUSPENDED';
  balance: string;
  totalBalance: string;
  downlineCount: number;
  isUnlimited: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}

export function DownlinesPage() {
  const { toast } = useToast();
  const [hierarchy, setHierarchy] = useState<HierarchyInfo | null>(null);
  const [downlines, setDownlines] = useState<DownlineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Create Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState<RoleName>('USER');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newInitialCoins, setNewInitialCoins] = useState('');
  const [creating, setCreating] = useState(false);

  // Transfer Coins Modal State
  const [transferTarget, setTransferTarget] = useState<DownlineUser | null>(null);
  const [transferDirection, setTransferDirection] = useState<'deposit' | 'withdraw'>('deposit');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Reset Password Modal State
  const [resetTarget, setResetTarget] = useState<DownlineUser | null>(null);
  const [resetPass, setResetPass] = useState('');
  const [resetting, setResetting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hInfo, dList] = await Promise.all([
        api.get<HierarchyInfo>('/api/agent/hierarchy-info'),
        api.get<{ items: DownlineUser[]; total: number }>(
          `/api/agent/downlines?search=${encodeURIComponent(search)}`
        ),
      ]);
      setHierarchy(hInfo);
      setDownlines(dList.items);
      if (hInfo.defaultChildRole) {
        setNewRole(hInfo.defaultChildRole);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) {
      toast('Username and password are required', 'error');
      return;
    }
    setCreating(true);
    try {
      await api.post('/api/agent/downlines', {
        username: newUsername.trim(),
        password: newPassword,
        roleName: newRole,
        displayName: newDisplayName.trim() || undefined,
        initialCoins: newInitialCoins ? Number(newInitialCoins) : 0,
      });
      toast(`User @${newUsername} created successfully!`, 'success');
      setCreateOpen(false);
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewInitialCoins('');
      loadData();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTarget) return;
    const amount = Number(transferAmount);
    if (!amount || amount <= 0) {
      toast('Please enter a valid coin amount', 'error');
      return;
    }
    setTransferring(true);
    try {
      await api.post(`/api/agent/downlines/${transferTarget.id}/transfer-coins`, {
        amount,
        direction: transferDirection,
      });
      toast(
        transferDirection === 'deposit'
          ? `Gave ${amount} coins to @${transferTarget.username}`
          : `Recalled ${amount} coins from @${transferTarget.username}`,
        'success'
      );
      setTransferTarget(null);
      setTransferAmount('');
      loadData();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setTransferring(false);
    }
  };

  const handleToggleStatus = async (user: DownlineUser) => {
    const nextStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await api.patch(`/api/agent/downlines/${user.id}/status`, { status: nextStatus });
      toast(`@${user.username} is now ${nextStatus}`, 'success');
      setDownlines((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u))
      );
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || !resetPass) return;
    setResetting(true);
    try {
      await api.post(`/api/agent/downlines/${resetTarget.id}/password`, { password: resetPass });
      toast(`Password for @${resetTarget.username} updated!`, 'success');
      setResetTarget(null);
      setResetPass('');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setResetting(false);
    }
  };

  if (loading && !hierarchy) return <LoadingState message="Loading Hierarchy & Downlines..." />;
  if (error && !hierarchy) return <ErrorState message={error} onRetry={loadData} />;

  const getRoleClass = (r: RoleName) => {
    switch (r) {
      case 'COMPANY': return 'role-badge--company';
      case 'PANEL': return 'role-badge--panel';
      case 'SUPER_ADMIN': return 'role-badge--super-admin';
      case 'ADMIN': return 'role-badge--admin';
      case 'SUPER_MASTER': return 'role-badge--super-master';
      case 'MASTER': return 'role-badge--master';
      default: return 'role-badge--user';
    }
  };

  return (
    <div className="downlines-page">
      {/* Top Hierarchy Header */}
      {hierarchy && (
        <div className="agent-hierarchy-hero ds-panel ds-panel--chrome">
          <div className="agent-hero-main">
            <div className="agent-hero-avatar">👑</div>
            <div className="agent-hero-info">
              <div className="agent-hero-title-row">
                <h1>{hierarchy.displayName || hierarchy.username}</h1>
                <span className={`role-badge ${getRoleClass(hierarchy.role)}`}>
                  {HIERARCHY_NAMES[hierarchy.role] || hierarchy.role} (Level {hierarchy.level})
                </span>
              </div>
              <p className="agent-hero-subtitle">
                @{hierarchy.username}
                {hierarchy.parent && (
                  <span className="agent-upline-tag">
                    {' • '}Upline: <strong>@{hierarchy.parent.username}</strong>
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="agent-hero-balance-box">
            <span className="agent-balance-label">MY AVAILABLE COINS</span>
            <span className="agent-balance-value">
              {hierarchy.isUnlimited ? '∞ Unlimited' : hierarchy.balance}
            </span>
          </div>
        </div>
      )}

      {/* Downlines Toolbar */}
      <div className="downlines-toolbar">
        <div className="downlines-search-box">
          <input
            type="text"
            className="ds-input"
            placeholder="Search by username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {hierarchy?.canCreateUsers && (
          <GoldButton onClick={() => setCreateOpen(true)}>
            + Create New Account
          </GoldButton>
        )}
      </div>

      {/* Downlines Table */}
      <div className="ds-panel ds-panel--chrome downlines-table-panel">
        <div className="ds-panel__header">
          <h2 className="ds-panel__title">
            My Created Accounts ({downlines.length})
          </h2>
        </div>

        <div className="downlines-table-wrapper">
          {downlines.length === 0 ? (
            <div className="downlines-empty-state">
              <p>No accounts created yet.</p>
              {hierarchy?.canCreateUsers && (
                <GoldButton size="sm" onClick={() => setCreateOpen(true)}>
                  Create First Downline
                </GoldButton>
              )}
            </div>
          ) : (
            <table className="downlines-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role Level</th>
                  <th>Available Coins</th>
                  <th>Downlines</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {downlines.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="downline-user-cell">
                        <span className="downline-uname">@{user.username}</span>
                        {user.displayName && (
                          <span className="downline-dname">{user.displayName}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`role-badge ${getRoleClass(user.role)}`}>
                        {HIERARCHY_NAMES[user.role] || user.role}
                      </span>
                    </td>
                    <td>
                      <strong className="downline-coins-text">
                        {user.isUnlimited ? '∞ Unlimited' : user.balance}
                      </strong>
                    </td>
                    <td>{user.downlineCount}</td>
                    <td>
                      <span
                        className={`ds-badge ds-badge--${
                          user.status === 'ACTIVE' ? 'live' : 'danger'
                        }`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="downline-actions-row">
                        <button
                          type="button"
                          className="btn-action btn-action--deposit"
                          title="Give Coins"
                          onClick={() => {
                            setTransferTarget(user);
                            setTransferDirection('deposit');
                          }}
                        >
                          + Give Coins
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-action--withdraw"
                          title="Recall Coins"
                          onClick={() => {
                            setTransferTarget(user);
                            setTransferDirection('withdraw');
                          }}
                        >
                          - Take Coins
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-action--secondary"
                          onClick={() => handleToggleStatus(user)}
                        >
                          {user.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-action--secondary"
                          onClick={() => {
                            setResetTarget(user);
                            setResetPass('');
                          }}
                        >
                          🔑 Pass
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal: Create Downline User */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Downline Account"
      >
        <form onSubmit={handleCreate} className="downline-modal-form">
          <label className="ds-form-field">
            <span>Account Role Level</span>
            <select
              className="ds-input"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as RoleName)}
            >
              {hierarchy?.allowedChildRoles.map((r) => (
                <option key={r} value={r}>
                  {HIERARCHY_NAMES[r]} (Level {HIERARCHY_NAMES[r]})
                </option>
              ))}
            </select>
          </label>

          <label className="ds-form-field">
            <span>Username</span>
            <input
              type="text"
              className="ds-input"
              placeholder="e.g. master_ahmed"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              pattern="[a-zA-Z0-9_]{3,30}"
              required
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>

          <label className="ds-form-field">
            <span>Display Name (Optional)</span>
            <input
              type="text"
              className="ds-input"
              placeholder="e.g. Ahmed VIP"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
            />
          </label>

          <label className="ds-form-field">
            <span>Password</span>
            <input
              type="password"
              className="ds-input"
              placeholder="Min 6 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>

          <label className="ds-form-field">
            <span>Initial Coins to Transfer (Optional)</span>
            <input
              type="number"
              className="ds-input"
              placeholder="0"
              value={newInitialCoins}
              onChange={(e) => setNewInitialCoins(e.target.value)}
              min="0"
            />
            {!hierarchy?.isUnlimited && (
              <span className="ds-form-hint">
                Available in your wallet: {hierarchy?.balance} coins
              </span>
            )}
          </label>

          <div className="modal-actions-row">
            <SecondaryButton type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </SecondaryButton>
            <GoldButton type="submit" loading={creating}>
              Create User
            </GoldButton>
          </div>
        </form>
      </Modal>

      {/* Modal: Transfer Coins (Deposit or Withdraw) */}
      <Modal
        open={!!transferTarget}
        onClose={() => setTransferTarget(null)}
        title={
          transferDirection === 'deposit'
            ? `Give Coins to @${transferTarget?.username}`
            : `Recall Coins from @${transferTarget?.username}`
        }
      >
        <form onSubmit={handleTransfer} className="downline-modal-form">
          <div className="transfer-summary-box">
            <div className="transfer-summary-col">
              <span>Target User</span>
              <strong>@{transferTarget?.username}</strong>
            </div>
            <div className="transfer-summary-col">
              <span>Current Coins</span>
              <strong>{transferTarget?.balance}</strong>
            </div>
            {!hierarchy?.isUnlimited && transferDirection === 'deposit' && (
              <div className="transfer-summary-col">
                <span>Your Available</span>
                <strong>{hierarchy?.balance}</strong>
              </div>
            )}
          </div>

          <label className="ds-form-field">
            <span>Coin Amount to {transferDirection === 'deposit' ? 'Give' : 'Take'}</span>
            <input
              type="number"
              className="ds-input"
              placeholder="Enter amount..."
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              required
              min="1"
              autoFocus
            />
          </label>

          <div className="modal-actions-row">
            <SecondaryButton type="button" onClick={() => setTransferTarget(null)}>
              Cancel
            </SecondaryButton>
            <GoldButton type="submit" loading={transferring}>
              {transferDirection === 'deposit' ? 'Deposit Coins' : 'Withdraw Coins'}
            </GoldButton>
          </div>
        </form>
      </Modal>

      {/* Modal: Reset Password */}
      <Modal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title={`Reset Password for @${resetTarget?.username}`}
      >
        <form onSubmit={handleResetPassword} className="downline-modal-form">
          <label className="ds-form-field">
            <span>New Password</span>
            <input
              type="password"
              className="ds-input"
              placeholder="Enter new password (min 6 chars)"
              value={resetPass}
              onChange={(e) => setResetPass(e.target.value)}
              required
              minLength={6}
              autoFocus
            />
          </label>

          <div className="modal-actions-row">
            <SecondaryButton type="button" onClick={() => setResetTarget(null)}>
              Cancel
            </SecondaryButton>
            <GoldButton type="submit" loading={resetting}>
              Update Password
            </GoldButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
