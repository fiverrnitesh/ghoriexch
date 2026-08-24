import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  dicePlayLockPrisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

/** Dedicated connection so PLAY DICE advisory lock/unlock always share the same session. */
export const dicePlayLockPrisma =
  globalForPrisma.dicePlayLockPrisma ??
  new PrismaClient({
    log: ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.dicePlayLockPrisma = dicePlayLockPrisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await Promise.all([prisma.$disconnect(), dicePlayLockPrisma.$disconnect()]);
}
