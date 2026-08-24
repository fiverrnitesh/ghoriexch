import {
  Prisma,
  type WalletTransactionType,
  type WalletTransactionStatus,
} from '@prisma/client';
import { prisma } from '../../database/client.js';
import { WalletError, NotFoundError, ForbiddenError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { parseAmount, decimalToString } from '../../lib/utils.js';
import { auditService } from '../audit/audit.service.js';
import { getPaymentProvider } from './payment-provider.js';

export interface WalletOperationOptions {
  description?: string;
  referenceType?: string;
  referenceId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  initialStatus?: WalletTransactionStatus;
}

export interface TransactionFilters {
  page?: number;
  pageSize?: number;
  type?: WalletTransactionType;
  status?: WalletTransactionStatus;
}

export class WalletService {
  /** Get full balance snapshot with environment info */
  async getBalance(userId: string) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundError('Wallet not found');

    return {
      id: wallet.id,
      currency: wallet.currency,
      balance: decimalToString(wallet.balance),
      availableBalance: decimalToString(wallet.availableBalance),
      lockedBalance: decimalToString(wallet.lockedBalance),
      environment: {
        sandbox: env.wallet.sandboxMode,
        label: env.wallet.sandboxMode ? 'SANDBOX' : 'LIVE',
        warning: env.wallet.sandboxMode
          ? 'Development sandbox — balances are NOT real money'
          : undefined,
      },
    };
  }

  /** Alias for backward compatibility */
  async getWallet(userId: string) {
    return this.getBalance(userId);
  }

  async getTransactions(userId: string, filters: TransactionFilters = {}) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundError('Wallet not found');

    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.WalletTransactionWhereInput = { walletId: wallet.id };
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;

    const [items, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.walletTransaction.count({ where }),
    ]);

    return {
      items: items.map((tx) => this.formatTransaction(tx)),
      total,
      page,
      pageSize,
    };
  }

  /** Credit available + total balance */
  async credit(userId: string, amount: number, type: WalletTransactionType, opts: WalletOperationOptions = {}) {
    return this.executeTransaction({
      userId,
      amount: parseAmount(amount),
      type,
      ...opts,
      creditAvailable: true,
      initialStatus: opts.initialStatus ?? 'COMPLETED',
    });
  }

  /** Debit from available + total balance */
  async debit(userId: string, amount: number, type: WalletTransactionType, opts: WalletOperationOptions = {}) {
    return this.executeTransaction({
      userId,
      amount: parseAmount(amount),
      type,
      ...opts,
      debitAvailable: true,
      initialStatus: opts.initialStatus ?? 'COMPLETED',
    });
  }

  /** Move funds from available to locked (total unchanged) */
  async lock(userId: string, amount: number, opts: WalletOperationOptions = {}) {
    return this.executeTransaction({
      userId,
      amount: parseAmount(amount),
      type: 'LOCK',
      description: opts.description ?? 'Funds locked',
      ...opts,
      lockFunds: true,
      initialStatus: opts.initialStatus ?? 'COMPLETED',
    });
  }

  /** Move funds from locked back to available */
  async unlock(userId: string, amount: number, opts: WalletOperationOptions = {}) {
    return this.executeTransaction({
      userId,
      amount: parseAmount(amount),
      type: 'UNLOCK',
      description: opts.description ?? 'Funds unlocked',
      ...opts,
      unlockFunds: true,
      initialStatus: opts.initialStatus ?? 'COMPLETED',
    });
  }

  /** Refund to available balance */
  async refund(userId: string, amount: number, opts: WalletOperationOptions = {}) {
    return this.executeTransaction({
      userId,
      amount: parseAmount(amount),
      type: 'REFUND',
      description: opts.description ?? 'Refund',
      ...opts,
      creditAvailable: true,
      initialStatus: opts.initialStatus ?? 'COMPLETED',
    });
  }

  /** Provider-ready deposit flow */
  async initiateDeposit(userId: string, amount: number, providerReference?: string, idempotencyKey?: string) {
    const parsed = parseAmount(amount);
    const provider = getPaymentProvider();

    const providerResult = await provider.initiateDeposit({
      userId,
      amount: parsed,
      currency: 'USD',
      idempotencyKey,
    });

    const ref = providerReference ?? providerResult.providerReference;
    const isSandbox = env.wallet.sandboxMode;

    if (isSandbox) {
      return this.credit(userId, parsed, 'SANDBOX_CREDIT', {
        description: 'Sandbox deposit — NOT real money',
        referenceType: 'sandbox_deposit',
        referenceId: ref,
        idempotencyKey,
        metadata: { sandbox: true, provider: provider.name, providerResult },
      });
    }

    if (providerResult.status === 'completed') {
      return this.credit(userId, parsed, 'DEPOSIT', {
        description: 'Deposit completed',
        referenceType: 'deposit',
        referenceId: ref,
        idempotencyKey,
        metadata: { provider: provider.name },
      });
    }

    return this.credit(userId, parsed, 'DEPOSIT', {
      description: 'Deposit initiated — pending confirmation',
      referenceType: 'deposit',
      referenceId: ref,
      idempotencyKey,
      metadata: { provider: provider.name, stage: 'pending' },
      initialStatus: 'PENDING',
    });
  }

  /** Provider-ready withdrawal flow */
  async initiateWithdrawal(userId: string, amount: number, destination?: string, idempotencyKey?: string) {
    const parsed = parseAmount(amount);
    const provider = getPaymentProvider();

    const providerResult = await provider.initiateWithdrawal({
      userId,
      amount: parsed,
      currency: 'USD',
      destination,
      idempotencyKey,
    });

    const ref = providerResult.providerReference;
    const isSandbox = env.wallet.sandboxMode;

    if (isSandbox) {
      return this.debit(userId, parsed, 'SANDBOX_DEBIT', {
        description: 'Sandbox withdrawal — NOT real money',
        referenceType: 'sandbox_withdrawal',
        referenceId: ref,
        idempotencyKey,
        metadata: { sandbox: true, destination, provider: provider.name },
      });
    }

    if (providerResult.status === 'completed') {
      return this.debit(userId, parsed, 'WITHDRAWAL', {
        description: 'Withdrawal completed',
        referenceType: 'withdrawal',
        referenceId: ref,
        idempotencyKey,
        metadata: { destination, provider: provider.name },
      });
    }

    return this.debit(userId, parsed, 'WITHDRAWAL', {
      description: 'Withdrawal initiated — pending processing',
      referenceType: 'withdrawal',
      referenceId: ref,
      idempotencyKey,
      metadata: { destination, provider: provider.name, stage: 'pending' },
      initialStatus: 'PENDING',
    });
  }

  async sandboxCredit(userId: string, amount: number, actorId: string, note?: string) {
    if (!env.wallet.sandboxMode) {
      throw new ForbiddenError('Sandbox wallet mode is disabled');
    }

    const parsed = parseAmount(amount);
    if (parsed > env.wallet.sandboxMaxCredit) {
      throw new WalletError(`Sandbox credit cannot exceed ${env.wallet.sandboxMaxCredit}`);
    }

    const result = await this.credit(userId, parsed, 'SANDBOX_CREDIT', {
      description: note ?? 'Development sandbox credit',
      referenceType: 'sandbox',
      metadata: { note, sandbox: true },
    });

    await auditService.log({
      actorId,
      action: 'WALLET_SANDBOX_CREDIT',
      targetType: 'wallet',
      targetId: result.walletId,
      after: { amount: parsed, userId, note },
    });

    return { ...result, sandbox: true };
  }

  async gameDebit(userId: string, amount: number, sessionId: string, betId?: string, idempotencyKey?: string) {
    return this.debit(userId, amount, 'GAME_DEBIT', {
      description: 'Game bet debit',
      referenceType: 'game_session',
      referenceId: sessionId,
      idempotencyKey,
      metadata: { betId, sessionId },
    });
  }

  async gameCredit(userId: string, amount: number, sessionId: string, betId?: string, idempotencyKey?: string) {
    return this.credit(userId, amount, 'GAME_CREDIT', {
      description: 'Game win credit',
      referenceType: 'game_session',
      referenceId: sessionId,
      idempotencyKey,
      metadata: { betId, sessionId },
    });
  }

  async recordPlatformFee(userId: string, amount: number, roundId: string, idempotencyKey?: string) {
    return this.credit(userId, amount, 'PLATFORM_FEE', {
      description: 'Platform fee from dice round',
      referenceType: 'dice_round',
      referenceId: roundId,
      idempotencyKey,
      metadata: { roundId },
    });
  }

  async lockFunds(userId: string, amount: number, referenceType: string, referenceId: string, idempotencyKey?: string) {
    return this.lock(userId, amount, {
      referenceType,
      referenceId,
      idempotencyKey,
      description: 'Funds locked for bet',
    });
  }

  async unlockFunds(userId: string, amount: number, referenceType: string, referenceId: string, idempotencyKey?: string) {
    return this.unlock(userId, amount, {
      referenceType,
      referenceId,
      idempotencyKey,
    });
  }

  private formatTransaction(tx: {
    id: string;
    type: WalletTransactionType;
    status: WalletTransactionStatus;
    amount: Prisma.Decimal;
    balanceAfter: Prisma.Decimal;
    availableAfter: Prisma.Decimal;
    lockedAfter: Prisma.Decimal;
    description: string | null;
    referenceType: string | null;
    referenceId: string | null;
    createdAt: Date;
    processedAt: Date | null;
    metadata: unknown;
  }) {
    return {
      id: tx.id,
      type: tx.type,
      status: tx.status,
      amount: decimalToString(tx.amount),
      balanceAfter: decimalToString(tx.balanceAfter),
      availableAfter: decimalToString(tx.availableAfter),
      lockedAfter: decimalToString(tx.lockedAfter),
      description: tx.description,
      referenceType: tx.referenceType,
      referenceId: tx.referenceId,
      metadata: tx.metadata as Record<string, unknown> | null,
      createdAt: tx.createdAt.toISOString(),
      processedAt: tx.processedAt?.toISOString() ?? null,
    };
  }

  private async executeTransaction(opts: {
    userId: string;
    amount: number;
    type: WalletTransactionType;
    description?: string;
    referenceType?: string;
    referenceId?: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
    creditAvailable?: boolean;
    debitAvailable?: boolean;
    lockFunds?: boolean;
    unlockFunds?: boolean;
    initialStatus?: WalletTransactionStatus;
  }) {
    if (opts.amount <= 0) {
      throw new WalletError('Amount must be positive');
    }

    if (opts.idempotencyKey) {
      const existing = await prisma.walletTransaction.findUnique({
        where: { idempotencyKey: opts.idempotencyKey },
      });
      if (existing) {
        return {
          transactionId: existing.id,
          walletId: existing.walletId,
          status: existing.status,
          amount: decimalToString(existing.amount),
          balance: decimalToString(existing.balanceAfter),
          availableBalance: decimalToString(existing.availableAfter),
          lockedBalance: decimalToString(existing.lockedAfter),
        };
      }
    }

    return prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: opts.userId } });
      if (!wallet) throw new NotFoundError('Wallet not found');

      const amount = new Prisma.Decimal(opts.amount);
      const balanceBefore = wallet.balance;
      const availableBefore = wallet.availableBalance;
      const lockedBefore = wallet.lockedBalance;

      let balanceAfter = balanceBefore;
      let availableAfter = availableBefore;
      let lockedAfter = lockedBefore;

      if (opts.creditAvailable) {
        balanceAfter = balanceBefore.add(amount);
        availableAfter = availableBefore.add(amount);
      } else if (opts.debitAvailable) {
        if (availableBefore.lessThan(amount)) {
          throw new WalletError('Insufficient available balance');
        }
        balanceAfter = balanceBefore.sub(amount);
        availableAfter = availableBefore.sub(amount);
      } else if (opts.lockFunds) {
        if (availableBefore.lessThan(amount)) {
          throw new WalletError('Insufficient available balance to lock');
        }
        availableAfter = availableBefore.sub(amount);
        lockedAfter = lockedBefore.add(amount);
      } else if (opts.unlockFunds) {
        if (lockedBefore.lessThan(amount)) {
          throw new WalletError('Insufficient locked balance to unlock');
        }
        lockedAfter = lockedBefore.sub(amount);
        availableAfter = availableBefore.add(amount);
      }

      if (balanceAfter.lessThan(0)) {
        throw new WalletError('Operation would result in negative balance');
      }
      if (availableAfter.lessThan(0)) {
        throw new WalletError('Operation would result in negative available balance');
      }
      if (lockedAfter.lessThan(0)) {
        throw new WalletError('Operation would result in negative locked balance');
      }

      const status = opts.initialStatus ?? 'COMPLETED';

      const updated = await tx.wallet.update({
        where: { id: wallet.id, version: wallet.version },
        data: {
          balance: balanceAfter,
          availableBalance: availableAfter,
          lockedBalance: lockedAfter,
          version: { increment: 1 },
        },
      });

      if (!updated) {
        throw new WalletError('Concurrent wallet modification detected, please retry');
      }

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: opts.type,
          status,
          amount,
          balanceBefore,
          balanceAfter,
          availableBefore,
          availableAfter,
          lockedBefore,
          lockedAfter,
          currency: wallet.currency,
          description: opts.description,
          referenceType: opts.referenceType,
          referenceId: opts.referenceId,
          idempotencyKey: opts.idempotencyKey,
          metadata: opts.metadata as Prisma.InputJsonValue,
          processedAt: status === 'COMPLETED' ? new Date() : null,
        },
      });

      return {
        transactionId: transaction.id,
        walletId: wallet.id,
        status: transaction.status,
        amount: decimalToString(transaction.amount),
        balance: decimalToString(balanceAfter),
        availableBalance: decimalToString(availableAfter),
        lockedBalance: decimalToString(lockedAfter),
      };
    });
  }
}

export const walletService = new WalletService();
