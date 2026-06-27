-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "notifyTelegram" TEXT;

-- CreateTable
CREATE TABLE "TelegramContact" (
    "username" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramContact_pkey" PRIMARY KEY ("username")
);
