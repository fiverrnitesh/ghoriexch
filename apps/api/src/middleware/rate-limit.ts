import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env.js';

function isLocalRequest(req: Request): boolean {
  const ip = req.ip ?? '';
  return ip === '127.0.0.1'
    || ip === '::1'
    || ip === '::ffff:127.0.0.1'
    || ip.endsWith('127.0.0.1');
}

export const globalRateLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.isDev ? Math.max(env.rateLimit.maxRequests, 2000) : env.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => env.isDev && isLocalRequest(req),
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isDev ? 200 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => env.isDev && isLocalRequest(req),
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts' },
  },
});

export const walletRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.isDev ? 300 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => env.isDev && isLocalRequest(req),
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many wallet operations' },
  },
});

export const financialRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.isDev ? 100 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => env.isDev && isLocalRequest(req),
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many financial operations' },
  },
});
