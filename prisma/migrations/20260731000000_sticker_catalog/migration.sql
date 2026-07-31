-- CreateEnum: тип файла стикера (влияет на URL Cloudinary: image/ или video/)
CREATE TYPE "StickerKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable: каталог стикеров. Сами файлы в Cloudinary, здесь только ссылки.
CREATE TABLE "Sticker" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT,
    "kind" "StickerKind" NOT NULL DEFAULT 'IMAGE',
    "publicId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sticker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sticker_publicId_key" ON "Sticker"("publicId");
CREATE INDEX "Sticker_category_sortOrder_idx" ON "Sticker"("category", "sortOrder");
CREATE INDEX "Sticker_hidden_idx" ON "Sticker"("hidden");
