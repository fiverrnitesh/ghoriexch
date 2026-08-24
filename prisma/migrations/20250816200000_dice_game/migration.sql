-- Dice game tables

CREATE TYPE "SideBetPrediction" AS ENUM ('WIN', 'LOSS');
CREATE TYPE "SideBetStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WON', 'LOST', 'CANCELLED', 'REFUNDED');

CREATE TABLE IF NOT EXISTS "side_bets" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "roundNumber" INTEGER NOT NULL,
  "roundId" TEXT NOT NULL,
  "backerUserId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "prediction" "SideBetPrediction" NOT NULL,
  "amount" DECIMAL(18,4) NOT NULL,
  "status" "SideBetStatus" NOT NULL DEFAULT 'PENDING',
  "walletLockRef" TEXT,
  "betId" TEXT,
  "idempotencyKey" TEXT,
  "expiresAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "side_bets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "side_bets_idempotencyKey_key" ON "side_bets"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "side_bets_sessionId_roundNumber_idx" ON "side_bets"("sessionId", "roundNumber");
CREATE INDEX IF NOT EXISTS "side_bets_targetUserId_status_idx" ON "side_bets"("targetUserId", "status");

ALTER TABLE "side_bets" ADD CONSTRAINT "side_bets_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "dice_rounds" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "roomId" TEXT,
  "roundNumber" INTEGER NOT NULL,
  "roundId" TEXT NOT NULL,
  "holderUserId" TEXT,
  "holderBotId" TEXT,
  "opponentUserId" TEXT,
  "opponentBotId" TEXT,
  "die1" TEXT NOT NULL,
  "die2" TEXT NOT NULL,
  "hasBlank" BOOLEAN NOT NULL DEFAULT false,
  "playerChoice" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "winnerUserId" TEXT,
  "winnerBotId" TEXT,
  "mainBetAmount" DECIMAL(18,4),
  "mainBetPayout" DECIMAL(18,4),
  "serverSeedHash" TEXT,
  "nonce" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "dice_rounds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dice_rounds_roundId_key" ON "dice_rounds"("roundId");
CREATE INDEX IF NOT EXISTS "dice_rounds_sessionId_roundNumber_idx" ON "dice_rounds"("sessionId", "roundNumber");

ALTER TABLE "dice_rounds" ADD CONSTRAINT "dice_rounds_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
