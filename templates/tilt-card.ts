/**
 * Шаблон «Наклони телефон» (tilt-card).
 *
 * Флагманская «вау»-механика: гироскоп (`DeviceOrientationEvent`) двигает
 * блеск/тени/частицы по 3D-карточке как на голографической открытке. Задача
 * адресата — «поймать» блеск в центре карточки (лёгкий пазл на удержание),
 * после чего раскрывается обычное приглашение Да / убегающая Нет.
 *
 * На десктопе и при отказе в доступе к сенсору (или отсутствии
 * `DeviceOrientationEvent`) наклон имитируется движением мыши/пальца —
 * см. `TiltCard.tsx` / `tilt.ts`.
 *
 * Поток:
 *   screen-1 (наклони и поймай блеск) → screen-2 (приглашение: Да/убегающая Нет)
 *   → screen-3 (подтверждение) → screen-4 (финал)
 */
import type { TemplateSchema } from './types';
import { fNoBehavior } from './_dateFields';

export const tiltCard: TemplateSchema = {
  id: 'tilt-card',
  name: 'Наклони телефон',
  description: 'Голографическая карточка: поймай блеск наклоном телефона, чтобы открыть приглашение.',
  themes: ['romantic', 'playful', 'neutral'],
  fields: [
    { key: 'имя_адресата', label: 'Имя адресата', type: 'text', required: true, maxLength: 60 },
    { key: 'фото', label: 'Картинка на карточке', type: 'image', required: false },
    { key: 'screen1_title', label: 'Текст приглашения', type: 'longtext', required: true, maxLength: 300 },
    { key: 'btn_yes', label: 'Кнопка «Да»', type: 'text', required: false, maxLength: 30 },
    { key: 'btn_no', label: 'Кнопка «Нет»', type: 'text', required: false, maxLength: 30 },
    fNoBehavior,
    { key: 'screen2_image', label: 'Картинка подтверждения', type: 'image', required: false },
    { key: 'screen2_title', label: 'Заголовок подтверждения', type: 'longtext', required: false, maxLength: 300 },
    { key: 'screen2_subtitle', label: 'Подзаголовок', type: 'longtext', required: false, maxLength: 300 },
    { key: 'btn_confirm', label: 'Кнопка подтверждения', type: 'text', required: false, maxLength: 30 },
    { key: 'подпись', label: 'Подпись (ваше имя)', type: 'text', required: true, maxLength: 60 },
  ],
  startScreen: 'screen-1',
  screens: [
    {
      id: 'screen-1',
      kind: 'intro',
      elements: [
        { kind: 'heading', id: 'title', text: 'Наклони телефон, {{имя_адресата}} ✨' },
        { kind: 'image', id: 'photo', src: '{{фото}}' },
        { kind: 'button', id: 'open', text: 'Открыть', action: 'click:open' },
      ],
      transitions: [{ on: 'click:open', to: 'screen-2' }],
      emits: [
        { type: 'opened', messageTemplate: 'Приглашение открыли: {{имя_адресата}}.' },
      ],
    },
    {
      id: 'screen-2',
      kind: 'invite',
      elements: [
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
        { kind: 'text', id: 'success', text: 'Блеск пойман! ✨ {{подпись}} скоро напишет тебе.' },
        { kind: 'text', id: 'confetti', props: { effect: 'confetti' } },
      ],
      transitions: [],
      emits: [
        { type: 'accepted', messageTemplate: '📱 {{имя_адресата}} согласилась!' },
      ],
    },
  ],
  premiumFeatures: ['Голографический 3D-эффект', 'Расширенные анимации', 'Без подписи бренда'],
};
