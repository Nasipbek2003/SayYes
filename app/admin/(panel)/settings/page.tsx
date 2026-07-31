/**
 * Настройки: тарифы, состояние интеграций и Telegram-контакты.
 *
 * Значения секретов здесь НЕ показываются — только факт «задано/не задано».
 * Панель доступна из браузера, и рендерить ключи в HTML нельзя.
 */
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

import { requireAdmin } from '@/lib/admin/guard';
import { listTelegramContacts } from '@/lib/admin/queries';
import { env } from '@/lib/env';
import { getTelegramWebhookStatus } from '@/lib/notifications/telegramDiagnostics';
import {
  getBotUsername,
  getCloudinaryConfig,
  getPlans,
} from '@/lib/settings/appConfig';
import { listSettings } from '@/lib/settings/store';

import styles from '../../admin.module.css';
import { dateTime, money, num } from '../../ui';
import { CloudinaryEditor } from './CloudinaryEditor';
import { PricingEditor } from './PricingEditor';
import { SettingsEditor } from './SettingsEditor';

export const dynamic = 'force-dynamic';

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`${styles.badge} ${ok ? styles.badgeSuccess : styles.badgeNeutral}`}>
      {ok ? <CheckCircle2 size={12} aria-hidden="true" /> : <XCircle size={12} aria-hidden="true" />}
      {label}
    </span>
  );
}

