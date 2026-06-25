/**
 * «Авиабилет» (boarding) — 6 экранов. Boarding pass на рейс «в незабываемое».
 */
import type { TemplateSchema } from './types';
import { composeFields } from './_dateFields';
import { tailScreens, PREMIUM } from './_multiScreen';

export const boarding: TemplateSchema = {
  id: 'boarding',
  name: 'Авиабилет',
  description: 'Электронный билет на рейс «обычный вечер → незабываемое свидание».',
  themes: ['neutral', 'romantic', 'playful'],
  fields: composeFields({
    photoLabel: 'Картинка приглашения',
    inviteLabel: 'Текст приглашения',
    content: [
      { key: 'пункт_назначения', label: 'Пункт назначения (куда летим)', type: 'text', required: true, maxLength: 80 },
    ],
  }),
  startScreen: 'ticket-mail',
  screens: [
    {
      id: 'ticket-mail',
      kind: 'intro',
      elements: [
        { kind: 'heading', id: 'h', text: '✈️ Вам пришёл билет' },
        { kind: 'text', id: 't', text: 'Электронный билет для пассажира {{имя_адресата}}.' },
        { kind: 'button', id: 'b', text: 'Открыть билет', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'pass' }],
      emits: [{ type: 'opened', messageTemplate: 'Билет открыли: {{имя_адресата}}.' }],
    },
    {
      id: 'pass',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: 'Рейс SA-YES' },
        { kind: 'text', id: 't', text: 'Откуда: обычный вечер · Куда: {{пункт_назначения}} · Пассажир: {{имя_адресата}}' },
        { kind: 'button', id: 'b', text: 'Регистрация на рейс →', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'invite' }],
    },
    ...tailScreens(
      'Приятного полёта! ✈️ Ваш пилот — {{подпись}}',
      '✈️ Пассажир {{имя_адресата}} прошёл регистрацию!',
    ),
  ],
  premiumFeatures: PREMIUM,
};
