import { Router } from 'express';
import { z } from 'zod';
import { walletService } from '../modules/wallet/wallet.service.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { walletRateLimiter, financialRateLimiter } from '../middleware/rate-limit.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { successResponse, paginate } from '../lib/response.js';
import { env } from '../config/env.js';
import { IDEMPOTENCY_HEADER } from '@games/shared';

const router = Router();

router.use(authenticate);
router.use(walletRateLimiter);

router.get('/', async (req, res, next) => {
  try {
    const balance = await walletService.getBalance(req.user!.userId);
    res.json(successResponse(balance));
  } catch (err) {
    next(err);
  }
});

router.get('/environment', (_req, res) => {
  res.json(
    successResponse({
      sandbox: env.wallet.sandboxMode,
      label: env.wallet.sandboxMode ? 'SANDBOX' : 'LIVE',
      warning: env.wallet.sandboxMode
        ? 'You are in SANDBOX mode. All balances are simulated — NOT real money.'
        : 'Live wallet environment.',
      depositEnabled: true,
      withdrawalEnabled: true,
    }),
  );
});

const txQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  type: z.enum([
    'DEPOSIT', 'WITHDRAWAL', 'GAME_DEBIT', 'GAME_CREDIT', 'REFUND',
    'LOCK', 'UNLOCK', 'SANDBOX_CREDIT', 'SANDBOX_DEBIT',
  ]).optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED']).optional(),
});

router.get('/transactions', validateQuery(txQuerySchema), async (req, res, next) => {
  try {
    const query = req.query as z.infer<typeof txQuerySchema>;
    const result = await walletService.getTransactions(req.user!.userId, query);
    res.json(successResponse(paginate(result.items, result.total, result.page, result.pageSize)));
  } catch (err) {
    next(err);
  }
});

const depositSchema = z.object({
  amount: z.number().positive().max(1000000),
  currency: z.string().optional(),
  providerReference: z.string().optional(),
});

router.post(
  '/deposit',
  financialRateLimiter,
  idempotencyMiddleware,
  validateBody(depositSchema),
  async (req, res, next) => {
    try {
      const key = req.headers[IDEMPOTENCY_HEADER.toLowerCase()] as string | undefined;
      const result = await walletService.initiateDeposit(
        req.user!.userId,
        req.body.amount,
        req.body.providerReference,
        key,
      );
      res.status(201).json(
        successResponse({
          ...result,
          sandbox: env.wallet.sandboxMode,
          warning: env.wallet.sandboxMode ? 'SANDBOX deposit — not real money' : undefined,
        }),
      );
    } catch (err) {
      next(err);
    }
  },
);

const withdrawalSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().optional(),
  destination: z.string().max(200).optional(),
});

router.post(
  '/withdraw',
  financialRateLimiter,
  idempotencyMiddleware,
  validateBody(withdrawalSchema),
  async (req, res, next) => {
    try {
      const key = req.headers[IDEMPOTENCY_HEADER.toLowerCase()] as string | undefined;
      const result = await walletService.initiateWithdrawal(
        req.user!.userId,
        req.body.amount,
        req.body.destination,
        key,
      );
      res.status(201).json(
        successResponse({
          ...result,
          sandbox: env.wallet.sandboxMode,
          warning: env.wallet.sandboxMode ? 'SANDBOX withdrawal — not real money' : undefined,
        }),
      );
    } catch (err) {
      next(err);
    }
  },
);

const sandboxSchema = z.object({
  amount: z.number().positive(),
  note: z.string().max(200).optional(),
});

router.post(
  '/sandbox/credit',
  financialRateLimiter,
  idempotencyMiddleware,
  validateBody(sandboxSchema),
  async (req, res, next) => {
    try {
      if (!env.wallet.sandboxMode) {
        res.status(403).json({ success: false, error: { code: 'SANDBOX_DISABLED', message: 'Sandbox mode disabled' } });
        return;
      }
      const key = req.headers[IDEMPOTENCY_HEADER.toLowerCase()] as string | undefined;
      const result = await walletService.sandboxCredit(
        req.user!.userId,
        req.body.amount,
        req.user!.userId,
        req.body.note,
      );
      res.status(201).json(
        successResponse({
          ...result,
          sandbox: true,
          warning: 'DEVELOPMENT ONLY — not real money',
          idempotencyKey: key,
        }),
      );
    } catch (err) {
      next(err);
    }
  },
);

export default router;
