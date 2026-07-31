/**
 * Изменение тарифов из админ-панели.
 *
 * Цены лежат в таблице `Setting`, поэтому меняются без редеплоя и правки `.env`.
 * Новая цена применяется к следующей оплате: у уже созданных платежей сумма
 * зафиксирована в записи `Payment` и не пересчитывается — иначе история
 * транзакций поехала бы.
 */
import { getAdminFromRequest } from '@/lib/admin/guard';
import { logger } from '@/lib/logger';
import { savePricing } from '@/lib/settings/appConfig';

export const runtime = 'nodejs';

function toInt(value: unknown): number {
  if (typeof value === 'number') return Math.trunc(value);
  if (typeof value === 'string') return Number.parseInt(value.trim(), 10);
  return Number.NaN;
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
  const update = {
    singleAmount: toInt(raw.singleAmount),
    monthlyAmount: toInt(raw.monthlyAmount),
    monthlyPeriodDays: toInt(raw.monthlyPeriodDays),
  };

  const error = await savePricing(update);
  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  logger.info('admin-pricing-updated', { ...update, admin });

  return Response.json({ ok: true, ...update });
}
