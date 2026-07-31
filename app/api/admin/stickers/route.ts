/**
 * Загрузка стикера в Cloudinary + добавление в каталог.
 *
 * Принимает `multipart/form-data`: файл, слаг категории и необязательную
 * подпись категории. Файл уходит в Cloudinary через подписанный серверный
 * запрос (секрет не покидает сервер), в базу пишется только `publicId` и
 * метаданные — ссылки собираются на чтении с преобразованиями.
 */
import { getAdminFromRequest } from '@/lib/admin/guard';
import { logger } from '@/lib/logger';
import {
  StickerUploadError,
  saveSticker,
  uploadSticker,
} from '@/lib/storage/stickers';

export const runtime = 'nodejs';

/** 15 МБ — с запасом под анимированные клипы, но без загрузки гигабайтов. */
const MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED = /\.(webp|png|jpe?g|gif|webm|mp4)$/i;
const CATEGORY_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

export async function POST(request: Request): Promise<Response> {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return Response.json({ error: 'Admin authentication required' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Ожидается multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  const category = String(form.get('category') ?? '').trim().toLowerCase();
  const labelRaw = String(form.get('label') ?? '').trim();
  const sortOrderRaw = String(form.get('sortOrder') ?? '').trim();

  if (!(file instanceof File)) {
    return Response.json({ error: 'Файл не передан' }, { status: 400 });
  }
  if (!CATEGORY_PATTERN.test(category)) {
    return Response.json(
      { error: 'Категория: латиница, цифры и дефис, 2–32 символа' },
      { status: 400 },
    );
  }
  if (!ALLOWED.test(file.name)) {
    return Response.json(
      { error: 'Поддерживаются WebP, PNG, JPEG, GIF, WebM и MP4' },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return Response.json({ error: 'Файл пустой' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: 'Файл больше 15 МБ' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const asset = await uploadSticker(buffer, {
      fileName: file.name,
      category,
      contentType: file.type || undefined,
    });
    const row = await saveSticker(asset, {
      category,
      label: labelRaw ? labelRaw : undefined,
      sortOrder: Number.parseInt(sortOrderRaw, 10) || 0,
    });

    logger.info('admin-sticker-uploaded', {
      admin,
      publicId: asset.publicId,
      kind: asset.kind,
      bytes: asset.bytes,
    });

    return Response.json({ ok: true, id: row.id, publicId: row.publicId });
  } catch (error) {
    if (error instanceof StickerUploadError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
