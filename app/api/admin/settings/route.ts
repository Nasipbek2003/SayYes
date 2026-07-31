/**
 * Настройки из таблицы `Setting`: создание/обновление и удаление из панели.
 *
 * Значения секретов наружу не отдаются никогда — ответ содержит только ключ и
 * факт «это секрет». Секретные значения шифруются в `lib/settings/store.ts`.
 */
import { getAdminFromRequest } from '@/lib/admin/guard';
import { logger } from '@/lib/logger';
import { deleteSetting, setSetting } from '@/lib/settings/store';

export const runtime = 'nodejs';

/** Ключ: латиница, цифры, точка, дефис, подчёркивание — без пробелов. */
const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/i;

export async function POST(request: Request): Promise<Response> {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return Response.json({ error: 'Admin authentication required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const key = typeof raw.key === 'string' ? raw.key.trim() : '';
  const value = typeof raw.value === 'string' ? raw.value : '';
  const isSecret = raw.isSecret === true;
  const description =
    typeof raw.description === 'string' && raw.description.trim().length > 0
      ? raw.description.trim()
      : undefined;

  if (!KEY_PATTERN.test(key)) {
    return Response.json(
      { error: 'Ключ: 2–64 символа, латиница, цифры, точка, дефис или подчёркивание' },
      { status: 400 },
    );
  }
  if (value.length === 0) {
    return Response.json({ error: 'Значение не может быть пустым' }, { status: 400 });
  }

  await setSetting(key, value, { isSecret, description });
  logger.info('admin-setting-updated', { key, isSecret, admin });

  return Response.json({ ok: true, key, isSecret });
}

export async function DELETE(request: Request): Promise<Response> {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return Response.json({ error: 'Admin authentication required' }, { status: 401 });
  }

  const key = new URL(request.url).searchParams.get('key')?.trim() ?? '';
  if (!KEY_PATTERN.test(key)) {
    return Response.json({ error: 'Некорректный ключ' }, { status: 400 });
  }

  await deleteSetting(key);
  logger.info('admin-setting-deleted', { key, admin });

  return Response.json({ ok: true });
}
