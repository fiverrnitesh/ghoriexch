import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api-client';
import type { AccountProfile } from '../types';

export function useAccount() {
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<AccountProfile>('/api/account');
      setAccount(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const updateProfile = async (data: { displayName?: string; avatarUrl?: string | null }) => {
    const updated = await api.patch<AccountProfile>('/api/account/profile', data);
    setAccount(updated);
    return updated;
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await api.post('/api/account/change-password', { currentPassword, newPassword });
  };

  const updateSettings = async (settings: Partial<AccountProfile['preferences']>) => {
    const updated = await api.patch<AccountProfile>('/api/account/settings', settings);
    setAccount(updated);
    return updated;
  };

  return { account, loading, error, refresh, updateProfile, changePassword, updateSettings };
}
