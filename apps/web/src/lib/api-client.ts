import { IDEMPOTENCY_HEADER } from '@games/shared';

const API_URL = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_URL ?? '');

interface FetchOptions extends RequestInit {
  token?: string | null;
  idempotencyKey?: string;
}

function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError && /fetch|network|failed/i.test(err.message);
}

export class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) localStorage.setItem('games_token', token);
    else localStorage.removeItem('games_token');
  }

  getToken() {
    if (!this.token) this.token = localStorage.getItem('games_token');
    return this.token;
  }

  createIdempotencyKey(prefix = 'req'): string {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  async fetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
    const token = options.token ?? this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.idempotencyKey) headers[IDEMPOTENCY_HEADER] = options.idempotencyKey;

    const method = (options.method ?? 'GET').toUpperCase();
    const retries = method === 'GET' ? 3 : 1;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch(`${API_URL}${path}`, {
          ...options,
          headers,
          credentials: 'include',
        });

        const json = await res.json().catch(() => null);
        if (!json) {
          throw new Error(res.ok ? 'Invalid server response' : `Server error (${res.status})`);
        }

        if (!res.ok || !json.success) {
          throw new Error(json.error?.message ?? 'Request failed');
        }

        return json.data as T;
      } catch (err) {
        lastError = isNetworkFailure(err)
          ? new Error('Cannot reach the game server. Start the API (port 3001) and try again.')
          : err instanceof Error
            ? err
            : new Error('Request failed');
        if (!isNetworkFailure(err) || attempt === retries - 1) break;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }

    throw lastError ?? new Error('Request failed');
  }

  get<T>(path: string) {
    return this.fetch<T>(path);
  }

  post<T>(path: string, body?: unknown, opts?: { idempotencyKey?: string }) {
    return this.fetch<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      idempotencyKey: opts?.idempotencyKey,
    });
  }

  patch<T>(path: string, body?: unknown) {
    return this.fetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }
}

export const api = new ApiClient();
