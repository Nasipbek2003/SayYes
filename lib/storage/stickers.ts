/**
 * Каталог стикеров: чтение из БД и загрузка файлов в Cloudinary.
 *
 * Доступы к Cloudinary берутся из таблицы `Setting` (см. `appConfig`), поэтому
 * их можно менять из админки без редеплоя.
 *
 * Только серверный код: БД + подпись запросов через `node:crypto`.
 */
import { createHash } from 'node:crypto';

import type { Sticker, StickerKind } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getCloudinaryConfig, getHeroVideoPublicId } from '@/lib/settings/appConfig';

import { STICKER_WIDTHS, buildStickerUrl } from './stickerUrl';

/** Понятные подписи известных категорий; для новых — сам слаг. */
const CATEGORY_LABELS: Record<string, string> = {
  bear: '🐻 Мишка',
  cat: '🐱 Котик',
  hearts: '💕 Сердечки',
  flowers: '🌷 Цветы',
};

export interface StickerItem {
  id: string;
  /** Готовая ссылка для показа на экране приглашения. */
  url: string;
  /** Уменьшенная ссылка для плитки выбора. */
  thumbUrl: string;
  kind: StickerKind;
  publicId: string;
  sortOrder: number;
  hidden: boolean;
  bytes: number | null;
}

export interface StickerCategoryView {
  id: string;
  label: string;
  items: StickerItem[];
}

function toItem(row: Sticker, cloudName: string): StickerItem {
  // Если файл уже уже целевой ширины, преобразование размера не запрашиваем:
  // повторное кодирование такого стикера давало +5 КБ вместо экономии.
  const screenWidth =
    row.width !== null && row.width <= STICKER_WIDTHS.screen
      ? undefined
      : STICKER_WIDTHS.screen;

  return {
    id: row.id,
    url: buildStickerUrl(cloudName, row.publicId, row.kind, { width: screenWidth }),
    // Для видео в каталоге показываем статичный кадр: плитке анимация не нужна,
    // а трафик и лимиты видео-преобразований экономятся заметно.
    thumbUrl: buildStickerUrl(cloudName, row.publicId, row.kind, {
      width: STICKER_WIDTHS.thumb,
      poster: row.kind === 'VIDEO',
    }),
    kind: row.kind,
    publicId: row.publicId,
    sortOrder: row.sortOrder,
    hidden: row.hidden,
    bytes: row.bytes,
  };
}

/**
 * Каталог для формы создания: только видимые стикеры, сгруппированные по
 * категориям. Пустой массив означает, что каталог ещё не заполнен — форма в
 * этом случае откатывается на локальные файлы.
 */
