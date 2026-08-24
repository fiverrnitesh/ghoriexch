import { Router } from 'express';
import { z } from 'zod';
import { authService } from '../modules/auth/auth.service.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { authRateLimiter } from '../middleware/rate-limit.js';
import { successResponse } from '../lib/response.js';
import { env } from '../config/env.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/),
  password: z.string().min(8).max(128),
  displayName: z.string().max(50).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', authRateLimiter, validateBody(registerSchema), async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.cookie(env.jwt.cookieName, result.token, {
      httpOnly: true,
      secure: env.isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.status(201).json(successResponse({ user: result.user, accessToken: result.token }));
  } catch (err) {
    next(err);
  }
});

router.post('/login', authRateLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.cookie(env.jwt.cookieName, result.token, {
      httpOnly: true,
      secure: env.isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json(successResponse({ user: result.user, accessToken: result.token }));
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(env.jwt.cookieName);
  res.json(successResponse({ loggedOut: true }));
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const profile = await authService.getProfile(req.user!.userId);
    res.json(successResponse(profile));
  } catch (err) {
    next(err);
  }
});

export default router;
