 /**
 * Шаблон «Секретное письмо» (secret-letter).
 *
 * Романтичный сценарий с анимацией конверта: запечатанный конверт → письмо с
 * приглашением (убегающая «Нет») → подтверждение → финал с конфетти.
 *
 * Использует те же ключи полей, что и `date-ask`, поэтому работает с тем же
 * двухэкранным редактором (app/create). Отличие — в рантайме: красивый
 * анимированный конверт и стилизация под рукописное письмо.
 *
 * Поток:
 *   screen-1 (конверт) → screen-2 (письмо: Да/убегающая Нет) →
 *   screen-3 (подтверждение) → screen-4 (финал)
 */
import type { TemplateSchema } from './types';
import { fNoBehavior } from './_dateFields';

export const secretLetter: TemplateSchema = {
  id: 'secret-letter',
  name: 'Секретное письмо',
  description: 'Запечатанный конверт распечатывается и раскрывает твоё приглашение.',
  themes: ['romantic', 'playful', 'neutral'],
  fields: [
    { key: 'имя_адресата', label: 'Имя адресата', type: 'text', required: true, maxLength: 60 },
    { key: 'фото', label: 'Картинка письма', type: 'image', required: false },
    { key: 'screen1_title', label: 'Текст письма', type: 'longtext', required: true, maxLength: 300 },
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
        { kind: 'heading', id: 'env-title', text: 'Письмо для {{имя_адресата}}' },
        { kind: 'button', id: 'open', text: 'Открыть письмо 💌', action: 'click:open' },
      ],
      transitions: [{ on: 'click:open', to: 'screen-2' }],
      emits: [
        { type: 'opened', messageTemplate: 'Письмо открыли: {{имя_адресата}}.' },
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
        { kind: 'text', id: 'success', text: 'Запечатано с любовью 💛 {{подпись}} скоро напишет тебе!' },
        { kind: 'text', id: 'confetti', props: { effect: 'confetti' } },
      ],
      transitions: [],
      emits: [
        { type: 'accepted', messageTemplate: '🎉 {{имя_адресата}} согласилась!' },
      ],
    },
  ],
  premiumFeatures: ['Расширенные анимации', 'Фоновая музыка', 'Без подписи бренда'],
};