export async function getStickerCatalog(): Promise<StickerCategoryView[]> {
  const { cloudName } = await getCloudinaryConfig();
  if (!cloudName) return [];

  const rows = await prisma.sticker.findMany({
    where: { hidden: false },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  const byCategory = new Map<string, { label: string; items: StickerItem[] }>();
  for (const row of rows) {
    const existing = byCategory.get(row.category);
    const label = row.label ?? CATEGORY_LABELS[row.category] ?? row.category;
    if (existing) {
      existing.items.push(toItem(row, cloudName));
    } else {
      byCategory.set(row.category, { label, items: [toItem(row, cloudName)] });
    }
  }

  return [...byCategory.entries()].map(([id, value]) => ({
    id,
    label: value.label,
    items: value.items,
  }));
}

/** Все стикеры для админки — включая скрытые. */
export async function listAllStickers(): Promise<StickerCategoryView[]> {
  const { cloudName } = await getCloudinaryConfig();
  const rows = await prisma.sticker.findMany({
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  const byCategory = new Map<string, { label: string; items: StickerItem[] }>();
  for (const row of rows) {
    const label = row.label ?? CATEGORY_LABELS[row.category] ?? row.category;
    const item = toItem(row, cloudName);
    const existing = byCategory.get(row.category);
    if (existing) existing.items.push(item);
    else byCategory.set(row.category, { label, items: [item] });
  }

  return [...byCategory.entries()].map(([id, value]) => ({
    id,
    label: value.label,
    items: value.items,
  }));
}

/* ============================================================
   Загрузка в Cloudinary
   ============================================================ */

/** Подпись загрузки: SHA-1 от отсортированных параметров + API secret. */
function sign(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex');
}

/**
 * Имя файла → безопасный отрезок `public_id`.
 *
 * Пробелы и мусор из имён вроде «From Klickpin.com- Wholesome…-pin-id-1069…»
 * ломают URL, поэтому имя приводится к слагу. Важная деталь: у таких имён
 * различается только длинный хвост, и простая обрезка давала **одинаковый** id —
 * файлы перезаписывали друг друга. Поэтому при обрезке добавляем короткий хэш
 * полного имени: id остаётся читаемым и при этом уникальным.
 */
export function slugifyFileName(fileName: string): string {
  const slug = fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length <= 48) return slug || 'sticker';

  const hash = createHash('sha1').update(fileName).digest('hex').slice(0, 8);
  return `${slug.slice(0, 40).replace(/-+$/, '')}-${hash}`;
}

export interface UploadedAsset {
  publicId: string;
  format: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  kind: StickerKind;
}

export class StickerUploadError extends Error {}

/**
 * Загрузить файл стикера в Cloudinary.
 *
 * `.webm` уходит в `video/upload` (Cloudinary считает его видео), остальное —
 * в `image/upload`. `public_id` задаём сами и предсказуемо: папка проекта →
 * `stickers` → категория → имя файла без расширения. Повторная загрузка того же
 * имени перезаписывает файл (`overwrite`), поэтому скрипт идемпотентен.
 */
export async function uploadSticker(
  buffer: Buffer,
  opts: { fileName: string; category: string; contentType?: string },
): Promise<UploadedAsset> {
  const { cloudName, apiKey, apiSecret, uploadFolder } = await getCloudinaryConfig();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new StickerUploadError('Cloudinary не настроен: заполните доступы в настройках.');
  }

  const isVideo = /\.webm$|\.mp4$|\.mov$/i.test(opts.fileName);
  const resource: 'image' | 'video' = isVideo ? 'video' : 'image';

  const baseName = slugifyFileName(opts.fileName);

  const folder = `${uploadFolder}/stickers/${opts.category}`;
  const publicId = `${folder}/${baseName || 'sticker'}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const signed = { overwrite: 'true', public_id: publicId, timestamp };
  const signature = sign(signed, apiSecret);

  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(buffer)], {
      type: opts.contentType ?? (isVideo ? 'video/webm' : 'application/octet-stream'),
    }),
  );
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('public_id', publicId);
  form.append('overwrite', 'true');
  form.append('signature', signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resource}/upload`,
    { method: 'POST', body: form },
  );

  if (!res.ok) {
    let message = `Cloudinary ответил ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* тело не JSON */
    }
    throw new StickerUploadError(message);
  }

  const body = (await res.json()) as {
    public_id?: string;
    format?: string;
    width?: number;
    height?: number;
    bytes?: number;
  };

  return {
    publicId: body.public_id ?? publicId,
    format: body.format ?? (isVideo ? 'webm' : 'webp'),
    width: body.width ?? null,
    height: body.height ?? null,
    bytes: body.bytes ?? null,
    kind: isVideo ? 'VIDEO' : 'IMAGE',
  };
}

/** Записать (или обновить) стикер в каталоге после успешной загрузки. */
export async function saveSticker(
  asset: UploadedAsset,
  opts: { category: string; label?: string | null; sortOrder?: number },
): Promise<Sticker> {
  return prisma.sticker.upsert({
    where: { publicId: asset.publicId },
    create: {
      category: opts.category,
      label: opts.label ?? null,
      kind: asset.kind,
      publicId: asset.publicId,
      format: asset.format,
      width: asset.width,
      height: asset.height,
      bytes: asset.bytes,
      sortOrder: opts.sortOrder ?? 0,
    },
    update: {
      category: opts.category,
      kind: asset.kind,
      format: asset.format,
      width: asset.width,
      height: asset.height,
      bytes: asset.bytes,
      ...(opts.label !== undefined ? { label: opts.label } : {}),
      ...(opts.sortOrder !== undefined ? { sortOrder: opts.sortOrder } : {}),
    },
  });
}

/** Показать или скрыть стикер в каталоге. */
export async function setStickerHidden(id: string, hidden: boolean): Promise<void> {
  await prisma.sticker.update({ where: { id }, data: { hidden } });
}

/** Удалить стикер из каталога (файл в Cloudinary остаётся). */
export async function deleteSticker(id: string): Promise<void> {
  await prisma.sticker.delete({ where: { id } }).catch(() => undefined);
}

/**
 * Удалить файл из Cloudinary по `publicId`. Best-effort: ошибки не бросаются,
 * чтобы чистка каталога не падала из-за одного объекта.
 */
export async function destroyAsset(
  publicId: string,
  kind: StickerKind,
): Promise<boolean> {
  const { cloudName, apiKey, apiSecret } = await getCloudinaryConfig();
  if (!cloudName || !apiKey || !apiSecret || !publicId) return false;

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign({ public_id: publicId, timestamp }, apiSecret);
  const resource = kind === 'VIDEO' ? 'video' : 'image';

  const form = new FormData();
  form.append('public_id', publicId);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${resource}/destroy`,
      { method: 'POST', body: form },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Убрать из категории записи, которых нет в переданном наборе `publicId`.
 * Нужна повторному запуску загрузчика: после переименования файлов старые
 * записи иначе остаются в каталоге «сиротами».
 */
export async function pruneCategory(
  category: string,
  keepPublicIds: string[],
): Promise<number> {
  const stale = await prisma.sticker.findMany({
    where: { category, publicId: { notIn: keepPublicIds } },
  });
  for (const row of stale) {
    await destroyAsset(row.publicId, row.kind);
    await prisma.sticker.delete({ where: { id: row.id } }).catch(() => undefined);
  }
  return stale.length;
}

/**
 * Ссылки на фоновое видео главной. Пока `media.hero_video_public_id` не задан,
 * возвращается локальный файл — страница работает и без Cloudinary.
 */
export async function getHeroVideo(): Promise<{ src: string; poster?: string }> {
  const [{ cloudName }, publicId] = await Promise.all([
    getCloudinaryConfig(),
    getHeroVideoPublicId(),
  ]);

  if (!cloudName || !publicId) return { src: '/bg-hero.webm' };

  return {
    src: buildStickerUrl(cloudName, publicId, 'VIDEO', { width: 720 }),
    poster: buildStickerUrl(cloudName, publicId, 'VIDEO', { width: 720, poster: true }),
  };
}
