-- CreateEnum
CREATE TYPE "PaymentPlan" AS ENUM ('SINGLE', 'MONTHLY');

-- AlterTable: Payment — план, автор, валюта, id транзакции провайдера
ALTER TABLE "Payment" ADD COLUMN "authorId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "plan" "PaymentPlan" NOT NULL DEFAULT 'SINGLE';
ALTER TABLE "Payment" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'KGS';
ALTER TABLE "Payment" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "paidAt" TIMESTAMP(3);

-- Заполняем authorId для уже существующих платежей из приглашения
UPDATE "Payment" p
SET "authorId" = i."authorId"
FROM "Invitation" i
WHERE p."invitationId" = i."id" AND p."authorId" IS NULL;

-- Платежи без приглашения-владельца удалять нельзя, но и оставить без автора тоже:
-- на этом этапе таких строк быть не может (invitationId был NOT NULL UNIQUE).
ALTER TABLE "Payment" ALTER COLUMN "authorId" SET NOT NULL;

-- invitationId становится необязательным и неуникальным:
-- подписка не привязана к одному приглашению, а платежей у приглашения может
-- быть несколько (повторная попытка оплаты).
DROP INDEX IF EXISTS "Payment_invitationId_key";
ALTER TABLE "Payment" ALTER COLUMN "invitationId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Payment_invitationId_idx" ON "Payment"("invitationId");
CREATE INDEX "Payment_authorId_idx" ON "Payment"("authorId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subscription_authorId_idx" ON "Subscription"("authorId");
CREATE INDEX "Subscription_expiresAt_idx" ON "Subscription"("expiresAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
