import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { AuthUser } from '@games/shared';
import { api } from '../../lib/api-client';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  demoLogin: (email: string) => Promise<void>;
  register: (data: { email: string; username: string; password: string; displayName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    try {
      const token = api.getToken();
      if (!token) {
        setUser(null);
        return;
      }
      const profile = await api.get<AuthUser>('/api/auth/me');
      setUser(profile);
    } catch (err) {
      const message = (err as Error).message ?? '';
      // Do not wipe session on transient rate-limit errors
      if (message.includes('Too many requests')) return;
      api.setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshProfile().finally(() => setLoading(false));
  }, [refreshProfile]);

  const demoLogin = async (email: string) => {
    const result = await api.post<{ user: AuthUser; accessToken: string }>('/api/demo/login', { email });
    api.setToken(result.accessToken);
    setUser(result.user);
  };

  const login = async (email: string, password: string) => {
    const result = await api.post<{ user: AuthUser; accessToken: string }>('/api/auth/login', { email, password });
    api.setToken(result.accessToken);
    setUser(result.user);
  };

  const register = async (data: { email: string; username: string; password: string; displayName?: string }) => {
    const result = await api.post<{ user: AuthUser; accessToken: string }>('/api/auth/register', data);
    api.setToken(result.accessToken);
    setUser(result.user);
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch { /* ignore */ }
    api.setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, demoLogin, register, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
