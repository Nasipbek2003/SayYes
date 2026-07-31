/**
 * Перенос стикеров из папки `public` в Cloudinary + заполнение каталога в БД.
 *
 *   npx tsx scripts/upload-stickers.ts            # перенести всё
 *   npx tsx scripts/upload-stickers.ts --dry-run  # только показать план
 *   npx tsx scripts/upload-stickers.ts --hero     # ещё и фоновое видео главной
 *
 * Идемпотентно: `public_id` строится из имени файла, повторный запуск
 * перезаписывает тот же объект и обновляет строку в базе.
 *
 * После переноса локальные файлы можно удалить — ссылки берутся из базы.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { prisma } from '../lib/prisma';
import { getCloudinaryConfig, SETTING_KEYS } from '../lib/settings/appConfig';
import { setSetting } from '../lib/settings/store';
import { pruneCategory, saveSticker, uploadSticker } from '../lib/storage/stickers';

/** Папка в `public` → слаг категории каталога. */
const CATEGORY_DIRS: Array<{ dir: string; category: string; label: string }> = [
  { dir: 'Bear', category: 'bear', label: '🐻 Мишка' },
  { dir: 'Cat', category: 'cat', label: '🐱 Котик' },
];

const dryRun = process.argv.includes('--dry-run');
const withHero = process.argv.includes('--hero');

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024).toLocaleString('ru-RU')} КБ`;
}

async function uploadDir(dir: string, category: string, label: string): Promise<void> {
  const path = join(process.cwd(), 'public', dir);
  let entries: string[];
  try {
    entries = await readdir(path);
  } catch {
    console.log(`— папка public/${dir} не найдена, пропускаю`);
    return;
  }

  const files = entries.filter((name) => /\.(webp|png|jpe?g|gif|webm|mp4)$/i.test(name));
  console.log(`\n${label} (public/${dir}): ${files.length} файлов`);

  let order = 0;
  const uploaded: string[] = [];

  for (const name of files) {
    const filePath = join(path, name);
    const info = await stat(filePath);
    order += 10;

    if (dryRun) {
      console.log(`  [план] ${name} — ${kb(info.size)}`);
      continue;
    }

    const buffer = await readFile(filePath);
    try {
      const asset = await uploadSticker(buffer, { fileName: name, category });
      await saveSticker(asset, { category, label, sortOrder: order });
      uploaded.push(asset.publicId);
      console.log(
        `  ✓ ${name} → ${asset.publicId} (${asset.kind === 'VIDEO' ? 'видео' : 'картинка'}, ${
          asset.bytes ? kb(asset.bytes) : '?'
        })`,
      );
    } catch (error) {
      console.log(`  ✗ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Записи, которых нет среди загруженных, — «сироты» от прежних запусков.
  if (!dryRun && uploaded.length > 0) {
    const pruned = await pruneCategory(category, uploaded);
    if (pruned > 0) console.log(`  … удалено устаревших записей: ${pruned}`);
  }
}

async function uploadHero(): Promise<void> {
  const filePath = join(process.cwd(), 'public', 'bg-hero.webm');
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    console.log('— public/bg-hero.webm не найден, пропускаю');
    return;
  }

  console.log(`\nФоновое видео главной: ${kb(buffer.byteLength)}`);
  if (dryRun) return;

  const asset = await uploadSticker(buffer, { fileName: 'bg-hero.webm', category: 'hero' });
  await setSetting(SETTING_KEYS.heroVideoPublicId, asset.publicId, {
    description: 'Cloudinary public_id фонового видео на главной',
  });
  console.log(`  ✓ ${asset.publicId} (${asset.bytes ? kb(asset.bytes) : '?'})`);
}

async function main(): Promise<void> {
  const config = await getCloudinaryConfig();
  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    console.error('Cloudinary не настроен: задайте доступы в админке или CLOUDINARY_URL в .env');
    process.exit(1);
  }
  console.log(`Облако: ${config.cloudName}, папка: ${config.uploadFolder}/stickers`);
  if (dryRun) console.log('(режим --dry-run: ничего не загружается)');

  for (const { dir, category, label } of CATEGORY_DIRS) {
    await uploadDir(dir, category, label);
  }
  if (withHero) await uploadHero();

  const total = await prisma.sticker.count();
  console.log(`\nВ каталоге стикеров: ${total}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
