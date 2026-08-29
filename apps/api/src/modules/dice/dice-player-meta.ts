import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/client.js';
import { decimalToString } from '../../lib/utils.js';
import type { DiceGameState } from '@games/game-engine';

export async function getDicePlayerMeta(state: DiceGameState | Prisma.JsonValue | null) {
  if (!state || typeof state !== 'object') return {};
  const gameState = state as DiceGameState;
  const userIds = gameState.seats
    .map((s) => (s.occupant?.type === 'USER' ? s.occupant.userId : null))
    .filter(Boolean) as string[];

  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        include: { wallet: true },
      })
    : [];

  const meta: Record<string, { displayName: string; balance: string; currency: string; avatarUrl: string | null }> = {};

  for (const u of users) {
    meta[u.id] = {
      displayName: u.displayName ?? u.username,
      balance: u.wallet ? decimalToString(u.wallet.availableBalance) : '0',
      currency: u.wallet?.currency ?? 'USD',
      avatarUrl: u.avatarUrl,
    };
  }

  for (const seat of gameState.seats) {
    const occ = seat.occupant;
    if (occ?.type === 'BOT' && occ.botId) {
      const publicId = `player_${occ.botId}`;
      const entry = {
        displayName: occ.name === 'TIGER' ? 'Shoot' : (occ.name ?? 'Shoot'),
        balance: '25000',
        currency: 'USD',
        avatarUrl: occ.avatarUrl ?? `https://api.dicebear.com/7.x/personas/svg?seed=${occ.botId}`,
      };
      meta[occ.botId] = entry;
      meta[publicId] = entry;
    }
  }

  return meta;
}
