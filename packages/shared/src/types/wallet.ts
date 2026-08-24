export const WALLET_TRANSACTION_TYPES = {
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
  GAME_DEBIT: 'GAME_DEBIT',
  GAME_CREDIT: 'GAME_CREDIT',
  REFUND: 'REFUND',
  LOCK: 'LOCK',
  UNLOCK: 'UNLOCK',
  SANDBOX_CREDIT: 'SANDBOX_CREDIT',
  SANDBOX_DEBIT: 'SANDBOX_DEBIT',
} as const;

export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[keyof typeof WALLET_TRANSACTION_TYPES];

export const WALLET_TRANSACTION_STATUSES = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REVERSED: 'REVERSED',
} as const;

export type WalletTransactionStatus =
  (typeof WALLET_TRANSACTION_STATUSES)[keyof typeof WALLET_TRANSACTION_STATUSES];

export interface WalletSummary {
  id: string;
  currency: string;
  balance: string;
  availableBalance: string;
  lockedBalance: string;
}

export interface WalletTransactionRecord {
  id: string;
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  amount: string;
  balanceAfter: string;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface DepositRequest {
  amount: number;
  currency?: string;
  providerReference?: string;
}

export interface WithdrawalRequest {
  amount: number;
  currency?: string;
  destination?: string;
}

export interface SandboxCreditRequest {
  amount: number;
  note?: string;
}
