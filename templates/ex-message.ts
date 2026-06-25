/**
 * «СМС от бывшего» (ex-message) — 6 экранов. Интрига переписки → приглашение.
 */
import type { TemplateSchema } from './types';
import { composeFields } from './_dateFields';
import { tailScreens, PREMIUM } from './_multiScreen';

export const exMessage: TemplateSchema = {
  id: 'ex-message',
  name: 'Секретное сообщение',
  description: '«Нам надо поговорить...» — интрига переписки, которая ведёт к приглашению.',
  themes: ['romantic', 'playful', 'neutral'],
  fields: composeFields({
    photoLabel: 'Аватар в чате',
    inviteLabel: 'Текст приглашения (главное сообщение)',
    content: [
      { key: 'сообщение_1', label: 'Сообщение 1 (интрига)', type: 'longtext', required: true, maxLength: 200 },
      { key: 'сообщение_2', label: 'Сообщение 2', type: 'longtext', required: true, maxLength: 200 },
    ],
  }),
  startScreen: 'lock',
  screens: [
    {
      id: 'lock',
      kind: 'intro',
      elements: [
        { kind: 'heading', id: 'h', text: '📱 Новое сообщение от {{подпись}}' },
        { kind: 'text', id: 't', text: 'Нажми, чтобы прочитать...' },
        { kind: 'button', id: 'b', text: 'Разблокировать 🔓', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'msg1' }],
      emits: [{ type: 'opened', messageTemplate: 'Сообщение открыли: {{имя_адресата}}.' }],
    },
    {
      id: 'msg1',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: '{{подпись}}:' },
        { kind: 'text', id: 't', text: '{{сообщение_1}}' },
        { kind: 'button', id: 'b', text: 'Прочитать дальше', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'msg2' }],
    },
    {
      id: 'msg2',
      kind: 'fork',
      elements: [
        { kind: 'text', id: 't', text: '{{сообщение_2}}' },
        { kind: 'button', id: 'b', text: 'И что же?', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'invite' }],
    },
    ...tailScreens(
      'Сообщение доставлено ✓✓ — {{подпись}}',
      '💌 {{имя_адресата}} согласилась!',
    ),
  ],
  premiumFeatures: PREMIUM,
};
