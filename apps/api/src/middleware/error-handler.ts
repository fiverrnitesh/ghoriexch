import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';
import { errorResponse } from '../lib/response.js';
import { env } from '../config/env.js';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(errorResponse(err.code, err.message, err.details));
    return;
  }

  console.error('[API Error]', err);

  res.status(500).json(
    errorResponse(
      'INTERNAL_ERROR',
      env.isDev ? err.message : 'An unexpected error occurred',
    ),
  );
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json(errorResponse('NOT_FOUND', 'Route not found'));
}
