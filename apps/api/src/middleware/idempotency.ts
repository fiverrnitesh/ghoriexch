import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { IDEMPOTENCY_HEADER } from '@games/shared';
import { prisma } from '../database/client.js';
import { IdempotencyError } from '../lib/errors.js';

const IDEMPOTENCY_TTL_HOURS = 24;

export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers[IDEMPOTENCY_HEADER.toLowerCase()] as string | undefined;

  if (!key) {
    next();
    return;
  }

  const endpoint = `${req.method}:${req.path}`;
  const requestHash = createHash('sha256')
    .update(JSON.stringify({ body: req.body, query: req.query }))
    .digest('hex');

  void (async () => {
    const existing = await prisma.idempotencyRecord.findUnique({ where: { key } });

    if (existing) {
      if (existing.requestHash && existing.requestHash !== requestHash) {
        next(new IdempotencyError('Idempotency key reused with different request payload'));
        return;
      }

      if (existing.expiresAt < new Date()) {
        await prisma.idempotencyRecord.delete({ where: { key } });
      } else {
        res.status(existing.responseStatus).json(existing.responseBody);
        return;
      }
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      void prisma.idempotencyRecord
        .create({
          data: {
            key,
            userId: req.user?.userId,
            endpoint,
            requestHash,
            responseStatus: res.statusCode,
            responseBody: body as object,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000),
          },
        })
        .catch(() => {});

      return originalJson(body);
    };

    next();
  })().catch(next);
}

export async function cleanupExpiredIdempotencyRecords(): Promise<number> {
  const result = await prisma.idempotencyRecord.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
