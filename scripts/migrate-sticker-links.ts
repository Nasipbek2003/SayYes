/**
 * Перевод ссылок на стикеры в уже созданных приглашениях с локальных файлов на
 * Cloudinary.
 *
 *   npx tsx scripts/migrate-sticker-links.ts --dry-run   # только посмотреть
 *   npx tsx scripts/migrate-sticker-links.ts             # переписать
 *
 * Зачем: в `Invitation.data` сохранены строки вида `/Cat/6.webp` — это путь к
 * файлу в папке `public`. Пока такие ссылки есть, локальные файлы удалять
 * нельзя, иначе у старых приглашений пропадут картинки.
 *
 * Соответствие строится от локальных файлов: имя файла → тот же слаг, что
 * использовал загрузчик (`slugifyFileName`) → `publicId` в каталоге. Поэтому
 * скрипт не угадывает, а сверяется с базой: если стикера в каталоге нет, ссылка
 * остаётся нетронутой.
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { prisma } from '../lib/prisma';
import { getCloudinaryConfig } from '../lib/settings/appConfig';
import { STICKER_WIDTHS, buildStickerUrl } from '../lib/storage/stickerUrl';
import { slugifyFileName } from '../lib/storage/stickers';

const dryRun = process.argv.includes('--dry-run');

/** Папки в public → слаг категории (как в загрузчике). */
const DIRS: Array<{ dir: string; category: string }> = [
  { dir: 'Bear', category: 'bear' },
  { dir: 'Cat', category: 'cat' },
];

/**
 * Карта «старая локальная ссылка → новая ссылка Cloudinary».
 *
 * Для каждого файла кладём два варианта ключа: с URL-кодированием (так их писал
 * прежний код) и без — на случай, если в данных сохранился «сырой» путь.
 */
async function buildUrlMap(cloudName: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const rows = await prisma.sticker.findMany();
  const byPublicId = new Map(rows.map((row) => [row.publicId, row]));
  const { uploadFolder } = await getCloudinaryConfig();

  for (const { dir, category } of DIRS) {
    let files: string[];
    try {
      files = await readdir(join(process.cwd(), 'public', dir));
    } catch {
      continue;
    }

    for (const file of files) {
      if (!/\.(webp|png|jpe?g|gif|webm|mp4)$/i.test(file)) continue;

      const publicId = `${uploadFolder}/stickers/${category}/${slugifyFileName(file)}`;
      const row = byPublicId.get(publicId);
      if (!row) {
        console.log(`  ! ${dir}/${file}: нет в каталоге (publicId ${publicId}) — пропускаю`);
        continue;
      }

      // Та же логика ширины, что в каталоге: маленькие файлы не пережимаем.
      const width =
        row.width !== null && row.width <= STICKER_WIDTHS.screen
          ? undefined
          : STICKER_WIDTHS.screen;
      const url = buildStickerUrl(cloudName, row.publicId, row.kind, { width });

      map.set(`/${dir}/${encodeURIComponent(file)}`, url);
      map.set(`/${dir}/${file}`, url);
    }
  }

  return map;
}

/** Заменить все совпавшие строки в произвольном JSON. Возвращает число замен. */
function replaceDeep(value: unknown, map: Map<string, string>): { value: unknown; count: number } {
  if (typeof value === 'string') {
    const replacement = map.get(value);
    return replacement ? { value: replacement, count: 1 } : { value, count: 0 };
  }

  if (Array.isArray(value)) {
    let count = 0;
    const next = value.map((item) => {
      const result = replaceDeep(item, map);
      count += result.count;
      return result.value;
    });
    return { value: next, count };
  }

  if (value && typeof value === 'object') {
    let count = 0;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const result = replaceDeep(item, map);
      count += result.count;
      next[key] = result.value;
    }
    return { value: next, count };
  }

  return { value, count: 0 };
}

async function main(): Promise<void> {
  const { cloudName } = await getCloudinaryConfig();
  if (!cloudName) {
    console.error('Cloudinary не настроен — нечего подставлять.');
    process.exit(1);
  }

  console.log('Строю соответствие локальных файлов и каталога…');
  const map = await buildUrlMap(cloudName);
  console.log(`Готово: ${map.size / 2} файлов сопоставлено\n`);

  const invitations = await prisma.invitation.findMany({
    select: { id: true, data: true, templateId: true },
  });

  let touched = 0;
  let replacements = 0;
  /** Снимок «до» — правим пользовательский контент, откат должен быть возможен. */
  const backup: Array<{ id: string; data: unknown }> = [];

  for (const invitation of invitations) {
    const result = replaceDeep(invitation.data, map);
    if (result.count === 0) continue;

    touched += 1;
    replacements += result.count;
    backup.push({ id: invitation.id, data: invitation.data });
    console.log(
      `${dryRun ? '[план]' : '✓'} ${invitation.id} (${invitation.templateId}): ссылок ${result.count}`,
    );

    if (!dryRun) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { data: result.value as never },
      });
    }
  }

  if (!dryRun && backup.length > 0) {
    const dir = join(process.cwd(), 'backups');
    await mkdir(dir, { recursive: true });
    const file = join(dir, `sticker-links-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await writeFile(file, JSON.stringify(backup, null, 2), 'utf8');
    console.log(`\nРезервная копия исходных данных: ${file}`);
  }

  console.log(
    `\nПриглашений всего: ${invitations.length}, затронуто: ${touched}, ссылок заменено: ${replacements}`,
  );
  if (dryRun) console.log('(режим --dry-run: изменения не сохранены)');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
