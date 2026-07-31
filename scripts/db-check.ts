/**
 * Диагностика подключения к БД: несколько последовательных попыток запроса.
 *
 * Полезно, когда приложение падает с `PrismaClientInitializationError`
 * («Can't reach database server»): скрипт показывает, недоступна база вообще или
 * проблема плавающая (например, у serverless-Postgres «холодный старт» после
 * авто-остановки compute).
 *
 *   npx tsx scripts/db-check.ts
 */
import { prisma } from '../lib/prisma';

async function attempt(index: number): Promise<boolean> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(`попытка ${index}: ok за ${Date.now() - started} мс`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    console.log(`попытка ${index}: ОШИБКА за ${Date.now() - started} мс — ${message}`);
    return false;
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  console.log('DATABASE_URL задан:', Boolean(url));
  console.log('параметры строки подключения:', url.split('?')[1] ?? '(нет)');

  let ok = 0;
  for (let i = 1; i <= 5; i += 1) {
    if (await attempt(i)) ok += 1;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.log(`итог: ${ok}/5 успешных`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
