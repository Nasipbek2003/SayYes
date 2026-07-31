'use client';

/**
 * Боковая навигация панели. Клиентский компонент только ради `usePathname` —
 * подсветки активного раздела; данные в неё передаёт серверный layout.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  CreditCard,
  Heart,
  LayoutDashboard,
  MailOpen,
  Repeat,
  Settings,
  Sticker,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import styles from './admin.module.css';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Счётчик-«пилюля» справа (например, проблемные уведомления). */
  count?: number;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

export function AdminNav({ outboxAlerts = 0 }: { outboxAlerts?: number }) {
  const pathname = usePathname();

  const sections: NavSection[] = [
    {
      label: 'Обзор',
      items: [{ href: '/admin/dashboard', label: 'Дашборд', icon: LayoutDashboard }],
    },
    {
      label: 'Деньги',
      items: [
        { href: '/admin/transactions', label: 'Транзакции', icon: CreditCard },
        { href: '/admin/subscriptions', label: 'Подписки', icon: Repeat },
      ],
    },
    {
      label: 'Данные',
      items: [
        { href: '/admin/users', label: 'Пользователи', icon: Users },
        { href: '/admin/invitations', label: 'Приглашения', icon: MailOpen },
        { href: '/admin/stickers', label: 'Стикеры', icon: Sticker },
        {
          href: '/admin/notifications',
          label: 'Уведомления',
          icon: Bell,
          count: outboxAlerts,
        },
      ],
    },
    {
      label: 'Система',
      items: [{ href: '/admin/settings', label: 'Настройки', icon: Settings }],
    },
  ];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">
          <Heart size={18} strokeWidth={2.4} />
        </span>
        <span>
          <span className={styles.brandName}>SayYes</span>
          <span className={styles.brandSub}>Admin</span>
        </span>
      </div>

      {sections.map((section) => (
        <div key={section.label}>
          <p className={styles.navLabel}>{section.label}</p>
          <ul className={styles.nav}>
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon size={18} className={styles.navIcon} aria-hidden="true" />
                    {item.label}
                    {item.count ? <span className={styles.navCount}>{item.count}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}
