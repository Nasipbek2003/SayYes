/**
 * Изменение и удаление стикера каталога.
 *
 * PATCH — скрыть/показать и поменять порядок (файл в Cloudinary не трогаем).
 * DELETE — удалить и запись, и файл: иначе бесплатный тариф Cloudinary
 * постепенно заполнится «сиротами», которых уже не видно в панели.
 */
import { getAdminFromRequest } from '@/lib/admin/guard';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { destroyAsset } from '@/lib/storage/stickers';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return Response.json({ error: 'Admin authentication required' }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const data: { hidden?: boolean; sortOrder?: number } = {};
  if (typeof raw.hidden === 'boolean') data.hidden = raw.hidden;
  if (typeof raw.sortOrder === 'number' && Number.isFinite(raw.sortOrder)) {
    data.sortOrder = Math.trunc(raw.sortOrder);
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: 'Нет полей для изменения' }, { status: 400 });
  }

  try {
    const row = await prisma.sticker.update({ where: { id }, data });
    logger.info('admin-sticker-updated', { admin, id, ...data });
    return Response.json({ ok: true, hidden: row.hidden, sortOrder: row.sortOrder });
  } catch {
    return Response.json({ error: 'Стикер не найден' }, { status: 404 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return Response.json({ error: 'Admin authentication required' }, { status: 401 });
  }

  const { id } = await context.params;
  const row = await prisma.sticker.findUnique({ where: { id } });
  if (!row) {
    return Response.json({ error: 'Стикер не найден' }, { status: 404 });
  }

  const destroyed = await destroyAsset(row.publicId, row.kind);
  await prisma.sticker.delete({ where: { id } });

  logger.info('admin-sticker-deleted', {
    admin,
    publicId: row.publicId,
    fileDestroyed: destroyed,
  });

  return Response.json({ ok: true, fileDestroyed: destroyed });
}
