-- AlterEnum
ALTER TYPE "WalletTransactionType" ADD VALUE 'PLATFORM_FEE';

-- AlterTable
ALTER TABLE "dice_rounds" ADD COLUMN "holderStake" DECIMAL(18,4),
ADD COLUMN "opponentStake" DECIMAL(18,4),
ADD COLUMN "matchedPool" DECIMAL(18,4),
ADD COLUMN "adminFee" DECIMAL(18,4),
ADD COLUMN "winnerPayout" DECIMAL(18,4),
ADD COLUMN "settlementId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "dice_rounds_settlementId_key" ON "dice_rounds"("settlementId");
