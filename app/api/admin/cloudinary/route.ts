/**
 * Доступы Cloudinary из панели: сохраняются в таблицу `Setting`, секрет —
 * зашифрованным. Перед записью проверяем связку ключей на реальном API, чтобы
 * неверные данные не сломали загрузку фото и стикеров молча.
 */
import { getAdminFromRequest } from '@/lib/admin/guard';
import { logger } from '@/lib/logger';
import { getCloudinaryConfig, saveCloudinaryConfig } from '@/lib/settings/appConfig';

export const runtime = 'nodejs';

/** Проверка доступа: Admin API `/usage` отвечает 200 только на верную пару ключей. */
async function verify(
  cloudName: string,
  apiKey: string,
  apiSecret: string,
): Promise<string | null> {
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/usage`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return null;
    if (res.status === 401) return 'Cloudinary отклонил ключи (401)';
    if (res.status === 404) return `Облако «${cloudName}» не найдено`;
    return `Cloudinary ответил ${res.status}`;
  } catch (error) {
    return `Не удалось связаться с Cloudinary: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

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
  const str = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string).trim() : '');

  const update = {
    cloudName: str('cloudName'),
    apiKey: str('apiKey'),
    apiSecret: str('apiSecret'),
    uploadFolder: str('uploadFolder'),
  };

  // Текущие значения нужны, чтобы проверить пару ключей, когда админ меняет
  // только часть полей (например, оставил секрет прежним).
  const current = await getCloudinaryConfig();
  const cloudName = update.cloudName || current.cloudName;
  const apiKey = update.apiKey || current.apiKey;
  const apiSecret = update.apiSecret || current.apiSecret;

  if (!cloudName || !apiKey || !apiSecret) {
    return Response.json(
      { error: 'Заполните имя облака, API key и API secret' },
      { status: 400 },
    );
  }

  const problem = await verify(cloudName, apiKey, apiSecret);
  if (problem) {
    return Response.json({ error: problem }, { status: 400 });
  }

  await saveCloudinaryConfig(update);
  logger.info('admin-cloudinary-updated', { admin, cloudName });

  return Response.json({ ok: true, cloudName });
}
