/**
 * «Машина времени» (time-machine) — 8 экранов. Путешествие по воспоминаниям.
 *
 * Использует две картинки автора (фото + screen2_image) как «эпохи».
 */
import type { TemplateSchema } from './types';
import { composeFields } from './_dateFields';
import { tailScreens, PREMIUM } from './_multiScreen';

export const timeMachine: TemplateSchema = {
  id: 'time-machine',
  name: 'Машина времени',
  description: 'Путешествие через ваши воспоминания к главному вопросу.',
  themes: ['romantic', 'neutral', 'playful'],
  fields: composeFields({
    photoLabel: 'Фото воспоминания 1',
    inviteLabel: 'Текст приглашения',
    content: [
      { key: 'воспоминание_1', label: 'Подпись к воспоминанию 1', type: 'text', required: true, maxLength: 120 },
      { key: 'воспоминание_2', label: 'Подпись к воспоминанию 2', type: 'text', required: true, maxLength: 120 },
    ],
  }),
  startScreen: 'start',
  screens: [
    {
      id: 'start',
      kind: 'intro',
      elements: [
        { kind: 'heading', id: 'h', text: '⏳ Машина времени' },
        { kind: 'text', id: 't', text: '{{имя_адресата}}, пристегнись. Запускаем!' },
        { kind: 'button', id: 'b', text: 'Запустить ⏳', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'era1' }],
      emits: [{ type: 'opened', messageTemplate: 'Машину времени запустили: {{имя_адресата}}.' }],
    },
    {
      id: 'era1',
      kind: 'fork',
      elements: [
        { kind: 'image', id: 'img', src: '{{фото}}' },
        { kind: 'heading', id: 'h', text: 'Помнишь этот момент?' },
        { kind: 'text', id: 't', text: '{{воспоминание_1}}' },
        { kind: 'button', id: 'b', text: 'Дальше →', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'era2' }],
    },
    {
      id: 'era2',
      kind: 'fork',
      elements: [
        { kind: 'image', id: 'img', src: '{{screen2_image}}' },
        { kind: 'heading', id: 'h', text: 'А этот?' },
        { kind: 'text', id: 't', text: '{{воспоминание_2}}' },
        { kind: 'button', id: 'b', text: 'Дальше →', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'now' }],
    },
    {
      id: 'now',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: 'А теперь — настоящее' },
        { kind: 'text', id: 't', text: 'Машина времени привезла тебя сюда. Здесь тебя кое-что ждёт...' },
        { kind: 'button', id: 'b', text: 'Что там?', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'invite' }],
    },
    ...tailScreens(
      'Новое воспоминание загружается... ⏳💛 — {{подпись}}',
      '⏳ {{имя_адресата}} согласилась создать новое воспоминание!',
    ),
  ],
  premiumFeatures: PREMIUM,
};
