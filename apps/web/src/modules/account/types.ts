import type { PaginatedResponse } from '@games/shared';

export interface WalletEnvironment {
  sandbox: boolean;
  label: 'SANDBOX' | 'LIVE';
  warning?: string;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
}

export interface WalletBalance {
  id: string;
  currency: string;
  balance: string;
  availableBalance: string;
  lockedBalance: string;
  environment: {
    sandbox: boolean;
    label: string;
    warning?: string;
  };
}

export interface WalletTransaction {
  id: string;
  type: string;
  status: string;
  amount: string;
  balanceAfter: string;
  availableAfter: string;
  lockedAfter: string;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  processedAt: string | null;
}

export interface AccountProfile {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
  roles: string[];
  currency: string;
  preferences: {
    emailNotifications: boolean;
    pushNotifications: boolean;
    marketingEmails: boolean;
    hideBalance: boolean;
  };
  createdAt: string;
  lastLoginAt: string | null;
}

export interface GameHistoryEntry {
  id: string;
  game: { id: string; slug: string; name: string; category: string | null };
  sessionId: string | null;
  roundNumber: number | null;
  room: { id: string; code: string; name: string } | null;
  amount: string;
  payout: string | null;
  status: string;
  selection: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  settledAt: string | null;
}

export interface GameHistorySummary {
  totalBets: number;
  wins: number;
  losses: number;
  totalWagered: string;
}

export type Paginated<T> = PaginatedResponse<T>;
