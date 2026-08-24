import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { globalRateLimiter } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { successResponse } from './lib/response.js';

import authRoutes from './routes/auth.routes.js';
import walletRoutes from './routes/wallet.routes.js';
import gamesRoutes from './routes/games.routes.js';
import roomsRoutes from './routes/rooms.routes.js';
import sessionsRoutes from './routes/sessions.routes.js';
import betsRoutes from './routes/bets.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import adminRoutes from './routes/admin.routes.js';
import accountRoutes from './routes/account.routes.js';
import gameHistoryRoutes from './routes/game-history.routes.js';
import diceRoutes from './routes/dice.routes.js';
import demoRoutes from './routes/demo.routes.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.api.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(globalRateLimiter);

  app.get('/health', (_req, res) => {
    res.json(
      successResponse({
        status: 'ok',
        environment: env.nodeEnv,
        sandboxMode: env.wallet.sandboxMode,
        timestamp: new Date().toISOString(),
      }),
    );
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/demo', demoRoutes);
  app.use('/api/account', accountRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/game-history', gameHistoryRoutes);
  app.use('/api/dice', diceRoutes);
  app.use('/api/games', gamesRoutes);
  app.use('/api/rooms', roomsRoutes);
  app.use('/api/sessions', sessionsRoutes);
  app.use('/api/bets', betsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
