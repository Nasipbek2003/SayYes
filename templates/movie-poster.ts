/**
 * Шаблон «Фильм про нас» (movie-poster).
 *
 * Кинематографичный сценарий: афиша фильма с именами «актёров», жанром и
 * рейтингом → приглашение → подтверждение → финал. Тёмно-золотая тема.
 *
 * Использует те же поля, что и date-ask → работает с тем же редактором.
 */
import type { TemplateSchema } from './types';
import { fNoBehavior } from './_dateFields';

export const moviePoster: TemplateSchema = {
  id: 'movie-poster',
  name: 'Фильм про нас',
  description: 'Кинопостер с вашими именами. «Купить билет» — значит сказать да.',
  themes: ['neutral', 'romantic', 'playful'],
  fields: [
    { key: 'имя_адресата', label: 'Имя (главная роль)', type: 'text', required: true, maxLength: 60 },
    { key: 'фото', label: 'Кадр из фильма', type: 'image', required: false },
    { key: 'screen1_title', label: 'Описание сюжета', type: 'longtext', required: true, maxLength: 300 },
    { key: 'btn_yes', label: 'Кнопка «Купить билет»', type: 'text', required: false, maxLength: 30 },
    { key: 'btn_no', label: 'Кнопка «Пропустить»', type: 'text', required: false, maxLength: 30 },
    fNoBehavior,
    { key: 'screen2_image', label: 'Картинка подтверждения', type: 'image', required: false },
    { key: 'screen2_title', label: 'Заголовок подтверждения', type: 'longtext', required: false, maxLength: 300 },
    { key: 'screen2_subtitle', label: 'Подзаголовок', type: 'longtext', required: false, maxLength: 300 },
    { key: 'btn_confirm', label: 'Кнопка подтверждения', type: 'text', required: false, maxLength: 30 },
    { key: 'подпись', label: 'Имя (вторая роль)', type: 'text', required: true, maxLength: 60 },
  ],
  startScreen: 'screen-1',
  screens: [
    {
      id: 'screen-1',
      kind: 'intro',
      elements: [
        { kind: 'heading', id: 'poster-title', text: '{{имя_адресата}} & {{подпись}}' },
        { kind: 'button', id: 'open', text: 'Купить билет 🎬', action: 'click:open' },
      ],
      transitions: [{ on: 'click:open', to: 'screen-2' }],
      emits: [
        { type: 'opened', messageTemplate: 'Афишу открыли: {{имя_адресата}}.' },
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
        { kind: 'text', id: 'success', text: 'Билет забронирован! 🎬 Премьера скоро. — {{подпись}}' },
        { kind: 'text', id: 'confetti', props: { effect: 'confetti' } },
      ],
      transitions: [],
      emits: [
        { type: 'accepted', messageTemplate: '🎬 {{имя_адресата}} забронировал(а) билет!' },
      ],
    },
  ],
  premiumFeatures: ['Расширенные анимации', 'Фоновая музыка', 'Без подписи бренда'],
};
