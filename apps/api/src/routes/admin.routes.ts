import { Router } from 'express';
import { z } from 'zod';
import { userService } from '../modules/users/user.service.js';
import { gameService } from '../modules/games/game.service.js';
import { roomService } from '../modules/rooms/room.service.js';
import { sessionService } from '../modules/sessions/session.service.js';
import { bettingService } from '../modules/betting/betting.service.js';
import { botService } from '../modules/bots/bot.service.js';
import { auditService } from '../modules/audit/audit.service.js';
import { walletService } from '../modules/wallet/wallet.service.js';
import { gameHistoryService } from '../modules/game-history/game-history.service.js';
import { adminDashboardService } from '../modules/admin/admin-dashboard.service.js';
import { testModeService } from '../modules/admin/test-mode.service.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { successResponse, paginate } from '../lib/response.js';
import { paramString } from '../lib/utils.js';
import { env } from '../config/env.js';

const router = Router();
router.use(authenticate, requireAdmin);

// ─── Dashboard ───────────────────────────────────────────────────────────────

router.get('/dashboard', async (_req, res, next) => {
  try {
    const stats = await adminDashboardService.getStats();
    res.json(successResponse(stats));
  } catch (err) {
    next(err);
  }
});

// ─── Users ───────────────────────────────────────────────────────────────────

const userListQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING_VERIFICATION']).optional(),
});

router.get('/users', validateQuery(userListQuery), async (req, res, next) => {
  try {
    const q = req.query as z.infer<typeof userListQuery>;
    const result = await userService.adminList(q.page, q.pageSize, q.status, q.search);
    res.json(successResponse(paginate(result.items, result.total, result.page, result.pageSize)));
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await userService.getUserDetail(paramString(req.params.id));
    res.json(successResponse(user));
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id/transactions', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const result = await userService.getUserTransactions(paramString(req.params.id), page);
    res.json(successResponse(paginate(result.items, result.total, result.page, result.pageSize)));
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id/game-history', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const result = await gameHistoryService.listForUser(paramString(req.params.id), { page });
    res.json(successResponse(paginate(result.items, result.total, result.page, result.pageSize)));
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id/sessions', async (req, res, next) => {
  try {
    const sessions = await userService.getUserActiveSessions(paramString(req.params.id));
    res.json(successResponse(sessions));
  } catch (err) {
    next(err);
  }
});

const statusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING_VERIFICATION']) });

router.patch('/users/:id/status', validateBody(statusSchema), async (req, res, next) => {
  try {
    const user = await userService.updateStatus(paramString(req.params.id), req.body.status, req.user!.userId);
    res.json(successResponse(user));
  } catch (err) {
    next(err);
  }
});

const userSettingsSchema = z.object({
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
  hideBalance: z.boolean().optional(),
});

router.patch('/users/:id/settings', validateBody(userSettingsSchema), async (req, res, next) => {
  try {
    await userService.updateUserSettings(paramString(req.params.id), req.body, req.user!.userId);
    const user = await userService.getUserDetail(paramString(req.params.id));
    res.json(successResponse(user));
  } catch (err) {
    next(err);
  }
});

// ─── Wallets & Transactions ──────────────────────────────────────────────────

router.get('/wallets', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const result = await userService.adminWalletOverview(page);
    res.json(successResponse(paginate(
      result.items.map((w) => ({
        id: w.id,
        userId: w.userId,
        currency: w.currency,
        balance: w.balance.toString(),
        availableBalance: w.availableBalance.toString(),
        lockedBalance: w.lockedBalance.toString(),
        user: w.user,
      })),
      result.total,
      result.page,
      result.pageSize,
    )));
  } catch (err) {
    next(err);
  }
});

const txQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  userId: z.string().optional(),
});

router.get('/transactions', validateQuery(txQuery), async (req, res, next) => {
  try {
    const q = req.query as z.infer<typeof txQuery>;
    const result = await userService.adminTransactions(q.page, q.pageSize, q);
    res.json(successResponse(paginate(result.items, result.total, result.page, result.pageSize)));
  } catch (err) {
    next(err);
  }
});

const sandboxAdminSchema = z.object({
  userId: z.string(),
  amount: z.number().positive(),
  note: z.string().optional(),
});

router.post('/wallet/sandbox-credit', validateBody(sandboxAdminSchema), async (req, res, next) => {
  try {
    const result = await walletService.sandboxCredit(
      req.body.userId,
      req.body.amount,
      req.user!.userId,
      req.body.note,
    );
    res.json(successResponse({ ...result, warning: 'SANDBOX credit — not real money' }));
  } catch (err) {
    next(err);
  }
});

