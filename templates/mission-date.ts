/**
 * Шаблон «Миссия: Свидание» (mission-date).
 *
 * Шпионский игровой сценарий: адресат получает «секретное досье» в стиле
 * фильма — с грифом «СОВЕРШЕННО СЕКРЕТНО», фото агента, и заданием явиться
 * на свидание. Визуально тёмная тема с зелёными акцентами.
 *
 * Использует те же поля, что и date-ask/secret-letter → работает с тем же
 * двухэкранным редактором.
 *
 * Поток:
 *   screen-1 (секретная папка) → screen-2 (досье: Принять/Отклонить) →
 *   screen-3 (подтверждение) → screen-4 (финал: миссия принята)
 */
import type { TemplateSchema } from './types';

export const missionDate: TemplateSchema = {
  id: 'mission-date',
  name: 'Миссия: Свидание',
  description: 'Секретное досье в шпионском стиле. Задание: явиться на свидание.',
  themes: ['neutral', 'playful', 'romantic'],
  fields: [
    { key: 'имя_адресата', label: 'Имя агента (адресата)', type: 'text', required: true, maxLength: 60 },
    { key: 'фото', label: 'Фото в досье', type: 'image', required: false },
    { key: 'screen1_title', label: 'Текст задания', type: 'longtext', required: true, maxLength: 300 },
    { key: 'btn_yes', label: 'Кнопка «Принять»', type: 'text', required: false, maxLength: 30 },
    { key: 'btn_no', label: 'Кнопка «Отклонить»', type: 'text', required: false, maxLength: 30 },
    { key: 'screen2_image', label: 'Картинка подтверждения', type: 'image', required: false },
    { key: 'screen2_title', label: 'Заголовок подтверждения', type: 'longtext', required: false, maxLength: 300 },
    { key: 'screen2_subtitle', label: 'Подзаголовок', type: 'longtext', required: false, maxLength: 300 },
    { key: 'btn_confirm', label: 'Кнопка подтверждения', type: 'text', required: false, maxLength: 30 },
    { key: 'подпись', label: 'Кодовое имя (подпись)', type: 'text', required: true, maxLength: 60 },
  ],
  startScreen: 'screen-1',
  screens: [
    {
      id: 'screen-1',
      kind: 'intro',
      elements: [
        { kind: 'heading', id: 'classified', text: 'СОВЕРШЕННО СЕКРЕТНО' },
        { kind: 'text', id: 'agent', text: 'Агент {{имя_адресата}}, вам присвоено задание.' },
        { kind: 'button', id: 'open', text: 'Принять миссию 🔓', action: 'click:open' },
      ],
      transitions: [{ on: 'click:open', to: 'screen-2' }],
      emits: [
        { type: 'opened', messageTemplate: 'Досье открыли: агент {{имя_адресата}}.' },
      ],
    },
    {
      id: 'screen-2',
      kind: 'invite',
      elements: [
        { kind: 'image', id: 'photo', src: '{{фото}}' },
        { kind: 'heading', id: 'title', text: '{{screen1_title}}' },
        { kind: 'button', id: 'yes', text: '{{btn_yes}}', action: 'click:yes' },
        { kind: 'button', id: 'no', text: '{{btn_no}}', action: 'click:no' },
      ],
      transitions: [
        { on: 'click:yes', to: 'screen-3' },
        { on: 'click:no', to: 'screen-3' },
      ],
    },
    {
      id: 'screen-3',
      kind: 'invite',
      elements: [
        { kind: 'image', id: 'photo2', src: '{{screen2_image}}' },
        { kind: 'heading', id: 'title2', text: '{{screen2_title}}' },
        { kind: 'text', id: 'subtitle2', text: '{{screen2_subtitle}}' },
        { kind: 'button', id: 'yes', text: '{{btn_confirm}}', action: 'click:confirm' },
        { kind: 'button', id: 'no', text: '{{btn_no}}', action: 'click:confirm-no' },
      ],
      transitions: [{ on: 'click:confirm', to: 'screen-4' }],
    },
    {
      id: 'screen-4',
      kind: 'final',
      elements: [
        { kind: 'text', id: 'success', text: 'Миссия принята! 🎯 Агент {{подпись}} выходит на связь.' },
        { kind: 'text', id: 'confetti', props: { effect: 'confetti' } },
      ],
      transitions: [],
      emits: [
        { type: 'accepted', messageTemplate: '🎯 Агент {{имя_адресата}} принял(а) миссию!' },
      ],
    },
  ],
  premiumFeatures: ['Расширенные анимации', 'Фоновая музыка', 'Без подписи бренда'],
};
