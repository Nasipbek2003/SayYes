/**
 * Единая проверка: доступна ли тестовая оплата (заглушка без списания денег).
 *
 * Она открывает бесплатную публикацию приглашений, поэтому включена только
 * когда провайдер — `mock`, и при этом либо мы работаем локально, либо стенд
 * явно помечен `ALLOW_MOCK_PAYMENTS=true`.
 */
import { env } from '@/lib/env';

export function mockPaymentsEnabled(): boolean {
  if (env.payment.provider !== 'mock') return false;
  if (env.nodeEnv !== 'production') return true;
  return env.payment.allowMockInProduction;
}
