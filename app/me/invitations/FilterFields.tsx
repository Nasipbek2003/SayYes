'use client';

/**
 * Кастомные поля фильтров кабинета — выпадающий список и календарь
 * в стиле «Тёплый персик» вместо системных <select> / <input type="date">.
 *
 * Нативные контролы рисуются средствами ОС и выбиваются из дизайна,
 * поэтому здесь свой поповер: одна визуальная логика на всех платформах.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';

import styles from './cabinet.module.css';

/** Закрывает поповер по клику вне контейнера и по Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  return ref;
}

/* ─────────────────────────── Выпадающий список ─────────────────────────── */

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface StyledSelectProps<T extends string> {
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  /** Доступное имя контрола (aria-label). */
  label: string;
}

export function StyledSelect<T extends string>({
  value,
  options,
  onChange,
  label,
}: StyledSelectProps<T>) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  );

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(selectedIndex);
  const close = useCallback(() => setOpen(false), []);
  const wrapRef = useDismiss(open, close);
  const listId = useId();

  function commit(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setHighlight(selectedIndex);
        setOpen(true);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((prev) => (prev + step + options.length) % options.length);
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      if (!open) return;
      event.preventDefault();
      setHighlight(event.key === 'Home' ? 0 : options.length - 1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) commit(highlight);
      else {
        setHighlight(selectedIndex);
        setOpen(true);
      }
    }
  }

  return (
    <div className={styles.selectWrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.selectBtn}${open ? ` ${styles.selectBtnOpen}` : ''}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${highlight}` : undefined}
        aria-label={label}
        onClick={() => {
          setHighlight(selectedIndex);
          setOpen((prev) => !prev);
        }}
        onKeyDown={onKeyDown}
      >
        <span className={styles.selectValue}>{options[selectedIndex]?.label}</span>
        <ChevronDown size={15} className={styles.fieldIcon} aria-hidden="true" />
      </button>

      {open && (
        <ul className={styles.menu} role="listbox" id={listId} aria-label={label}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const classes = [styles.menuItem];
            if (index === highlight) classes.push(styles.menuItemActive);
            if (isSelected) classes.push(styles.menuItemSelected);

            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                className={classes.join(' ')}
                onPointerEnter={() => setHighlight(index)}
                onClick={() => commit(index)}
              >
                <span>{option.label}</span>
                {isSelected && <Check size={14} aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────────── Календарь ───────────────────────────── */

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Date → 'YYYY-MM-DD' в локальном поясе браузера. */
function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 'YYYY-MM-DD' → Date (локальная полночь) либо null. */
function fromISODate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 'YYYY-MM-DD' → 'ДД.ММ.ГГГГ' для показа в поле. */
function toDisplay(value: string): string {
  const date = fromISODate(value);
  if (!date) return '';
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
}

interface DateFieldProps {
  /** Значение в формате 'YYYY-MM-DD' или пустая строка. */
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  /** Минимально допустимая дата 'YYYY-MM-DD'. */
  min?: string;
  /** Максимально допустимая дата 'YYYY-MM-DD'. */
  max?: string;
}

export function DateField({
  value,
  onChange,
  label,
  placeholder = 'Выбери дату',
  min,
  max,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const wrapRef = useDismiss(open, close);

  // Месяц, который сейчас показан в сетке.
  const [viewMonth, setViewMonth] = useState(() => {
    const selected = fromISODate(value) ?? new Date();
    return new Date(selected.getFullYear(), selected.getMonth(), 1);
  });

  // При открытии — прыгаем на месяц выбранной даты.
  useEffect(() => {
    if (!open) return;
    const selected = fromISODate(value) ?? new Date();
    setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [open, value]);

  const todayISO = useMemo(() => toISODate(new Date()), []);

  // Шесть недель фиксированной высоты — сетка не «прыгает» между месяцами.
  const cells = useMemo(() => {
    const firstWeekday = (viewMonth.getDay() + 6) % 7; // Пн = 0
    const start = new Date(viewMonth);
    start.setDate(start.getDate() - firstWeekday);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return {
        iso: toISODate(date),
        day: date.getDate(),
        outside: date.getMonth() !== viewMonth.getMonth(),
      };
    });
  }, [viewMonth]);

  function isDisabled(iso: string) {
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  }

  function shiftMonth(step: number) {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + step, 1));
  }

  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  const display = toDisplay(value);

  return (
    <div className={styles.dateWrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.dateBtn}${open ? ` ${styles.selectBtnOpen}` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Calendar size={14} className={styles.dateIcon} aria-hidden="true" />
        <span className={display ? styles.dateValue : styles.datePlaceholder}>
          {display || placeholder}
        </span>
      </button>

      {display && (
        <button
          type="button"
          className={styles.dateClear}
          aria-label={`Очистить: ${label}`}
          onClick={() => {
            onChange('');
            setOpen(false);
          }}
        >
          <X size={13} aria-hidden="true" />
        </button>
      )}

      {open && (
        <div className={styles.calendar} role="dialog" aria-label={label} aria-modal="false">
          <div className={styles.calHead}>
            <button
              type="button"
              className={styles.calNav}
              aria-label="Предыдущий месяц"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            <span className={styles.calTitle} aria-live="polite">
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </span>
            <button
              type="button"
              className={styles.calNav}
              aria-label="Следующий месяц"
              onClick={() => shiftMonth(1)}
            >
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>

          <div className={styles.calWeekdays} aria-hidden="true">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className={styles.calWeekday}>
                {weekday}
              </span>
            ))}
          </div>

          <div className={styles.calGrid}>
            {cells.map((cell) => {
              const classes = [styles.calDay];
              if (cell.outside) classes.push(styles.calDayOutside);
              if (cell.iso === todayISO) classes.push(styles.calDayToday);
              if (cell.iso === value) classes.push(styles.calDaySelected);

              return (
                <button
                  key={cell.iso}
                  type="button"
                  className={classes.join(' ')}
                  disabled={isDisabled(cell.iso)}
                  aria-current={cell.iso === todayISO ? 'date' : undefined}
                  aria-pressed={cell.iso === value}
                  onClick={() => pick(cell.iso)}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className={styles.calFooter}>
            <button
              type="button"
              className={styles.calAction}
              disabled={isDisabled(todayISO)}
              onClick={() => pick(todayISO)}
            >
              Сегодня
            </button>
            <button
              type="button"
              className={styles.calAction}
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Очистить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
