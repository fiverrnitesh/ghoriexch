import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { successResponse, paginate } from '../lib/response.js';
import { paramString } from '../lib/utils.js';
import { diceMatchmakingService } from '../modules/dice/dice-matchmaking.service.js';
import { diceService } from '../modules/dice/dice.service.js';
import { ensureDiceTurnTimer } from '../modules/dice/dice.plugin.js';
import { sessionService } from '../modules/sessions/session.service.js';
import { roomService } from '../modules/rooms/room.service.js';
import { prisma } from '../database/client.js';
import { NotFoundError, ConflictError } from '../lib/errors.js';
import { DICE_ACTIONS } from '@games/game-engine';
import { idempotencyMiddleware } from '../middleware/idempotency.js';

const router = Router();

const createRoomSchema = z.object({
  name: z.string().trim().min(1, 'Room name is required').max(64),
  gameMode: z.enum(['ONLINE', 'FRIENDS']),
});

router.get('/rounds', authenticate, async (req, res, next) => {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;
    const result = await diceService.listRoundHistory(req.user!.userId, page, pageSize);
    res.json(successResponse(paginate(result.items, result.total, result.page, result.pageSize)));
  } catch (err) {
    next(err);
  }
});

router.get('/rooms', authenticate, async (_req, res, next) => {
  try {
    res.json(successResponse([]));
  } catch (err) {
    next(err);
  }
});

router.post('/play', authenticate, async (req, res, next) => {
  try {
    const result = await diceMatchmakingService.play(req.user!.userId);
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

router.get('/sessions/:sessionId', authenticate, async (req, res, next) => {
  try {
    const sessionId = paramString(req.params.sessionId);
    await ensureDiceTurnTimer(sessionId);
    const state = await diceService.getPublicState(sessionId);
    res.json(successResponse(state));
  } catch (err) {
    next(err);
  }
});

router.post('/rooms', authenticate, validateBody(createRoomSchema), async (req, res, next) => {
  try {
    const game = await prisma.game.findUnique({ where: { slug: 'dice' } });
    if (!game || game.status !== 'ACTIVE') throw new NotFoundError('Dice game not available');

    const { name, gameMode } = req.body as z.infer<typeof createRoomSchema>;
    const room = await roomService.create({
      gameId: game.id,
      hostUserId: req.user!.userId,
      name,
      gameMode,
      maxPlayers: game.maxPlayers,
      minBet: game.minBet ? parseFloat(game.minBet.toString()) : undefined,
      maxBet: game.maxBet ? parseFloat(game.maxBet.toString()) : undefined,
      isPrivate: gameMode === 'FRIENDS',
    });

    const session = await sessionService.createSession('dice', req.user!.userId, room.id);
    await sessionService.joinSession(session.id, req.user!.userId);
    res.status(201).json(successResponse({ room, session }));
  } catch (err) {
    next(err);
  }
});

router.post('/rooms/:roomId/request-join', authenticate, async (req, res, next) => {
  try {
    const result = await roomService.requestFriendsJoin(paramString(req.params.roomId), req.user!.userId);
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

router.post('/rooms/:roomId/admission/:userId/accept', authenticate, async (req, res, next) => {
  try {
    const roomId = paramString(req.params.roomId);
    const targetUserId = paramString(req.params.userId);
    const result = await roomService.resolveFriendsAdmission(roomId, req.user!.userId, targetUserId, true);

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        sessions: {
          where: { status: { in: ['WAITING', 'IN_PROGRESS'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    let session = room?.sessions[0];
    if (!session) {
      const created = await sessionService.createSession('dice', req.user!.userId, roomId);
      await sessionService.joinSession(created.id, targetUserId);
      res.json(successResponse({ ...result, sessionId: created.id }));
      return;
    }
    await sessionService.joinSession(session.id, targetUserId);

    res.json(successResponse({ ...result, sessionId: session.id }));
  } catch (err) {
    next(err);
  }
});

router.post('/rooms/:roomId/admission/:userId/reject', authenticate, async (req, res, next) => {
  try {
    const result = await roomService.resolveFriendsAdmission(
      paramString(req.params.roomId),
      req.user!.userId,
      paramString(req.params.userId),
      false,
    );
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

router.post('/rooms/:roomId/join', authenticate, async (req, res, next) => {
  try {
    const roomId = paramString(req.params.roomId);
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        game: true,
        sessions: {
          where: { status: { in: ['WAITING', 'IN_PROGRESS'] }, isTestMode: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!room || room.game.slug !== 'dice' || room.status !== 'OPEN') {
      throw new NotFoundError('Dice room not available');
    }

    const meta = room.metadata as { gameMode?: string; acceptedParticipantIds?: string[] };
    if (meta.gameMode === 'FRIENDS') {
      if (!meta.acceptedParticipantIds?.includes(req.user!.userId)) {
        throw new ConflictError('Join request must be accepted by the host first');
      }
    }

    let sessionId = room.sessions[0]?.id;
    if (!sessionId) {
      const session = await sessionService.createSession('dice', req.user!.userId, room.id);
      sessionId = session.id;
    }

    const session = await sessionService.joinSession(sessionId, req.user!.userId);
    res.json(successResponse({ room: await roomService.getByCode(room.code), session }));
  } catch (err) {
    next(err);
  }
});

const actionSchema = z.object({
  action: z.string(),
  payload: z.record(z.unknown()).default({}),
});

router.post(
  '/sessions/:sessionId/action',
  authenticate,
  idempotencyMiddleware,
  validateBody(actionSchema),
  async (req, res, next) => {
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
  },
);

router.post('/sessions/:sessionId/opponent-match/accept', authenticate, idempotencyMiddleware, async (req, res, next) => {
  try {
    const result = await sessionService.processAction(
      paramString(req.params.sessionId),
      req.user!.userId,
      DICE_ACTIONS.ACCEPT_OPPONENT_MATCH,
      req.body ?? {},
    );
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:sessionId/side-bets/:id/accept', authenticate, async (req, res, next) => {
  try {
    const amount = typeof req.body?.amount === 'number' ? req.body.amount : undefined;
    const result = await sessionService.processAction(
      paramString(req.params.sessionId),
      req.user!.userId,
      DICE_ACTIONS.ACCEPT_SIDE_BET,
      { sideBetId: paramString(req.params.id), ...(amount != null ? { amount } : {}) },
    );
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:sessionId/side-bets/:id/reject', authenticate, async (req, res, next) => {
  try {
    const result = await sessionService.processAction(
      paramString(req.params.sessionId),
      req.user!.userId,
      DICE_ACTIONS.REJECT_SIDE_BET,
      { sideBetId: paramString(req.params.id) },
    );
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

export { DICE_ACTIONS };
export default router;