export default async function AdminSettingsPage() {
  await requireAdmin();

  const [contacts, settings, telegram, plans, botUsername, cloudinary] =
    await Promise.all([
      listTelegramContacts(20),
      listSettings(),
      getTelegramWebhookStatus(),
      getPlans(),
      getBotUsername(),
      getCloudinaryConfig(),
    ]);

  const finikReady = Boolean(
    env.finik.apiKey &&
      env.finik.accountId &&
      (env.finik.privateKey || env.finik.privateKeyPath),
  );
  const mockRisk = env.nodeEnv === 'production' && env.payment.allowMockInProduction;

  return (
    <>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Настройки</h1>
        <p className={styles.pageSubtitle}>
          Конфигурация окружения и интеграций. Значения секретов не отображаются —
          только статус.
        </p>
      </div>

      {mockRisk ? (
        <section className={styles.card} style={{ marginBottom: 16 }}>
          <p className={`${styles.badge} ${styles.badgeDanger}`}>
            <AlertTriangle size={12} aria-hidden="true" />
            ALLOW_MOCK_PAYMENTS=true в production
          </p>
          <p className={styles.pageSubtitle} style={{ marginTop: 10 }}>
            Приглашения можно публиковать бесплатно через тестовую оплату. Оставляйте
            этот флаг включённым только для демо.
          </p>
        </section>
      ) : null}

      <section className={styles.splitGrid}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <p className={styles.cardTitle}>Тарифы</p>
              <p className={styles.cardMeta}>
                хранятся в базе, применяются сразу после сохранения
              </p>
            </div>
          </div>

          <PricingEditor
            initial={{
              singleAmount: plans.single.amount,
              monthlyAmount: plans.monthly.amount,
              monthlyPeriodDays: plans.monthly.periodDays ?? 30,
            }}
          />

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Тариф</th>
                  <th className={styles.numeric}>Цена</th>
                  <th>Период</th>
                </tr>
              </thead>
              <tbody>
                {[plans.single, plans.monthly].map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <span className={styles.strong}>{plan.title}</span>
                      <br />
                      <span className={styles.muted}>{plan.description}</span>
                    </td>
                    <td className={`${styles.numeric} ${styles.strong}`}>
                      {money(plan.amount, plan.currency)}
                    </td>
                    <td className={styles.muted}>
                      {plan.periodDays ? `${plan.periodDays} дней` : 'разово'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={styles.pageSubtitle} style={{ marginTop: 12 }}>
            Новая цена действует для следующих оплат. У уже созданных платежей
            сумма зафиксирована в истории и не пересчитывается.
          </p>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <p className={styles.cardTitle}>Интеграции</p>
          </div>
          <div className={styles.kvGrid}>
            <div className={styles.kv}>
              <span className={styles.kvKey}>Окружение</span>
              <span className={styles.kvValue}>{env.nodeEnv}</span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvKey}>Базовый URL</span>
              <span className={styles.kvValue}>{env.appUrl}</span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvKey}>Платёжный провайдер</span>
              <span className={styles.kvValue}>{env.payment.provider}</span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvKey}>Finik</span>
              <span className={styles.kvValue}>
                <Flag ok={finikReady} label={finikReady ? 'настроен' : 'не настроен'} />
              </span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvKey}>Telegram-бот</span>
              <span className={styles.kvValue}>
                <Flag
                  ok={Boolean(env.telegram.botToken)}
                  label={env.telegram.botUsername ? `@${env.telegram.botUsername}` : 'токен'}
                />
              </span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvKey}>Cloudinary</span>
              <span className={styles.kvValue}>
                <Flag
                  ok={Boolean(env.cloudinary.cloudName && env.cloudinary.apiKey)}
                  label={env.cloudinary.cloudName || 'не задан'}
                />
              </span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvKey}>Redis (rate limit)</span>
              <span className={styles.kvValue}>
                <Flag
                  ok={Boolean(env.upstash.restUrl && env.upstash.restToken)}
                  label={env.upstash.restUrl ? 'Upstash' : 'in-memory'}
                />
              </span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvKey}>Аналитика</span>
              <span className={styles.kvValue}>
                <Flag ok={Boolean(env.analytics.posthogKey)} label="PostHog" />
              </span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvKey}>Тестовая оплата</span>
              <span className={styles.kvValue}>
                <Flag
                  ok={env.payment.allowMockInProduction}
                  label={env.payment.allowMockInProduction ? 'разрешена' : 'выключена'}
                />
              </span>
            </div>
          </div>
        </div>
      </section>

      <h2 className={styles.sectionTitle}>Хранилище файлов (Cloudinary)</h2>
      <p className={styles.pageSubtitle} style={{ marginBottom: 14 }}>
        Здесь лежат стикеры, анимации и фото авторов. Ключи хранятся в базе
        (секрет — зашифрованным) и проверяются при сохранении.
      </p>
      <section className={styles.card} style={{ marginBottom: 16 }}>
        <CloudinaryEditor
          initial={{
            cloudName: cloudinary.cloudName,
            apiKey: cloudinary.apiKey,
            uploadFolder: cloudinary.uploadFolder,
            secretSet: Boolean(cloudinary.apiSecret),
          }}
        />
      </section>

      <h2 className={styles.sectionTitle}>Telegram-бот</h2>
      <section className={styles.card} style={{ marginBottom: 16 }}>
        {!telegram.healthy ? (
          <p className={`${styles.badge} ${styles.badgeDanger}`} style={{ marginBottom: 12 }}>
            <AlertTriangle size={12} aria-hidden="true" />
            Бот не получает апдейты — уведомления и привязка Telegram не работают
          </p>
        ) : null}

        <div className={styles.kvGrid}>
          <div className={styles.kv}>
            <span className={styles.kvKey}>Токен</span>
            <span className={styles.kvValue}>
              <Flag ok={telegram.tokenConfigured} label={telegram.tokenConfigured ? 'задан' : 'не задан'} />
            </span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvKey}>Бот</span>
            <span className={styles.kvValue}>
              {telegram.actualBotUsername ? `@${telegram.actualBotUsername}` : '—'}
            </span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvKey}>Имя бота для ссылки привязки</span>
            <span className={styles.kvValue}>
              {botUsername ? (
                `@${botUsername}`
              ) : (
                <Flag ok={false} label="не задано — нет ссылки привязки" />
              )}
              {botUsername && telegram.actualBotUsername &&
              botUsername !== telegram.actualBotUsername ? (
                <>
                  <br />
                  <span style={{ color: '#FFB976' }}>
                    не совпадает с реальным @{telegram.actualBotUsername}
                  </span>
                </>
              ) : null}
            </span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvKey}>Webhook</span>
            <span className={`${styles.kvValue} ${styles.mono}`}>
              {telegram.url ?? 'не зарегистрирован'}
            </span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvKey}>Ожидают доставки</span>
            <span className={styles.kvValue}>{num(telegram.pendingUpdates)}</span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvKey}>Последняя ошибка</span>
            <span className={styles.kvValue}>
              {telegram.lastError ? (
                <>
                  <span style={{ color: '#F08182' }}>{telegram.lastError}</span>
                  <br />
                  <span className={styles.muted}>{dateTime(telegram.lastErrorAt)}</span>
                </>
              ) : (
                '—'
              )}
            </span>
          </div>
        </div>

        {telegram.probeError ? (
          <p className={styles.pageSubtitle} style={{ marginTop: 12 }}>
            Не удалось опросить Bot API: {telegram.probeError}
          </p>
        ) : null}

        {!telegram.healthy ? (
          <p className={styles.pageSubtitle} style={{ marginTop: 12 }}>
            Перенастроить адрес: <code>node scripts/telegram-webhook.mjs set https://домен</code>{' '}
            (нужен публичный HTTPS: прод-домен или туннель). Проверить —{' '}
            <code>node scripts/telegram-webhook.mjs info</code>.
          </p>
        ) : null}
      </section>

      <h2 className={styles.sectionTitle}>Настройки в базе ({num(settings.length)})</h2>
      <p className={styles.pageSubtitle} style={{ marginBottom: 14 }}>
        Таблица <code>Setting</code>: значения переживают перезапуск и редеплой.
        Отмеченные как «секрет» шифруются AES-256-GCM и наружу не отдаются — их
        можно только перезаписать.
      </p>
      <SettingsEditor
        items={settings.map((s) => ({
          key: s.key,
          display: s.display,
          isSecret: s.isSecret,
          description: s.description,
          updatedAt: s.updatedAt.toISOString(),
        }))}
      />

      <h2 className={styles.sectionTitle}>
        Telegram-контакты ({num(contacts.length)} последних)
      </h2>
      <section className={styles.tableCard}>
        {contacts.length === 0 ? (
          <p className={styles.empty}>
            Пока никто не писал боту — уведомления по @username отправить нельзя
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Chat id</th>
                  <th>Обновлён</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.username}>
                    <td className={styles.strong}>@{c.username}</td>
                    <td className={styles.mono}>{c.chatId}</td>
                    <td className={styles.muted}>{dateTime(c.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
