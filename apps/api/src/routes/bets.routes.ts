import { Router } from 'express';
import { bettingService } from '../modules/betting/betting.service.js';
import { authenticate } from '../middleware/auth.js';
import { successResponse, paginate } from '../lib/response.js';

const router = Router();

router.use(authenticate);

router.get('/history', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const result = await bettingService.getUserBets(req.user!.userId, page, pageSize);
    res.json(successResponse(paginate(result.items, result.total, result.page, result.pageSize)));
  } catch (err) {
    next(err);
  }
});

export default router;
