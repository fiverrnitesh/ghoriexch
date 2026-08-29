import { Router } from 'express';
import { z } from 'zod';
import { agentService } from '../modules/agent/agent.service.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { successResponse } from '../lib/response.js';

const router = Router();

const createDownlineSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6).max(128),
  roleName: z.enum([
    'COMPANY',
    'PANEL',
    'SUPER_ADMIN',
    'ADMIN',
    'SUPER_MASTER',
    'MASTER',
    'USER',
  ] as const).optional(),
  displayName: z.string().max(50).optional(),
  initialCoins: z.number().min(0).optional(),
});

const transferCoinsSchema = z.object({
  amount: z.number().positive(),
  direction: z.enum(['deposit', 'withdraw']),
});

const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6).max(128),
});

const downlinesQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  search: z.string().optional(),
});

router.use(authenticate);

router.get('/hierarchy-info', async (req, res, next) => {
  try {
    const info = await agentService.getHierarchyInfo(req.user!.userId);
    res.json(successResponse(info));
  } catch (err) {
    next(err);
  }
});

router.get('/downlines', validateQuery(downlinesQuerySchema), async (req, res, next) => {
  try {
    const q = req.query as unknown as { page: number; pageSize: number; search?: string };
    const result = await agentService.getDownlines(req.user!.userId, q.page, q.pageSize, q.search);
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

router.post('/downlines', validateBody(createDownlineSchema), async (req, res, next) => {
  try {
    const result = await agentService.createDownline(req.user!.userId, req.body);
    res.status(201).json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

router.post('/downlines/:id/transfer-coins', validateBody(transferCoinsSchema), async (req, res, next) => {
  try {
    const targetUserId = req.params.id as string;
    const result = await agentService.transferCoins(
      req.user!.userId,
      targetUserId,
      req.body.amount,
      req.body.direction
    );
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

router.patch('/downlines/:id/status', validateBody(updateStatusSchema), async (req, res, next) => {
  try {
    const targetUserId = req.params.id as string;
    const result = await agentService.updateDownlineStatus(
      req.user!.userId,
      targetUserId,
      req.body.status
    );
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

router.post('/downlines/:id/password', validateBody(resetPasswordSchema), async (req, res, next) => {
  try {
    const targetUserId = req.params.id as string;
    const result = await agentService.resetDownlinePassword(
      req.user!.userId,
      targetUserId,
      req.body.password
    );
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

export default router;
