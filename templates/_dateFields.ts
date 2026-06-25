/**
 * Переиспользуемые поля для «свидательных» шаблонов.
 *
 * Редактор (app/create) рендерит форму из `template.fields`, используя
 * `field.label`, поэтому у каждого шаблона своя форма. Эти хелперы собирают
 * общий «хвост» (приглашение → подтверждение → подпись), а каждый шаблон
 * добавляет свои контент-поля сверху.
 */
import type { TemplateField } from './types';

export const fName: TemplateField = {
  key: 'имя_адресата', label: 'Имя адресата', type: 'text', required: true, maxLength: 60,
};

export const fSignature: TemplateField = {
  key: 'подпись', label: 'Ваше имя (подпись)', type: 'text', required: true, maxLength: 60,
};

export function fPhoto(label = 'Картинка'): TemplateField {
  return { key: 'фото', label, type: 'image', required: false };
}

export function fInviteText(label = 'Текст приглашения'): TemplateField {
  return { key: 'screen1_title', label, type: 'longtext', required: true, maxLength: 300 };
}

export const fBtnYes: TemplateField = { key: 'btn_yes', label: 'Кнопка «Да»', type: 'text', required: false, maxLength: 30 };
export const fBtnNo: TemplateField = { key: 'btn_no', label: 'Кнопка «Нет»', type: 'text', required: false, maxLength: 30 };

/** Группа полей экрана подтверждения. */
export const confirmFields: TemplateField[] = [
  { key: 'screen2_image', label: 'Картинка подтверждения', type: 'image', required: false },
  { key: 'screen2_title', label: 'Заголовок подтверждения', type: 'longtext', required: false, maxLength: 300 },
  { key: 'screen2_subtitle', label: 'Подзаголовок подтверждения', type: 'longtext', required: false, maxLength: 300 },
  { key: 'btn_confirm', label: 'Кнопка подтверждения', type: 'text', required: false, maxLength: 30 },
];

/**
 * Собрать полный набор: имя + контент-поля шаблона + приглашение +
 * подтверждение + подпись.
 */
export function composeFields(opts: {
  content?: TemplateField[];
  photoLabel?: string;
  inviteLabel?: string;
}): TemplateField[] {
  return [
    fName,
    ...(opts.content ?? []),
    fPhoto(opts.photoLabel),
    fInviteText(opts.inviteLabel),
    fBtnYes,
    fBtnNo,
    ...confirmFields,
    fSignature,
  ];
}

/** Старый общий набор (для date-ask, если потребуется). */
export const sharedDateFields = composeFields({});
