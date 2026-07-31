/**
 * Глобальная шапка приложения — дизайн «Тёплый персик».
 * Серверный компонент: читает сессию и отображает профиль или кнопку входа.
 */
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { getCurrentAuthor } from '@/lib/auth/nextCookies';
import { logger } from '@/lib/logger';
import styles from './Header.module.css';

/**
 * Недоступна ли база (а не «сломался код»).
 *
 * Проверка узкая намеренно: перехватывать здесь всё нельзя. Next.js бросает
 * служебную `DynamicServerError`, когда компонент читает cookie при попытке
 * статического рендера, и её нужно пропустить наверх — иначе страницы, которые
 * должны быть динамическими, тихо застынут в статике.
 *
 * Коды Prisma: P1001 — сервер недоступен, P1002 — таймаут подключения,
 * P1017 — сервер закрыл соединение.
 */
function isDatabaseUnavailable(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name ?? '';
  const code = (error as { errorCode?: string; code?: string } | null)?.errorCode
    ?? (error as { code?: string } | null)?.code;
  return (
    name === 'PrismaClientInitializationError' ||
    name === 'PrismaClientRustPanicError' ||
    code === 'P1001' ||
    code === 'P1002' ||
    code === 'P1017'
  );
}

/**
 * Шапка есть на каждой странице, поэтому её обращение к БД — самое частое место,
 * где недоступность базы обрушивала бы весь рендер (например, пока просыпается
 * serverless-Postgres). Отсутствие профиля не мешает показать страницу: при
 * недоступной базе считаем посетителя неавторизованным и логируем причину.
 */
async function resolveAuthor() {
  try {
    return await getCurrentAuthor();
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    logger.warn('header-author-lookup-failed', {
      error: error instanceof Error ? error.message.split('\n')[0] : String(error),
    });
    return null;
  }
}

export async function Header() {
  const author = await resolveAuthor();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {/* Логотип */}
        <Link href="/" className={styles.logo}>
          <Heart fill="#E8625A" color="#E8625A" size={20} strokeWidth={0} />
          <span className={styles.logoName}>SayYes</span>
        </Link>

        {/* Навигация */}
        <nav className={styles.nav}>
          <Link href="/" className={styles.navLink}>Шаблоны</Link>
          {author && (
            <Link href="/me/invitations" className={styles.navLink}>Мои приглашения</Link>
          )}
        </nav>

        {/* Профиль / Войти */}
        <div className={styles.profile}>
          {author ? (
            <div className={styles.userMenu}>
              <Link href="/me/invitations" className={styles.avatar} title={author.email ?? 'Профиль'}>
                {/* Инициал из email */}
                {(author.email ?? '?')[0].toUpperCase()}
              </Link>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className={styles.logoutBtn}>
                  Выйти
                </button>
              </form>
            </div>
          ) : (
            <Link href="/login" className={styles.loginBtn}>
              Войти
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
