/**
 * «Новость дня» (breaking-news) — 5 экранов. Экстренный выпуск новостей.
 */
import type { TemplateSchema } from './types';
import { sharedDateFields } from './_dateFields';
import { tailScreens, PREMIUM } from './_multiScreen';

export const breakingNews: TemplateSchema = {
  id: 'breaking-news',
  name: 'Новость дня',
  description: 'Экстренный выпуск: главная новость — приглашение на свидание.',
  themes: ['neutral', 'playful', 'romantic'],
  fields: sharedDateFields,
  startScreen: 'breaking',
  screens: [
    {
      id: 'breaking',
      kind: 'intro',
      elements: [
        { kind: 'heading', id: 'h', text: '🔴 BREAKING NEWS' },
        { kind: 'text', id: 't', text: 'Экстренное включение из студии любви!' },
        { kind: 'button', id: 'b', text: 'Смотреть выпуск 📺', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'report' }],
      emits: [{ type: 'opened', messageTemplate: 'Выпуск посмотрели: {{имя_адресата}}.' }],
    },
    {
      id: 'report',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: 'Главная новость' },
        { kind: 'text', id: 't', text: '{{подпись}} приглашает {{имя_адресата}} на свидание! Подробности — далее.' },
        { kind: 'button', id: 'b', text: 'Подробности →', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'invite' }],
    },
    ...tailScreens(
      'BREAKING: {{имя_адресата}} согласилась! Рейтинг новости — 💯 — {{подпись}}',
      '📰 СЕНСАЦИЯ: {{имя_адресата}} согласилась!',
    ),
  ],
  premiumFeatures: PREMIUM,
};
