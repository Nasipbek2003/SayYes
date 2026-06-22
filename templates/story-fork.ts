/**
 * Template 2 — «Ты реально мне отказала?» (story-fork).
 *
 * Сюжетный сценарий с развилками и совместным планированием. Реализует
 * Требование 7 и схему развилок из `scenarii-shablonov-spec.md` (Шаблон 2):
 *
 * ```
 * screen-1 ──«Давай!»──────────► screen-4 ► screen-5 ► screen-6 (согласие)
 *    │
 *    └──«Нет, спасибо»──► screen-2 ──«Нет»──► screen-4 ...
 *                             │
 *                             └──«Да»──► screen-3 (отказ, путь назад → screen-1)
 * ```
 *
 * Обратный переход screen-3 → screen-1 («Передумала?») допустим: из screen-1
 * по-прежнему достижим финал согласия (screen-6), поэтому граф не содержит
 * тупиков без выхода к экрану `kind = final`.
 */
import type { TemplateSchema } from './types';

export const storyFork: TemplateSchema = {
  id: 'story-fork',
  name: 'Ты реально мне отказала?',
  description:
    'Игровой сюжетный сценарий с развилками и совместным выбором места и времени.',
  themes: ['romantic', 'playful', 'neutral'],
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
      key: 'вступительный_текст',
      label: 'Вступительный текст',
      type: 'longtext',
      required: true,
      maxLength: 500,
    },
    {
      key: 'список_мест',
      label: 'Список мест',
      type: 'placesList',
      required: false,
      maxLength: 12,
    },
    {
      key: 'подпись',
      label: 'Подпись (ваше имя)',
      type: 'text',
      required: true,
      maxLength: 60,
    },
  ],
  startScreen: 'screen-1',
  screens: [
    {
      id: 'screen-1',
      kind: 'invite',
      elements: [
        { kind: 'text', id: 'intro-text', text: '{{вступительный_текст}}' },
        { kind: 'button', id: 'yes', text: 'Давай!', action: 'click:yes' },
        {
          kind: 'button',
          id: 'no',
          text: 'Нет, спасибо',
          action: 'click:no',
        },
      ],
      transitions: [
        { on: 'click:yes', to: 'screen-4' },
        { on: 'click:no', to: 'screen-2' },
      ],
      emits: [
        {
          type: 'opened',
          messageTemplate: 'Приглашение открыли: {{имя_адресата}}.',
        },
      ],
    },
    {
      id: 'screen-2',
      kind: 'fork',
      elements: [
        { kind: 'text', id: 'fork-text', text: 'Ты реально мне отказала?? 🥺' },
        { kind: 'button', id: 'confirm-no', text: 'Да', action: 'click:yes' },
        { kind: 'button', id: 'cancel-no', text: 'Нет', action: 'click:no' },
      ],
      transitions: [
        // «Да» — подтверждает отказ → мягкий финал.
        { on: 'click:yes', to: 'screen-3' },
        // «Нет» — передумала отказывать → выбор места.
        { on: 'click:no', to: 'screen-4' },
      ],
    },
    {
      id: 'screen-3',
      kind: 'final',
      elements: [
        {
          kind: 'text',
          id: 'soft-decline',
          text: 'Окей, понял(а). Но если передумаешь — ссылка всегда тут 💛',
        },
        {
          kind: 'button',
          id: 'reconsider',
          text: 'Передумала?',
          action: 'click:reconsider',
        },
      ],
      // Уважительный путь назад к началу сценария.
      transitions: [{ on: 'click:reconsider', to: 'screen-1' }],
      emits: [
        {
          type: 'declined',
          messageTemplate: '{{имя_адресата}} пока отказалась.',
        },
      ],
    },
    {
      id: 'screen-4',
      kind: 'placePicker',
      elements: [
        { kind: 'text', id: 'place-text', text: 'Отлично! Тогда выбери, куда хотим 👇' },
        {
          kind: 'placesGrid',
          id: 'places',
          field: 'выбранное_место',
          props: { source: '{{список_мест}}', emptyFallback: 'Напиши, куда хочешь' },
        },
        { kind: 'button', id: 'done', text: 'Готово', action: 'select:place' },
      ],
      transitions: [{ on: 'select:place', to: 'screen-5' }],
    },
    {
      id: 'screen-5',
      kind: 'timePicker',
      elements: [
        { kind: 'text', id: 'time-text', text: 'Когда тебе удобно?' },
        { kind: 'input', id: 'time', field: 'выбранное_время' },
        { kind: 'button', id: 'confirm', text: 'Подтвердить', action: 'select:time' },
      ],
      transitions: [{ on: 'select:time', to: 'screen-6' }],
    },
    {
      id: 'screen-6',
      kind: 'final',
      elements: [
        {
          kind: 'text',
          id: 'success',
          text: 'Свидание назначено! 🎉 {{выбранное_место}}, {{выбранное_время}}.',
        },
        { kind: 'text', id: 'confetti', props: { effect: 'confetti' } },
      ],
      transitions: [],
      emits: [
        {
          type: 'accepted',
          messageTemplate:
            '🎉 {{имя_адресата}} согласилась! Место: {{выбранное_место}}, время: {{выбранное_время}}.',
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
