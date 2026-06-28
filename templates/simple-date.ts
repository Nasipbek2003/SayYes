/**
 * Template 1 — «Приглашение на свидание» (simple-date).
 *
 * Простой одностраничный сценарий: заставка → приглашение с убегающей кнопкой
 * «Нет» → экран согласия. Реализует Требование 6 и поэкранное описание из
 * `scenarii-shablonov-spec.md` (Шаблон 1).
 *
 * Развилки минимальны: единственный путь к финалу — нажать «Да» на экране
 * приглашения. Кнопка «Нет» — спец-поведение (RunawayButton) без перехода.
 */
import type { TemplateSchema } from './types';
import { fNoBehavior } from './_dateFields';

export const simpleDate: TemplateSchema = {
  id: 'simple-date',
  name: 'Приглашение на свидание',
  description: 'Быстрое милое приглашение: минимум кликов, максимум эмоции.',
  themes: ['romantic', 'neutral'],
  fields: [
    {
      key: 'имя_адресата',
      label: 'Имя адресата',
      type: 'text',
      required: true,
      maxLength: 60,
    },
    {
      key: 'фото',
      label: 'Фото (опционально)',
      type: 'image',
      required: false,
    },
    {
      key: 'текст_приглашения',
      label: 'Текст приглашения',
      type: 'longtext',
      required: true,
      maxLength: 500,
    },
    {
      key: 'подпись',
      label: 'Подпись (ваше имя)',
      type: 'text',
      required: true,
      maxLength: 60,
    },
    fNoBehavior,
  ],
  startScreen: 'intro',
  screens: [
    {
      id: 'intro',
      kind: 'intro',
      elements: [
        { kind: 'image', id: 'photo', src: '{{фото}}' },
        { kind: 'heading', id: 'greeting', text: 'Привет, {{имя_адресата}}!' },
        { kind: 'button', id: 'open', text: 'Открыть', action: 'click:open' },
      ],
      transitions: [{ on: 'click:open', to: 'invite' }],
      // Первое открытие ссылки фиксируется как событие «открыли».
      emits: [
        {
          type: 'opened',
          messageTemplate: 'Приглашение открыли: {{имя_адресата}}.',
        },
      ],
    },
    {
      id: 'invite',
      kind: 'invite',
      elements: [
        { kind: 'text', id: 'invite-text', text: '{{текст_приглашения}}' },
        { kind: 'text', id: 'signature', text: '— {{подпись}}' },
        { kind: 'button', id: 'yes', text: 'Да!', action: 'click:yes' },
        {
          kind: 'button',
          id: 'no',
          text: 'Нет',
          // Убегающая кнопка: спец-поведение RunawayButton, без перехода.
          props: { runaway: true, maxAttempts: 5 },
        },
      ],
      transitions: [{ on: 'click:yes', to: 'final' }],
    },
    {
      id: 'final',
      kind: 'final',
      elements: [
        {
          kind: 'text',
          id: 'success',
          text: 'Ура! Я знал(а) :) {{подпись}} скоро напишет тебе.',
        },
        { kind: 'text', id: 'confetti', props: { effect: 'confetti' } },
      ],
      transitions: [],
      emits: [
        {
          type: 'accepted',
          messageTemplate: '🎉 {{имя_адресата}} согласилась!',
        },
      ],
    },
  ],
  premiumFeatures: [
    'Расширенные анимации переходов',
    'Фоновая музыка',
    'Без подписи бренда',
  ],
};