// ─── Games ───────────────────────────────────────────────────────────────────

router.get('/games', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const result = await gameService.adminList(page);
    res.json(successResponse(paginate(result.items, result.total, result.page, result.pageSize)));
  } catch (err) {
    next(err);
  }
});

router.get('/games/:id', async (req, res, next) => {
  try {
    const game = await gameService.adminGetGame(paramString(req.params.id));
    res.json(successResponse(game));
  } catch (err) {
    next(err);
  }
});

const gameUpdateSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'MAINTENANCE', 'DISABLED', 'ARCHIVED']).optional(),
  minPlayers: z.number().int().positive().optional(),
  maxPlayers: z.number().int().positive().optional(),
  minBet: z.number().nonnegative().nullable().optional(),
  maxBet: z.number().nonnegative().nullable().optional(),
  version: z.string().optional(),
  description: z.string().optional(),
});

router.patch('/games/:id', validateBody(gameUpdateSchema), async (req, res, next) => {
  try {
    const game = await gameService.adminUpdateGame(paramString(req.params.id), req.body, req.user!.userId);
    res.json(successResponse(game));
  } catch (err) {
    next(err);
  }
});

const configSchema = z.object({
  key: z.string(),
  value: z.record(z.unknown()),
});

router.put('/games/:gameId/config', validateBody(configSchema), async (req, res, next) => {
  try {
    const config = await gameService.updateConfiguration(
      paramString(req.params.gameId),
      req.body.key,
      req.body.value,
      req.user!.userId,
    );
    res.json(successResponse(config));
  } catch (err) {
    next(err);
  }
});

// ─── Rooms ───────────────────────────────────────────────────────────────────

router.get('/rooms', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const gameId = req.query.gameId as string | undefined;
    const status = req.query.status as string | undefined;
    const result = await roomService.adminListAll(page, 50, { gameId, status });
    res.json(successResponse(paginate(result.items, result.total, result.page, result.pageSize)));
  } catch (err) {
    next(err);
  }
});

router.get('/rooms/live-dice', async (_req, res, next) => {
  try {
    const rooms = await roomService.adminListLiveDice();
    res.json(successResponse(rooms));
  } catch (err) {
    next(err);
  }
});

router.get('/rooms/:id', async (req, res, next) => {
  try {
    const room = await roomService.adminGetById(paramString(req.params.id));
    res.json(successResponse(room));
  } catch (err) {
    next(err);
  }
});

router.post('/rooms/:id/close', async (req, res, next) => {
  try {
    const room = await roomService.close(paramString(req.params.id), req.user!.userId);
    res.json(successResponse(room));
  } catch (err) {
    next(err);
  }
});

// ─── Sessions ────────────────────────────────────────────────────────────────

router.get('/sessions', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const result = await sessionService.listActive(page);
    res.json(successResponse(paginate(result.items, result.total, result.page, result.pageSize)));
  } catch (err) {
    next(err);
  }
});

router.get('/sessions/:id', async (req, res, next) => {
  try {
    const session = await sessionService.adminGetSession(paramString(req.params.id));
    res.json(successResponse(session));
  } catch (err) {
    next(err);
  }
});

// ─── Bets ────────────────────────────────────────────────────────────────────

const betQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  status: z.string().optional(),
  gameId: z.string().optional(),
  userId: z.string().optional(),
});

router.get('/bets', validateQuery(betQuery), async (req, res, next) => {
  try {
    const q = req.query as z.infer<typeof betQuery>;
    const result = await bettingService.adminList(q.page, 20, q);
    res.json(successResponse(paginate(result.items, result.total, result.page, result.pageSize)));
  } catch (err) {
    next(err);
  }
});

// ─── Bots ────────────────────────────────────────────────────────────────────

router.get('/bots', async (req, res, next) => {
  try {
    const gameId = req.query.gameId as string | undefined;
    const bots = await botService.list(gameId);
    res.json(successResponse(bots));
  } catch (err) {
    next(err);
  }
});

const botSchema = z.object({
  gameId: z.string(),
  name: z.string().min(1),
  avatarUrl: z.string().url().optional(),
  config: z.record(z.unknown()).optional(),
});

