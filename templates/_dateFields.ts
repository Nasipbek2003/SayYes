/**
 * Общий набор полей для всех «свидательных» шаблонов (date-ask и многоэкранные).
 *
 * Двухэкранный редактор (app/create) использует ХАРДКОД-подписи полей, а не
 * `field.label`, поэтому все шаблоны могут делить один и тот же набор ключей:
 * картинка → `фото`, заголовок → `screen1_title`, и т.д. Это позволяет одному
 * редактору обслуживать любой из этих шаблонов.
 */
import type { TemplateField } from './types';

export const sharedDateFields: TemplateField[] = [
  { key: 'имя_адресата', label: 'Имя адресата', type: 'text', required: true, maxLength: 60 },
  { key: 'фото', label: 'Картинка экрана 1', type: 'image', required: false },
  { key: 'screen1_title', label: 'Заголовок экрана 1', type: 'longtext', required: true, maxLength: 300 },
  { key: 'btn_yes', label: 'Кнопка «Да»', type: 'text', required: false, maxLength: 30 },
  { key: 'btn_no', label: 'Кнопка «Нет»', type: 'text', required: false, maxLength: 30 },
  { key: 'screen2_image', label: 'Картинка экрана 2', type: 'image', required: false },
  { key: 'screen2_title', label: 'Заголовок экрана 2', type: 'longtext', required: false, maxLength: 300 },
  { key: 'screen2_subtitle', label: 'Подзаголовок экрана 2', type: 'longtext', required: false, maxLength: 300 },
  { key: 'btn_confirm', label: 'Кнопка подтверждения', type: 'text', required: false, maxLength: 30 },
  { key: 'подпись', label: 'Подпись (ваше имя)', type: 'text', required: true, maxLength: 60 },
];
