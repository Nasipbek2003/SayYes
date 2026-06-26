/**
 * Шаблон «Приглашение на свидание» (date-ask) — двухэкранный редактор.
 *
 * Полностью управляется данными из визуального редактора (app/create):
 * автор выбирает картинку и пишет тексты для двух экранов, а готовая ссылка
 * рендерится обобщённым рендерером (ElementList) с подстановкой `{{переменных}}`.
 *
 * Поток:
 *   screen-1 (приглашение) ──Да/Нет──► screen-2 (подтверждение) ──Да──► screen-3 (финал)
 *
 * Ключи полей совпадают с тем, что пишет редактор в app/create/CreateForm.tsx:
 *   фото, screen1_title, btn_yes, btn_no,
 *   screen2_image, screen2_title, screen2_subtitle, btn_confirm,
 *   имя_адресата (для OG-тизера) и подпись (для финала).
 */
import type { TemplateSchema } from './types';

export const dateAsk: TemplateSchema = {
  id: 'date-ask',
  name: 'Приглашение на свидание',
  description: 'Два экрана: вопрос и милое подтверждение. Выбери картинки и впиши тексты.',
  themes: ['romantic', 'playful', 'neutral'],
  fields: [
    { key: 'имя_адресата', label: 'Имя адресата', type: 'text', required: true, maxLength: 60, placeholder: 'Например: Аля' },
    { key: 'фото', label: 'Картинка экрана 1', type: 'image', required: false },
    { key: 'screen1_title', label: 'Заголовок экрана 1', type: 'longtext', required: true, maxLength: 300, defaultValue: 'Пойдёшь со мной на свидание?' },
    { key: 'btn_yes', label: 'Кнопка «Да»', type: 'text', required: false, maxLength: 30, defaultValue: 'Да' },
    { key: 'btn_no', label: 'Кнопка «Нет»', type: 'text', required: false, maxLength: 30, defaultValue: 'Нет' },
    { key: 'screen2_image', label: 'Картинка экрана 2', type: 'image', required: false },
    { key: 'screen2_title', label: 'Заголовок экрана 2', type: 'longtext', required: false, maxLength: 300, defaultValue: 'Ура, я так рада! 🎉' },
    { key: 'screen2_subtitle', label: 'Подзаголовок экрана 2', type: 'longtext', required: false, maxLength: 300, defaultValue: 'Скоро напишу все детали нашей встречи 💛' },
    { key: 'btn_confirm', label: 'Кнопка подтверждения', type: 'text', required: false, maxLength: 30, defaultValue: 'Подтвердить' },
    { key: 'подпись', label: 'Подпись (ваше имя)', type: 'text', required: true, maxLength: 60, placeholder: 'Например: Тимур' },
  ],
  startScreen: 'screen-1',
  screens: [
    {
      id: 'screen-1',
      kind: 'invite',
      elements: [
        { kind: 'image', id: 'photo', src: '{{фото}}' },
        { kind: 'heading', id: 'title', text: '{{screen1_title}}' },
        { kind: 'button', id: 'yes', text: '{{btn_yes}}', action: 'click:yes' },
        { kind: 'button', id: 'no', text: '{{btn_no}}', action: 'click:no' },
      ],
      transitions: [
        { on: 'click:yes', to: 'screen-2' },
        { on: 'click:no', to: 'screen-2' },
      ],
      emits: [
        { type: 'opened', messageTemplate: 'Приглашение открыли: {{имя_адресата}}.' },
      ],
    },
    {
      id: 'screen-2',
      kind: 'invite',
      elements: [
        { kind: 'image', id: 'photo2', src: '{{screen2_image}}' },
        { kind: 'heading', id: 'title2', text: '{{screen2_title}}' },
        { kind: 'text', id: 'subtitle2', text: '{{screen2_subtitle}}' },
        // Положительная кнопка (id 'yes') → финал; «Нет» (id 'no') убегает.
        { kind: 'button', id: 'yes', text: '{{btn_confirm}}', action: 'click:confirm' },
        { kind: 'button', id: 'no', text: '{{btn_no}}', action: 'click:confirm-no' },
      ],
      transitions: [{ on: 'click:confirm', to: 'screen-3' }],
    },
    {
      id: 'screen-3',
      kind: 'final',
      elements: [
        { kind: 'text', id: 'success', text: 'Ура! 🎉 {{подпись}} скоро напишет тебе 💛' },
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
