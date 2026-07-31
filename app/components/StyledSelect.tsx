'use client';

/**
 * Выпадающий список в оформлении проекта — замена нативному `<select>`.
 *
 * Нативный список рисует операционная система (на Windows — белое меню с синей
 * подсветкой), поэтому в тёмной панели и в «Тёплом персике» он выглядит чужим.
 * Здесь свой поповер с ролями `combobox`/`listbox`, клавиатурной навигацией
 * (стрелки, Home/End, Enter, Escape) и закрытием по клику вне контейнера.
 *
 * `name` включает скрытый `<input>`: компонент можно положить в обычную
 * GET/POST-форму и получить значение в query-параметрах, как от `<select>`.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

import styles from './StyledSelect.module.css';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface StyledSelectProps<T extends string> {
  value: T;
  options: Array<SelectOption<T>>;
  onChange?: (value: T) => void;
  /** Доступное имя контрола (aria-label). */
  label: string;
  /** Имя поля формы: добавляет скрытый input с текущим значением. */
  name?: string;
  /** Палитра: светлая (сайт) или тёмная (админ-панель). */
  variant?: 'light' | 'dark';
  /** Дополнительный класс на обёртку — для раскладки в родителе. */
  className?: string;
  disabled?: boolean;
}

export function StyledSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  name,
  variant = 'light',
  className,
  disabled = false,
}: StyledSelectProps<T>) {
  // Внутреннее состояние нужно, когда компонент используется как поле формы
  // без внешнего `onChange` (uncontrolled-режим).
  const [innerValue, setInnerValue] = useState<T>(value);
  const current = onChange ? value : innerValue;

  // В uncontrolled-режиме значение приходит из URL (фильтры в панели). После
  // навигации — например, по кнопке «Сбросить» — React переиспользует этот
  // инстанс, поэтому внутреннее состояние нужно синхронизировать с пропом,
  // иначе в поле останется прежняя подпись.
  useEffect(() => {
    if (!onChange) setInnerValue(value);
  }, [value, onChange]);

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === current),
  );

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(selectedIndex);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) close();
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

  function commit(index: number) {
    const option = options[index];
    if (option) {
      if (onChange) onChange(option.value);
      else setInnerValue(option.value);
    }
    setOpen(false);
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
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

  const selected = options[selectedIndex];
  const classes = [styles.wrap];
  if (variant === 'dark') classes.push(styles.dark);
  if (className) classes.push(className);

  return (
    <div className={classes.join(' ')} ref={wrapRef}>
      {name ? <input type="hidden" name={name} value={current} /> : null}

      <button
        type="button"
        className={`${styles.trigger}${open ? ` ${styles.triggerOpen}` : ''}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${highlight}` : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          setHighlight(selectedIndex);
          setOpen((prev) => !prev);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={styles.value}>{selected?.label ?? ''}</span>
        <ChevronDown
          size={15}
          className={`${styles.icon}${open ? ` ${styles.iconOpen}` : ''}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <ul className={styles.menu} role="listbox" id={listId} aria-label={label}>
          {options.map((option, index) => {
            const isSelected = option.value === current;
            const itemClasses = [styles.item];
            if (index === highlight) itemClasses.push(styles.itemActive);
            if (isSelected) itemClasses.push(styles.itemSelected);

            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                className={itemClasses.join(' ')}
                onPointerEnter={() => setHighlight(index)}
                onClick={() => commit(index)}
              >
                <span>{option.label}</span>
                {isSelected ? <Check size={14} aria-hidden="true" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
