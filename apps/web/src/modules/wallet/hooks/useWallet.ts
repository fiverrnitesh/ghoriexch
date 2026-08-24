import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api-client';
import type {
  Paginated,
  WalletBalance,
  WalletEnvironment,
  WalletTransaction,
} from '../../account/types';

export function useWallet() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [environment, setEnvironment] = useState<WalletEnvironment | null>(null);
  const [recentTx, setRecentTx] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bal, env, tx] = await Promise.all([
        api.get<WalletBalance>('/api/wallet'),
        api.get<WalletEnvironment>('/api/wallet/environment'),
        api.get<Paginated<WalletTransaction>>('/api/wallet/transactions?page=1&pageSize=5'),
      ]);
      setBalance(bal);
      setEnvironment(env);
      setRecentTx(tx.items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const deposit = async (amount: number) => {
    const key = api.createIdempotencyKey('deposit');
    const result = await api.post('/api/wallet/deposit', { amount }, { idempotencyKey: key });
    await refresh();
    return result;
  };

  const withdraw = async (amount: number, destination?: string) => {
    const key = api.createIdempotencyKey('withdraw');
    const result = await api.post('/api/wallet/withdraw', { amount, destination }, { idempotencyKey: key });
    await refresh();
    return result;
  };

  const sandboxCredit = async (amount: number, note?: string) => {
    const key = api.createIdempotencyKey('sandbox');
    const result = await api.post('/api/wallet/sandbox/credit', { amount, note }, { idempotencyKey: key });
    await refresh();
    return result;
  };

  return { balance, environment, recentTx, loading, error, refresh, deposit, withdraw, sandboxCredit };
}

export function useTransactions(page = 1, pageSize = 20, type?: string) {
  const [data, setData] = useState<Paginated<WalletTransaction> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (type) params.set('type', type);
    api.get<Paginated<WalletTransaction>>(`/api/wallet/transactions?${params}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, pageSize, type]);

  return { data, loading };
}