router.post('/bots', validateBody(botSchema), async (req, res, next) => {
  try {
    const bot = await botService.create({ ...req.body, actorId: req.user!.userId });
    res.status(201).json(successResponse(bot));
  } catch (err) {
    next(err);
  }
});

const botUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']).optional(),
  config: z.record(z.unknown()).optional(),
});

router.patch('/bots/:id', validateBody(botUpdateSchema), async (req, res, next) => {
  try {
    const bot = await botService.update(paramString(req.params.id), { ...req.body, actorId: req.user!.userId });
    res.json(successResponse(bot));
  } catch (err) {
    next(err);
  }
});

// ─── Audit Logs ──────────────────────────────────────────────────────────────

const auditQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  action: z.string().optional(),
  actorId: z.string().optional(),
});

router.get('/audit-logs', validateQuery(auditQuery), async (req, res, next) => {
  try {
    const q = req.query as z.infer<typeof auditQuery>;
    const result = await auditService.list({
      page: q.page,
      pageSize: q.pageSize,
      action: q.action as never,
      actorId: q.actorId,
    });
    res.json(successResponse(paginate(
      result.items.map((log) => ({
        id: log.id,
        action: log.action,
        actor: log.actor,
        targetType: log.targetType,
        targetId: log.targetId,
        before: log.before,
        after: log.after,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
      })),
      result.total,
      result.page,
      result.pageSize,
    )));
  } catch (err) {
    next(err);
  }
});

// ─── Admin Test Mode (development only) ──────────────────────────────────────

router.get('/test/status', (_req, res) => {
  res.json(successResponse({
    enabled: env.admin.testModeEnabled,
    sandboxWallet: env.wallet.sandboxMode,
    environment: env.nodeEnv,
    warning: env.admin.testModeEnabled
      ? 'TEST MODE ACTIVE — controls only work on sessions marked isTestMode=true'
      : 'Test mode disabled. Set ADMIN_TEST_MODE=true in development.',
  }));
});

const testSessionSchema = z.object({
  gameSlug: z.string(),
  hostUserId: z.string(),
});

router.post('/test/sessions', validateBody(testSessionSchema), async (req, res, next) => {
  try {
    const session = await testModeService.createTestSession(
      req.body.gameSlug,
      req.body.hostUserId,
      req.user!.userId,
    );
    res.status(201).json(successResponse({ ...session, warning: 'TEST SESSION — not real-money gameplay' }));
  } catch (err) {
    next(err);
  }
});

const forceResultSchema = z.object({ result: z.record(z.unknown()) });

router.post('/test/sessions/:id/force-result', validateBody(forceResultSchema), async (req, res, next) => {
  try {
    const result = await testModeService.forceResult(
      paramString(req.params.id),
      req.body.result,
      req.user!.userId,
    );
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

const simulateSchema = z.object({
  betId: z.string(),
  outcome: z.enum(['WIN', 'LOSS', 'PUSH', 'BLANK', 'REFUND']),
  payout: z.number().positive().optional(),
});

router.post('/test/sessions/:id/simulate', validateBody(simulateSchema), async (req, res, next) => {
  try {
    const result = await testModeService.simulateOutcome(
      paramString(req.params.id),
      req.body.betId,
      req.body.outcome,
      req.user!.userId,
      req.body.payout,
    );
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

const testWalletSchema = z.object({
  userId: z.string(),
  operation: z.enum(['credit', 'debit']),
  amount: z.number().positive(),
  note: z.string().optional(),
});

router.post('/test/wallet-adjust', validateBody(testWalletSchema), async (req, res, next) => {
  try {
    const result = await testModeService.testWalletAdjust(
      req.body.userId,
      req.body.operation,
      req.body.amount,
      req.user!.userId,
      req.body.note,
    );
    res.json(successResponse({ ...result, warning: 'SANDBOX test adjustment — not real money' }));
  } catch (err) {
    next(err);
  }
});

const forceDiceSchema = z.object({
  die1: z.enum(['1', '3', '4', '6', 'BLANK']),
  die2: z.enum(['1', '3', '4', '6', 'BLANK']),
});

router.post('/test/sessions/:id/force-dice', validateBody(forceDiceSchema), async (req, res, next) => {
  try {
    const result = await testModeService.forceDiceOutcome(
      paramString(req.params.id),
      [req.body.die1, req.body.die2],
      req.user!.userId,
    );
    res.json(successResponse({ ...result, warning: 'TEST MODE — forced dice outcome for next roll' }));
  } catch (err) {
    next(err);
  }
});

export default router;
