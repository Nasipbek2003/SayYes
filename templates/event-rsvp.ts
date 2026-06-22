/**
 * Template 3 — «Приглашение на той / праздник» (event-rsvp).
 *
 * Событийный сценарий с RSVP: одна ссылка рассылается многим гостям. Реализует
 * Требование 8 и поэкранное описание из `scenarii-shablonov-spec.md` (Шаблон 3):
 * обложка → детали события → форма RSVP → подтверждение.
 *
 * Единственный линейный путь к финалу (screen-4, `kind = final`). На финале
 * автору уходит событие `rsvp` с именем гостя, решением и (опц.) числом гостей.
 */
import type { TemplateSchema } from './types';

export const eventRsvp: TemplateSchema = {
  id: 'event-rsvp',
  name: 'Приглашение на той / праздник',
  description: 'Событийное приглашение с обложкой, деталями и сбором RSVP от гостей.',
  themes: ['festive', 'elegant', 'neutral'],
  fields: [
    {
      key: 'название_события',
      label: 'Название события',
      type: 'text',
      required: true,
      maxLength: 120,
    },
    {
      key: 'дата',
      label: 'Дата',
      type: 'datetime',
      required: true,
    },
    {
      key: 'время',
      label: 'Время',
      type: 'text',
      required: true,
      maxLength: 40,
    },
    {
      key: 'место',
      label: 'Место',
      type: 'text',
      required: true,
      maxLength: 120,
    },
    {
      key: 'адрес',
      label: 'Адрес (опционально)',
      type: 'text',
      required: false,
      maxLength: 200,
    },
    {
      key: 'текст_приглашения',
      label: 'Текст приглашения',
      type: 'longtext',
      required: true,
      maxLength: 800,
    },
    {
      key: 'фото_обложка',
      label: 'Фото-обложка (опционально)',
      type: 'image',
      required: false,
    },
    {
      key: 'дресс_код',
      label: 'Дресс-код (опционально)',
      type: 'text',
      required: false,
      maxLength: 120,
    },
    {
      key: 'сбор_числа_гостей',
      label: 'Собирать число гостей (+1)',
      type: 'boolean',
      required: false,
    },
  ],
  startScreen: 'screen-1',
  screens: [
    {
      id: 'screen-1',
      kind: 'intro',
      elements: [
        { kind: 'image', id: 'cover', src: '{{фото_обложка}}' },
        { kind: 'heading', id: 'title', text: '{{название_события}}' },
        {
          kind: 'button',
          id: 'open',
          text: 'Открыть приглашение',
          action: 'click:open',
        },
      ],
      transitions: [{ on: 'click:open', to: 'screen-2' }],
      emits: [
        {
          type: 'opened',
          messageTemplate: 'Приглашение открыли: {{название_события}}.',
        },
      ],
    },
    {
      id: 'screen-2',
      kind: 'eventDetails',
      elements: [
        { kind: 'text', id: 'invite-text', text: '{{текст_приглашения}}' },
        {
          kind: 'text',
          id: 'details',
          text: '📅 {{дата}} · 🕐 {{время}} · 📍 {{место}}',
        },
        { kind: 'text', id: 'dresscode', text: 'Дресс-код: {{дресс_код}}' },
        { kind: 'countdown', id: 'countdown', props: { until: '{{дата}}' } },
        {
          kind: 'button',
          id: 'map',
          text: 'Показать на карте',
          action: 'click:map',
          props: { address: '{{адрес}}' },
        },
        {
          kind: 'button',
          id: 'rsvp',
          text: 'Подтвердить участие',
          action: 'click:rsvp',
        },
      ],
      transitions: [{ on: 'click:rsvp', to: 'screen-3' }],
    },
    {
      id: 'screen-3',
      kind: 'rsvp',
      elements: [
        { kind: 'input', id: 'guest-name', field: 'имя_гостя' },
        { kind: 'button', id: 'attend', text: 'Приду', action: 'submit:rsvp' },
        {
          kind: 'button',
          id: 'decline',
          text: 'Не смогу',
          action: 'submit:rsvp',
        },
        {
          kind: 'input',
          id: 'guests',
          field: 'число_гостей',
          props: { type: 'number', visibleIf: '{{сбор_числа_гостей}}' },
        },
      ],
      transitions: [{ on: 'submit:rsvp', to: 'screen-4' }],
    },
    {
      id: 'screen-4',
      kind: 'final',
      elements: [
        {
          kind: 'text',
          id: 'confirmation',
          text: 'Спасибо! Будем рады видеть тебя 🎉',
        },
        { kind: 'text', id: 'confetti', props: { effect: 'confetti' } },
      ],
      transitions: [],
      emits: [
        {
          type: 'rsvp',
          messageTemplate: '{{имя_гостя}}: {{статус_rsvp}} (+{{число_гостей}}).',
        },
      ],
    },
  ],
  premiumFeatures: [
    'Расширенные анимации и блёстки',
    'Фоновая музыка',
    'Без подписи бренда',
  ],
};
