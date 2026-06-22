/**
 * Глобальная шапка приложения — дизайн «Тёплый персик».
 * Серверный компонент: читает сессию и отображает профиль или кнопку входа.
 */
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { getCurrentAuthor } from '@/lib/auth/nextCookies';
import styles from './Header.module.css';

export async function Header() {
  const author = await getCurrentAuthor();

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
