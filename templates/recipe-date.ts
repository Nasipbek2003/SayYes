/**
 * Шаблон «Рецепт свидания» (recipe-date).
 *
 * Креативный сценарий в стиле кулинарной книги: рецепт идеального вечера с
 * «ингредиентами» → приглашение → подтверждение → финал. Тёплая крафт-тема.
 *
 * Использует те же поля, что и date-ask → работает с тем же редактором.
 */
import type { TemplateSchema } from './types';

export const recipeDate: TemplateSchema = {
  id: 'recipe-date',
  name: 'Рецепт свидания',
  description: 'Рецепт идеального вечера в стиле кулинарной книги.',
  themes: ['neutral', 'romantic', 'playful'],
  fields: [
    { key: 'имя_адресата', label: 'Имя адресата', type: 'text', required: true, maxLength: 60 },
    { key: 'фото', label: 'Картинка блюда/вечера', type: 'image', required: false },
    { key: 'screen1_title', label: 'Описание рецепта', type: 'longtext', required: true, maxLength: 300 },
    { key: 'btn_yes', label: 'Кнопка «Приготовить»', type: 'text', required: false, maxLength: 30 },
    { key: 'btn_no', label: 'Кнопка «Закрыть книгу»', type: 'text', required: false, maxLength: 30 },
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
        { kind: 'heading', id: 'recipe-title', text: 'Рецепт идеального вечера' },
        { kind: 'text', id: 'ingredients', text: 'Ингредиенты: 1 {{имя_адресата}}, 1 {{подпись}}, щепотка романтики' },
        { kind: 'button', id: 'open', text: 'Приготовить 🍳', action: 'click:open' },
      ],
      transitions: [{ on: 'click:open', to: 'screen-2' }],
      emits: [
        { type: 'opened', messageTemplate: 'Рецепт открыли: {{имя_адресата}}.' },
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
        { kind: 'text', id: 'success', text: 'Блюдо готово! 🍽 Приятного аппетита 💛 — {{подпись}}' },
        { kind: 'text', id: 'confetti', props: { effect: 'confetti' } },
      ],
      transitions: [],
      emits: [
        { type: 'accepted', messageTemplate: '🍳 {{имя_адресата}} согласилась!' },
      ],
    },
  ],
  premiumFeatures: ['Расширенные анимации', 'Фоновая музыка', 'Без подписи бренда'],
};
