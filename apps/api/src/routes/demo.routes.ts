import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { successResponse } from '../lib/response.js';
import { paramString } from '../lib/utils.js';
import { diceDemoService } from '../modules/dice/dice-demo.service.js';
import { diceSimulationService } from '../modules/dice/dice-simulation.service.js';
import { env } from '../config/env.js';

const router = Router();

router.use((_req, res, next) => {
  if (!env.isDev) {
    res.status(404).json({ success: false, error: 'Not found' });
    return;
  }
  next();
});

router.get('/status', (_req, res) => {
  res.json(successResponse(diceDemoService.getStatus()));
});

const loginSchema = z.object({ email: z.string().email() });

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await diceDemoService.demoLogin(req.body.email);
    res.json(successResponse({
      user: result.user,
      accessToken: result.token,
      warning: 'DEVELOPMENT DEMO LOGIN — sandbox only',
    }));
  } catch (err) {
    next(err);
  }
});

router.post('/room', authenticate, async (req, res, next) => {
  try {
    const result = await diceDemoService.getOrCreateDemoRoom(req.user!.userId);
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

const fillSchema = z.object({
  preset: z.enum(['2', '4', '6', 'full']),
});

router.post('/sessions/:sessionId/fill', authenticate, validateBody(fillSchema), async (req, res, next) => {
  try {
    const state = await diceDemoService.fillSession(paramString(req.params.sessionId), req.body.preset);
    res.json(successResponse(state));
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:sessionId/add-players', authenticate, async (req, res, next) => {
  try {
    const state = await diceDemoService.addDemoPlayers(paramString(req.params.sessionId));
    res.json(successResponse(state));
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:sessionId/start-round', authenticate, async (req, res, next) => {
  try {
    const state = await diceDemoService.startRound(paramString(req.params.sessionId));
    res.json(successResponse(state));
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:sessionId/force-main-bet', authenticate, async (req, res, next) => {
  try {
    const state = await diceDemoService.forceMainBet(paramString(req.params.sessionId));
    res.json(successResponse(state));
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:sessionId/simulate-side-bet', authenticate, async (req, res, next) => {
  try {
    const state = await diceDemoService.simulateSideBet(paramString(req.params.sessionId));
    res.json(successResponse(state));
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:sessionId/reset-table', authenticate, async (req, res, next) => {
  try {
    const result = await diceDemoService.resetSessionTable(paramString(req.params.sessionId), req.user!.userId);
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

router.post('/reset-balances', authenticate, async (_req, res, next) => {
  try {
    const result = await diceDemoService.resetDemoBalances();
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

const simConfigSchema = z.object({
  opponentAcceptRate: z.number().min(0).max(1).optional(),
  timeoutRate: z.number().min(0).max(1).optional(),
  sideBetParticipationRate: z.number().min(0).max(1).optional(),
  sideBetAcceptRate: z.number().min(0).max(1).optional(),
  speed: z.enum(['normal', 'fast']).optional(),
  maxRounds: z.number().int().min(0).optional(),
  continuous: z.boolean().optional(),
});

router.get('/simulation/status', (_req, res) => {
  res.json(successResponse(diceSimulationService.getStatus()));
});

router.post('/simulation/room', authenticate, async (req, res, next) => {
  try {
    const result = await diceSimulationService.getOrCreateSimulationRoom(req.user!.userId);
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

router.get('/simulation/sessions/:sessionId/status', authenticate, async (req, res, next) => {
  try {
    const status = await diceSimulationService.getRunnerStatus(paramString(req.params.sessionId));
    res.json(successResponse(status));
  } catch (err) {
    next(err);
  }
});

router.post('/simulation/sessions/:sessionId/start', authenticate, validateBody(simConfigSchema), async (req, res, next) => {
  try {
    const result = await diceSimulationService.startSimulation(paramString(req.params.sessionId), req.body);
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

router.post('/simulation/sessions/:sessionId/stop', authenticate, async (req, res, next) => {
  try {
    const result = diceSimulationService.stopSimulation(paramString(req.params.sessionId));
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

export default router;
