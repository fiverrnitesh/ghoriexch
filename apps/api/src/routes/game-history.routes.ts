import { Router } from 'express';
import { z } from 'zod';
import { gameHistoryService } from '../modules/game-history/game-history.service.js';
import { authenticate } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { successResponse, paginate } from '../lib/response.js';

const router = Router();

router.use(authenticate);

const listSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  gameSlug: z.string().optional(),
  status: z.enum(['PENDING', 'ACCEPTED', 'LOCKED', 'WON', 'LOST', 'PUSH', 'REFUNDED', 'CANCELLED', 'SETTLED']).optional(),
});

router.get('/', validateQuery(listSchema), async (req, res, next) => {
  try {
    const query = req.query as z.infer<typeof listSchema>;
    const result = await gameHistoryService.listForUser(req.user!.userId, query);
    res.json(successResponse(paginate(result.items, result.total, result.page, result.pageSize)));
  } catch (err) {
    next(err);
  }
});

router.get('/summary', async (req, res, next) => {
  try {
    const summary = await gameHistoryService.getSummary(req.user!.userId);
    res.json(successResponse(summary));
  } catch (err) {
    next(err);
  }
});

export default router;
