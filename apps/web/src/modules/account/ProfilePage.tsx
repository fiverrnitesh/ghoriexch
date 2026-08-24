import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAccount } from './hooks/useAccount';
import {
  UserAvatar,
  LoadingState,
  ErrorState,
  GoldButton,
  SecondaryButton,
  Modal,
  useToast,
} from '../../design-system';
import './ProfilePage.css';

export function ProfilePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { account, loading, error, refresh, updateProfile, changePassword } = useAccount();

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const startEdit = () => {
    if (!account) return;
    setDisplayName(account.displayName ?? account.username);
    setAvatarUrl(account.avatarUrl ?? '');
    setEditing(true);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile({
        displayName,
        avatarUrl: avatarUrl.trim() || null,
      });
      toast('Profile updated', 'success');
      setEditing(false);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast('Passwords do not match', 'error');
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast('Password changed successfully', 'success');
      setPasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) return <LoadingState message="Loading account..." />;
  if (error || !account) return <ErrorState message={error ?? 'Account not found'} onRetry={refresh} />;

  return (
    <div className="account-page">
      <div className="account-page__header">
        <h1>My Account</h1>
        <div className="account-page__actions">
          <Link to="/profile/settings"><SecondaryButton size="sm">Settings</SecondaryButton></Link>
          <SecondaryButton size="sm" onClick={handleLogout}>Logout</SecondaryButton>
        </div>
      </div>

      <div className="account-grid">
        <div className="ds-panel ds-panel--chrome account-card account-card--profile">
          <div className="account-card__hero">
            <UserAvatar
              name={account.displayName ?? account.username}
              imageUrl={account.avatarUrl}
              size="xl"
              highlight
              status="online"
            />
            <div>
              <h2>{account.displayName ?? account.username}</h2>
              <p className="account-card__username">@{account.username}</p>
              <span className={`ds-badge ds-badge--${account.status === 'ACTIVE' ? 'live' : 'danger'}`}>
                {account.status}
              </span>
            </div>
          </div>

          {editing ? (
            <div className="account-form">
              <label className="account-form__label">
                Display Name
                <input className="ds-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} />
              </label>
              <label className="account-form__label">
                Avatar URL
                <input className="ds-input" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
              </label>
              <div className="account-form__actions">
                <SecondaryButton onClick={() => setEditing(false)}>Cancel</SecondaryButton>
                <GoldButton onClick={saveProfile} loading={saving}>Save</GoldButton>
              </div>
            </div>
          ) : (
            <>
              <dl className="account-dl">
                <dt>Account ID</dt>
                <dd className="account-dl__mono">{account.id}</dd>
                <dt>Email</dt>
                <dd>{account.email}</dd>
                <dt>Username</dt>
                <dd>{account.username}</dd>
                <dt>Registered</dt>
                <dd>{new Date(account.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</dd>
                <dt>Last Login</dt>
                <dd>{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : '—'}</dd>
              </dl>
              <div className="account-card__footer">
                <GoldButton size="sm" onClick={startEdit}>Edit Profile</GoldButton>
                <SecondaryButton size="sm" onClick={() => setPasswordOpen(true)}>Change Password</SecondaryButton>
              </div>
            </>
          )}
        </div>

        <div className="account-side">
          <div className="ds-panel ds-panel--chrome account-card">
            <div className="ds-panel__header"><h3 className="ds-panel__title">Quick Links</h3></div>
            <div className="ds-panel__body account-links">
              <Link to="/wallet">Wallet Overview</Link>
              <Link to="/wallet/deposit">Deposit</Link>
              <Link to="/wallet/withdraw">Withdraw</Link>
              <Link to="/wallet/transactions">Transactions</Link>
              <Link to="/history">Game History</Link>
              <Link to="/profile/settings">Account Settings</Link>
            </div>
          </div>
        </div>
      </div>

      <Modal open={passwordOpen} onClose={() => setPasswordOpen(false)} title="Change Password">
        <form onSubmit={handlePasswordChange} className="account-form">
          <label className="account-form__label">
            Current Password
            <input className="ds-input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </label>
          <label className="account-form__label">
            New Password
            <input className="ds-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </label>
          <label className="account-form__label">
            Confirm New Password
            <input className="ds-input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
          </label>
          <GoldButton type="submit" fullWidth loading={changingPassword}>Update Password</GoldButton>
        </form>
      </Modal>
    </div>
  );
}
