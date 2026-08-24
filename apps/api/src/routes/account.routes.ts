import { Router } from 'express';
import { z } from 'zod';
import { profileService } from '../modules/users/profile.service.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { authRateLimiter } from '../middleware/rate-limit.js';
import { successResponse } from '../lib/response.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const account = await profileService.getAccount(req.user!.userId);
    res.json(successResponse(account));
  } catch (err) {
    next(err);
  }
});

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

router.patch('/profile', validateBody(updateProfileSchema), async (req, res, next) => {
  try {
    const account = await profileService.updateProfile(req.user!.userId, req.body);
    res.json(successResponse(account));
  } catch (err) {
    next(err);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

router.post('/change-password', authRateLimiter, validateBody(changePasswordSchema), async (req, res, next) => {
  try {
    await profileService.changePassword(req.user!.userId, req.body);
    res.json(successResponse({ changed: true }));
  } catch (err) {
    next(err);
  }
});

const settingsSchema = z.object({
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
  hideBalance: z.boolean().optional(),
});

router.patch('/settings', validateBody(settingsSchema), async (req, res, next) => {
  try {
    const account = await profileService.updateSettings(req.user!.userId, req.body);
    res.json(successResponse(account));
  } catch (err) {
    next(err);
  }
});

export default router;
