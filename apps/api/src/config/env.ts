import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',

  api: {
    port: parseInt(process.env.API_PORT ?? '3001', 10),
    host: process.env.API_HOST ?? '0.0.0.0',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174').split(','),
  },

  jwt: {
    secret: requireEnv('JWT_SECRET', 'dev-secret-change-in-production'),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    cookieName: process.env.SESSION_COOKIE_NAME ?? 'games_session',
  },

  wallet: {
    sandboxMode: process.env.WALLET_SANDBOX_MODE === 'true',
    sandboxMaxCredit: parseFloat(process.env.WALLET_SANDBOX_MAX_CREDIT ?? '100000'),
  },

  admin: {
    /** Development-only admin test controls for sandbox sessions */
    testModeEnabled: process.env.ADMIN_TEST_MODE === 'true' && process.env.NODE_ENV !== 'production',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '100', 10),
  },

  database: {
    url: requireEnv('DATABASE_URL'),
  },
} as const;
