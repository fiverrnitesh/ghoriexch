import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from './hooks/useAccount';
import { LoadingState, ErrorState, SecondaryButton, useToast } from '../../design-system';
import './ProfilePage.css';

export function AccountSettingsPage() {
  const { toast } = useToast();
  const { account, loading, error, refresh, updateSettings } = useAccount();
  const [saving, setSaving] = useState(false);

  if (loading) return <LoadingState message="Loading settings..." />;
  if (error || !account) return <ErrorState message={error ?? 'Not found'} onRetry={refresh} />;

  const prefs = account.preferences;

  const toggle = async (key: keyof typeof prefs, value: boolean) => {
    setSaving(true);
    try {
      await updateSettings({ [key]: value });
      toast('Settings saved', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="account-page">
      <div className="account-page__header">
        <h1>Account Settings</h1>
        <Link to="/profile"><SecondaryButton size="sm">← Back to Profile</SecondaryButton></Link>
      </div>

      <div className="ds-panel ds-panel--chrome" style={{ maxWidth: 560 }}>
        <div className="ds-panel__header"><h3 className="ds-panel__title">Preferences</h3></div>
        <div className="ds-panel__body settings-list">
          {([
            ['emailNotifications', 'Email notifications', 'Receive account and wallet alerts via email'],
            ['pushNotifications', 'Push notifications', 'In-app alerts for game and wallet events'],
            ['marketingEmails', 'Marketing emails', 'Promotions and bonus offers'],
            ['hideBalance', 'Hide balance in header', 'Mask wallet balance in navigation'],
          ] as const).map(([key, label, desc]) => (
            <label key={key} className="settings-row">
              <div>
                <span className="settings-row__label">{label}</span>
                <span className="settings-row__desc">{desc}</span>
              </div>
              <input
                type="checkbox"
                checked={prefs[key]}
                disabled={saving}
                onChange={(e) => toggle(key, e.target.checked)}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
