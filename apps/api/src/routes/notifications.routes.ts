import { Router } from 'express';
import { notificationService } from '../modules/notifications/notification.service.js';
import { authenticate } from '../middleware/auth.js';
import { successResponse, paginate } from '../lib/response.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const result = await notificationService.list(req.user!.userId, page, pageSize);
    res.json(successResponse(paginate(result.items, result.total, result.page, result.pageSize)));
  } catch (err) {
    next(err);
  }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    const count = await notificationService.unreadCount(req.user!.userId);
    res.json(successResponse({ count }));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    await notificationService.markRead(req.user!.userId, req.params.id);
    res.json(successResponse({ read: true }));
  } catch (err) {
    next(err);
  }
});

export default router;
