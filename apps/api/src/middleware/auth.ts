import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../lib/errors.js';
import { prisma } from '../database/client.js';
import type { RoleName } from '@games/shared';
import { isAdmin } from '@games/shared';

export interface AuthPayload {
  userId: string;
  email: string;
  roles: RoleName[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, env.jwt.secret) as AuthPayload;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    const cookieToken = req.cookies?.[env.jwt.cookieName];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : cookieToken;

    if (!token) {
      throw new UnauthorizedError('Authentication required');
    }

    const payload = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { roles: { include: { role: true } } },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Account inactive or not found');
    }

    req.user = {
      userId: user.id,
      email: user.email,
      roles: user.roles.map((r) => r.role.name as RoleName),
    };

    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
    } else {
      next(new UnauthorizedError('Invalid or expired token'));
    }
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const cookieToken = req.cookies?.[env.jwt.cookieName];
  const token = header?.startsWith('Bearer ') ? header.slice(7) : cookieToken;

  if (!token) {
    next();
    return;
  }

  authenticate(req, _res, next).catch(() => next());
}

export function requireRoles(...roles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }

    const hasRole = roles.some((role) => req.user!.roles.includes(role));
    if (!hasRole) {
      next(new UnauthorizedError('Insufficient permissions'));
      return;
    }

    next();
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user || !isAdmin(req.user.roles)) {
    next(new UnauthorizedError('Admin access required'));
    return;
  }
  next();
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.roles.includes('SUPER_ADMIN')) {
    next(new UnauthorizedError('Super admin access required'));
    return;
  }
  next();
}
