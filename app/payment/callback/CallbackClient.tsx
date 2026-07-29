'use client';

/**
 * Возврат с платёжной страницы Finik.
 *
 * Finik присылает автора сюда сразу после оплаты, но источник правды —
 * вебхук, который приходит на бэкенд отдельно. Поэтому страница опрашивает
 * `/api/payments/status`, пока платёж не станет SUCCEEDED.
 *
 * После успешной оплаты автор остаётся здесь: показываем готовую ссылку с
 * кнопкой «Скопировать» и объясняем, что её нужно отправить адресату.
 * Автоматически ссылку не открываем — открытие ссылки это событие адресата
 * (оно попадает в статистику и в уведомление боту), и автор не должен
 * «израсходовать» его сам.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { ShareLink } from '@/app/components/ShareLink';
import styles from '../payment.module.css';

/** Интервал опроса и предел ожидания вебхука. */
const POLL_MS = 2000;
const TIMEOUT_MS = 90_000;

type Phase = 'pending' | 'succeeded' | 'failed' | 'timeout' | 'error';

interface StatusResponse {
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  plan: 'single' | 'monthly';
  invitationId: string | null;
  url: string | null;
}

/** UUID в любом виде — им является идентификатор платежа Finik. */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Достаёт идентификатор платежа из параметра ссылки.
 *
 * Finik дописывает свои параметры к `RedirectUrl` через `?`, поэтому значение
 * может прийти склеенным: `session=<uuid>?paymentId=<uuid>&status=…`. Берём
 * первый UUID, сохраняя префикс `mock_` у тестовых платежей.
 */
function normaliseSession(raw: string): string {
  const value = raw.split(/[?&#]/)[0].trim();
  const uuid = UUID_RE.exec(raw)?.[0];
  if (!uuid) return value;
  return value.startsWith('mock_') || raw.startsWith('mock_') ? `mock_${uuid}` : uuid;
}

export function CallbackClient() {
  const params = useSearchParams();
  const sessionId = normaliseSession(
    params.get('session') ?? params.get('paymentId') ?? '',
  );

  const [phase, setPhase] = useState<Phase>(sessionId ? 'pending' : 'error');
  const [message, setMessage] = useState<string | null>(
    sessionId ? null : 'Не хватает идентификатора платежа в ссылке.',
  );
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [invitationId, setInvitationId] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  const poll = useCallback(async (): Promise<boolean> => {
    const res = await fetch(
      `/api/payments/status?session=${encodeURIComponent(sessionId)}`,
      { cache: 'no-store' },
    );

    if (res.status === 401) {
      setPhase('error');
      setMessage('Сессия истекла. Войди снова — платёж не потеряется.');
      return true;
    }
    if (res.status === 404) {
      // Платёж не найден: ссылка возврата пришла с чужим или битым id.
      setPhase('error');
      setMessage(
        'Не нашли этот платёж. Если деньги списались, ссылка появится в кабинете — проверь «Мои приглашения».',
      );
      return true;
    }
    if (!res.ok) {
      setPhase('error');
      setMessage(`Не удалось проверить статус платежа (ошибка ${res.status}).`);
      return true;
    }

    const data = (await res.json()) as StatusResponse;

    if (data.status === 'SUCCEEDED') {
      setInvitationUrl(data.url);
      setInvitationId(data.invitationId);
      setPhase('succeeded');
      return true;
    }

    if (data.status === 'FAILED') {
      setPhase('failed');
      return true;
    }

    return false;
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const done = await poll();
        if (cancelled || done) return;

        if (Date.now() - startedAt.current > TIMEOUT_MS) {
          setPhase('timeout');
          return;
        }
        timer = setTimeout(tick, POLL_MS);
      } catch {
        if (!cancelled) {
          setPhase('error');
          setMessage('Сеть недоступна. Проверь соединение.');
        }
      }
    };

    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionId, poll]);

  return (
    <main className={styles.page}>
      <section className={styles.card} role="status" aria-live="polite">
        {phase === 'pending' && (
          <>
            <div className={styles.spinner} aria-hidden="true" />
            <h1 className={styles.title}>Подтверждаем оплату</h1>
            <p className={styles.text}>
              Это занимает несколько секунд. Не закрывай страницу — как только банк
              подтвердит платёж, покажем ссылку на приглашение.
            </p>
          </>
        )}

        {phase === 'succeeded' && (
          <>
            <h1 className={styles.title}>
              {invitationUrl ? 'Приглашение готово' : 'Оплата прошла'}
            </h1>

            {invitationUrl ? (
              <>
                <p className={styles.text}>
                  Скопируй ссылку и отправь тому, кого приглашаешь.
                </p>
                <ShareLink url={invitationUrl} />
                <p className={styles.text}>
                  Уведомление придёт, когда он откроет ссылку и ответит.
                </p>
                <div className={styles.actions}>
                  <Link
                    className={styles.secondary}
                    href={
                      invitationId
                        ? `/me/invitations/${encodeURIComponent(invitationId)}`
                        : '/me/invitations'
                    }
                  >
                    Мои приглашения
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className={styles.text}>
                  Подписка активна — публикуй приглашения без отдельной оплаты.
                </p>
                <div className={styles.actions}>
                  <Link className={styles.primary} href="/me/invitations">
                    В мои приглашения
                  </Link>
                </div>
              </>
            )}
          </>
        )}

        {phase === 'failed' && (
          <>
            <h1 className={styles.title}>Платёж не прошёл</h1>
            <p className={styles.text}>
              Деньги не списаны. Приглашение осталось черновиком — можно попробовать
              оплатить снова.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/me/invitations">
                К моим приглашениям
              </Link>
            </div>
          </>
        )}

        {phase === 'timeout' && (
          <>
            <h1 className={styles.title}>Оплата ещё обрабатывается</h1>
            <p className={styles.text}>
              Банк не подтвердил платёж за минуту. Если деньги списались, ссылка
              появится в кабинете автоматически — обнови страницу через пару минут.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/me/invitations">
                К моим приглашениям
              </Link>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <h1 className={styles.title}>Что-то пошло не так</h1>
            <p className={styles.error}>{message}</p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/me/invitations">
                К моим приглашениям
              </Link>
              <Link className={styles.secondary} href="/login">
                Войти
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
