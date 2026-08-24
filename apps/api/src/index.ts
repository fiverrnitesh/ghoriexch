import { createServer } from 'node:http';
import { createApp } from './app.js';
import { createRealtimeServer } from './realtime/socket.server.js';
import { connectDatabase, disconnectDatabase } from './database/client.js';
import { env } from './config/env.js';
import { gameRegistry } from '@games/game-engine';
import { registerGamePlugins } from './games/register-games.js';
import { initializeDiceTurnTimers } from './modules/dice/dice.plugin.js';
import { diceSimulationService } from './modules/dice/dice-simulation.service.js';

async function main() {
  await connectDatabase();
  registerGamePlugins();
  await gameRegistry.initializeAll();
  await initializeDiceTurnTimers();

  if (env.isDev) {
    try {
      const sim = await diceSimulationService.ensureSimulationRoom();
      console.log(`   DEV sim room ready: ${sim.roomCode} (${sim.playerCount}/10 players)`);
    } catch (err) {
      console.warn('DEV simulation room init failed:', err);
    }
  }

  const app = createApp();
  const httpServer = createServer(app);
  const io = createRealtimeServer(httpServer);

  httpServer.listen(env.api.port, env.api.host, () => {
    console.log(`\n🎰 Games Platform API`);
    console.log(`   REST:  http://localhost:${env.api.port}`);
    console.log(`   WS:    ws://localhost:${env.api.port}`);
    console.log(`   Env:   ${env.nodeEnv}`);
    console.log(`   Sandbox wallet: ${env.wallet.sandboxMode ? 'ENABLED (dev only)' : 'disabled'}\n`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    io.close();
    httpServer.close();
    await gameRegistry.shutdownAll();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start API server:', err);
  process.exit(1);
});
