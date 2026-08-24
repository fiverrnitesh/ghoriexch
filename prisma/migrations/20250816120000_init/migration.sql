-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'GAME_DEBIT', 'GAME_CREDIT', 'REFUND', 'LOCK', 'UNLOCK', 'SANDBOX_CREDIT', 'SANDBOX_DEBIT');

-- CreateEnum
CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('DRAFT', 'ACTIVE', 'MAINTENANCE', 'DISABLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GameSessionStatus" AS ENUM ('WAITING', 'STARTING', 'IN_PROGRESS', 'SETTLING', 'COMPLETED', 'CANCELLED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "GamePlayerStatus" AS ENUM ('JOINED', 'READY', 'PLAYING', 'SPECTATING', 'LEFT', 'DISCONNECTED', 'KICKED');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('OPEN', 'FULL', 'IN_GAME', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BetStatus" AS ENUM ('PENDING', 'ACCEPTED', 'LOCKED', 'WON', 'LOST', 'PUSH', 'REFUNDED', 'CANCELLED', 'SETTLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SYSTEM', 'WALLET', 'GAME', 'PROMOTION', 'SECURITY');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BotStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_CREATE', 'USER_UPDATE', 'USER_SUSPEND', 'USER_BAN', 'ROLE_ASSIGN', 'ROLE_REVOKE', 'WALLET_ADJUST', 'WALLET_SANDBOX_CREDIT', 'GAME_CREATE', 'GAME_UPDATE', 'GAME_CONFIG_UPDATE', 'ROOM_CREATE', 'ROOM_CLOSE', 'BOT_CREATE', 'BOT_UPDATE', 'SESSION_FORCE_CLOSE', 'BET_VOID', 'SYSTEM_CONFIG');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" "RoleName" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "balance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "availableBalance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lockedBalance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(18,4) NOT NULL,
    "balanceBefore" DECIMAL(18,4) NOT NULL,
    "balanceAfter" DECIMAL(18,4) NOT NULL,
    "availableBefore" DECIMAL(18,4) NOT NULL,
    "availableAfter" DECIMAL(18,4) NOT NULL,
    "lockedBefore" DECIMAL(18,4) NOT NULL,
    "lockedAfter" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "category" TEXT,
    "provider" TEXT,
    "minPlayers" INTEGER NOT NULL DEFAULT 1,
    "maxPlayers" INTEGER NOT NULL DEFAULT 10,
    "status" "GameStatus" NOT NULL DEFAULT 'DRAFT',
    "thumbnailUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_configurations" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_sessions" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "roomId" TEXT,
    "status" "GameSessionStatus" NOT NULL DEFAULT 'WAITING',
    "roundNumber" INTEGER NOT NULL DEFAULT 0,
    "serverSeedHash" TEXT,
    "serverSeed" TEXT,
    "clientSeed" TEXT,
    "nonce" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_players" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seatIndex" INTEGER,
    "status" "GamePlayerStatus" NOT NULL DEFAULT 'JOINED',
    "state" JSONB NOT NULL DEFAULT '{}',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "hostUserId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'OPEN',
    "maxPlayers" INTEGER NOT NULL,
    "minBet" DECIMAL(18,4),
    "maxBet" DECIMAL(18,4),
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bets" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sessionId" TEXT,
    "roomId" TEXT,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "BetStatus" NOT NULL DEFAULT 'PENDING',
    "selection" JSONB,
    "payout" DECIMAL(18,4),
    "odds" DECIMAL(10,4),
    "settledAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bet_participants" (
    "id" TEXT NOT NULL,
    "betId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "share" DECIMAL(5,4) NOT NULL DEFAULT 1,
    "amount" DECIMAL(18,4) NOT NULL,
    "payout" DECIMAL(18,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bet_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bots" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BotStatus" NOT NULL DEFAULT 'INACTIVE',
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");

-- CreateIndex
CREATE INDEX "wallets_userId_idx" ON "wallets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotencyKey_key" ON "wallet_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "wallet_transactions_walletId_createdAt_idx" ON "wallet_transactions"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_transactions_type_status_idx" ON "wallet_transactions"("type", "status");

-- CreateIndex
CREATE INDEX "wallet_transactions_referenceType_referenceId_idx" ON "wallet_transactions"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "games_slug_key" ON "games"("slug");

-- CreateIndex
CREATE INDEX "games_status_sortOrder_idx" ON "games"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "games_category_idx" ON "games"("category");

-- CreateIndex
CREATE INDEX "game_configurations_gameId_isActive_idx" ON "game_configurations"("gameId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "game_configurations_gameId_key_key" ON "game_configurations"("gameId", "key");

-- CreateIndex
CREATE INDEX "game_sessions_gameId_status_idx" ON "game_sessions"("gameId", "status");

-- CreateIndex
CREATE INDEX "game_sessions_roomId_idx" ON "game_sessions"("roomId");

-- CreateIndex
CREATE INDEX "game_sessions_createdAt_idx" ON "game_sessions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "game_players_sessionId_userId_key" ON "game_players"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "game_players_sessionId_status_idx" ON "game_players"("sessionId", "status");

-- CreateIndex
CREATE INDEX "game_players_userId_idx" ON "game_players"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_code_key" ON "rooms"("code");

-- CreateIndex
CREATE INDEX "rooms_gameId_status_idx" ON "rooms"("gameId", "status");

-- CreateIndex
CREATE INDEX "rooms_code_idx" ON "rooms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bets_idempotencyKey_key" ON "bets"("idempotencyKey");

-- CreateIndex
CREATE INDEX "bets_userId_status_idx" ON "bets"("userId", "status");

-- CreateIndex
CREATE INDEX "bets_sessionId_idx" ON "bets"("sessionId");

-- CreateIndex
CREATE INDEX "bets_gameId_createdAt_idx" ON "bets"("gameId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "bet_participants_betId_userId_key" ON "bet_participants"("betId", "userId");

-- CreateIndex
CREATE INDEX "bet_participants_userId_idx" ON "bet_participants"("userId");

-- CreateIndex
CREATE INDEX "notifications_userId_status_createdAt_idx" ON "notifications"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "bots_gameId_status_idx" ON "bots"("gameId", "status");

-- CreateIndex
CREATE INDEX "admin_audit_logs_actorId_createdAt_idx" ON "admin_audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_createdAt_idx" ON "admin_audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_targetType_targetId_idx" ON "admin_audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_key_key" ON "idempotency_records"("key");

-- CreateIndex
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_configurations" ADD CONSTRAINT "game_configurations_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet_participants" ADD CONSTRAINT "bet_participants_betId_fkey" FOREIGN KEY ("betId") REFERENCES "bets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet_participants" ADD CONSTRAINT "bet_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bots" ADD CONSTRAINT "bots_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
