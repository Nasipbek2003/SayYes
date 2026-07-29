'use client';

/**
 * Клиентский список приглашений с поиском, фильтром по статусу и по дате.
 *
 * Данные приходят с сервера целиком (их обычно немного — на одного автора),
 * а фильтрация/поиск делается на клиенте без лишних запросов.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';

import type { CabinetListItem, CabinetStatus } from '@/lib/services/invitation';
import { CopyLinkButton, DeleteInvitationButton } from './CabinetActions';
import { DateField, StyledSelect } from './FilterFields';
import { LocalTime } from '@/app/components/LocalTime';
import styles from './cabinet.module.css';

const STATUS_LABEL: Record<CabinetStatus, string> = {
  draft: 'Черновик',
  active: 'Активно',
  responded: 'Отвечено',
  expired: 'Недоступно',
};

const STATUS_OPTIONS: Array<{ value: 'all' | CabinetStatus; label: string }> = [
  { value: 'all', label: 'Все статусы' },
  { value: 'draft', label: STATUS_LABEL.draft },
  { value: 'active', label: STATUS_LABEL.active },
  { value: 'responded', label: STATUS_LABEL.responded },
  { value: 'expired', label: STATUS_LABEL.expired },
];

/** Приводит Date к 'YYYY-MM-DD' в локальном поясе браузера (для <input type="date">). */
function toDateInputValue(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface InvitationsListProps {
  invitations: CabinetListItem[];
}

export function InvitationsList({ invitations }: InvitationsListProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | CabinetStatus>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return invitations.filter((item) => {
      if (query && !item.templateName.toLowerCase().includes(query)) {
        return false;
      }

      if (status !== 'all' && item.cabinetStatus !== status) {
        return false;
      }

      if (dateFrom || dateTo) {
        const createdDateStr = toDateInputValue(item.createdAt);
        if (dateFrom && createdDateStr < dateFrom) return false;
        if (dateTo && createdDateStr > dateTo) return false;
      }

      return true;
    });
  }, [invitations, search, status, dateFrom, dateTo]);

  const hasActiveFilters = search !== '' || status !== 'all' || dateFrom !== '' || dateTo !== '';

  function resetFilters() {
    setSearch('');
    setStatus('all');
    setDateFrom('');
    setDateTo('');
  }

  return (
    <>
      <div className={styles.filterBar}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию шаблона…"
          className={styles.searchInput}
          aria-label="Поиск по названию шаблона"
        />

        <div className={styles.filterRow}>
          <StyledSelect
            value={status}
            options={STATUS_OPTIONS}
            onChange={setStatus}
            label="Фильтр по статусу"
          />

          <DateField
            value={dateFrom}
            onChange={setDateFrom}
            label="Дата создания от"
            placeholder="Дата от"
            max={dateTo || undefined}
          />
          <span className={styles.filterDateSep}>—</span>
          <DateField
            value={dateTo}
            onChange={setDateTo}
            label="Дата создания до"
            placeholder="Дата до"
            min={dateFrom || undefined}
          />

          {hasActiveFilters && (
            <button type="button" onClick={resetFilters} className={styles.filterReset}>
              Сбросить
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <section className={styles.empty} role="status">
          <span aria-hidden="true" style={{ fontSize: 32 }}>🔍</span>
          <h2 className={styles.emptyTitle}>Ничего не найдено</h2>
          <p className={styles.emptyText}>Попробуй изменить поиск или фильтры.</p>
        </section>
      ) : (
        <div className={styles.cardList}>
          {filtered.map((item) => (
            <div key={item.id} className={styles.card}>
              {/* Заголовок карточки */}
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>{item.templateName}</h2>
                  <span className={styles.cardDate}>
                    Создано: <LocalTime date={item.createdAt} />
                    {item.activatedAt && (
                      <> · Активировано: <LocalTime date={item.activatedAt} /></>
                    )}
                  </span>
                </div>
                <span className={`${styles.badge} ${styles[`badge--${item.cabinetStatus}`]}`}>
                  {STATUS_LABEL[item.cabinetStatus]}
                </span>
              </div>

              {/* Ссылка с кнопкой копирования */}
              {item.url ? (
                <div className={styles.linkBlock}>
                  <a href={item.url} className={styles.linkUrl} target="_blank" rel="noreferrer">
                    {item.url}
                  </a>
                  <CopyLinkButton url={item.url} />
                </div>
              ) : (
                <p className={styles.linkDraft}>Ссылка появится после создания приглашения.</p>
              )}

              {/* Статистика */}
              <div className={styles.statsRow}>
                <div className={styles.statBox}>
                  <span className={styles.statNum}>{item.opens}</span>
                  <span className={styles.statLabel}>Открытий</span>
                </div>
                <div className={styles.statBox}>
                  <span className={styles.statNum}>{item.responses}</span>
                  <span className={styles.statLabel}>Ответов</span>
                </div>
              </div>

              {/* Действия */}
              <div className={styles.cardActions}>
                <Link
                  href={`/me/invitations/${encodeURIComponent(item.id)}`}
                  className={styles.detailLink}
                >
                  Подробнее →
                </Link>
                <DeleteInvitationButton invitationId={item.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
