import { Router } from 'express';
import { z } from 'zod';
import { roomService } from '../modules/rooms/room.service.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { successResponse } from '../lib/response.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const gameId = req.query.gameId as string | undefined;
    const rooms = await roomService.list({ gameId });
    res.json(successResponse(rooms));
  } catch (err) {
    next(err);
  }
});

router.get('/:code', async (req, res, next) => {
  try {
    const room = await roomService.getByCode(req.params.code);
    res.json(successResponse(room));
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  gameId: z.string(),
  name: z.string().min(1).max(50),
  maxPlayers: z.number().int().min(2).max(100),
  minBet: z.number().positive().optional(),
  maxBet: z.number().positive().optional(),
  isPrivate: z.boolean().optional(),
});

router.post('/', authenticate, validateBody(createSchema), async (req, res, next) => {
  try {
    const room = await roomService.create({
      ...req.body,
      hostUserId: req.user!.userId,
    });
    res.status(201).json(successResponse(room));
  } catch (err) {
    next(err);
  }
});

export default router;
