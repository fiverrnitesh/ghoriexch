import { Router } from 'express';
import { z } from 'zod';
import { sessionService } from '../modules/sessions/session.service.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { successResponse } from '../lib/response.js';
import { paramString } from '../lib/utils.js';

const router = Router();

router.use(authenticate);

router.get('/:sessionId', async (req, res, next) => {
  try {
    const session = await sessionService.getSession(paramString(req.params.sessionId));
    res.json(successResponse(session));
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  gameSlug: z.string(),
  roomId: z.string().optional(),
});

router.post('/', validateBody(createSchema), async (req, res, next) => {
  try {
    const session = await sessionService.createSession(
      req.body.gameSlug,
      req.user!.userId,
      req.body.roomId,
    );
    res.status(201).json(successResponse(session));
  } catch (err) {
    next(err);
  }
});

const joinSchema = z.object({
  seatIndex: z.number().int().optional(),
});

router.post('/:sessionId/join', validateBody(joinSchema), async (req, res, next) => {
  try {
    const session = await sessionService.joinSession(
      paramString(req.params.sessionId),
      req.user!.userId,
      req.body.seatIndex,
    );
    res.json(successResponse(session));
  } catch (err) {
    next(err);
  }
});

router.post('/:sessionId/leave', async (req, res, next) => {
  try {
    const result = await sessionService.leaveSession(paramString(req.params.sessionId), req.user!.userId);
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

const actionSchema = z.object({
  action: z.string(),
  payload: z.record(z.unknown()).default({}),
});

router.post('/:sessionId/action', validateBody(actionSchema), async (req, res, next) => {
  try {
    const result = await sessionService.processAction(
      paramString(req.params.sessionId),
      req.user!.userId,
      req.body.action,
      req.body.payload,
    );
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

export default router;
