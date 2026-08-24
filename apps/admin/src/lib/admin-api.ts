const API_URL = import.meta.env.VITE_ADMIN_API_URL ?? '';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class AdminApi {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) localStorage.setItem('games_admin_token', token);
    else localStorage.removeItem('games_admin_token');
  }

  getToken() {
    if (!this.token) this.token = localStorage.getItem('games_admin_token');
    return this.token;
  }

  logout() {
    this.setToken(null);
  }

  async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Request failed');
    return json.data as T;
  }

  get<T>(path: string) { return this.fetch<T>(path); }
  post<T>(path: string, body?: unknown) { return this.fetch<T>(path, { method: 'POST', body: JSON.stringify(body) }); }
  patch<T>(path: string, body?: unknown) { return this.fetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }); }
  put<T>(path: string, body?: unknown) { return this.fetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }); }
}

export const adminApi = new AdminApi();

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  onlineUsers: number;
  totalGames: number;
  activeRooms: number;
  activeSessions: number;
  totalBets: number;
  betsLast24h: number;
  transactionVolume24h: string;
  pendingWithdrawals: number;
  pendingDeposits: number;
  totalPlatformBalance: string;
  sandboxMode: boolean;
  adminTestModeEnabled: boolean;
  recentActivity: Array<{
    id: string;
    type: 'audit' | 'transaction';
    action: string;
    actor?: string;
    targetType?: string | null;
    targetId?: string | null;
    amount?: string;
    status?: string;
    timestamp: string;
  }>;
}
