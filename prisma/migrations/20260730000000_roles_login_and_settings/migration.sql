-- CreateEnum: роли пользователей (обычный / администратор панели)
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- AlterTable: логин и роль у автора.
-- Все существующие записи получают роль USER: право администратора выдаётся
-- только явно (скриптом scripts/create-admin.ts или вручную).
ALTER TABLE "Author" ADD COLUMN "login" TEXT;
ALTER TABLE "Author" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'USER';

-- CreateIndex
CREATE UNIQUE INDEX "Author_login_key" ON "Author"("login");
CREATE INDEX "Author_role_idx" ON "Author"("role");

-- CreateTable: настройки приложения (секреты хранятся зашифрованными)
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);
