/**
 * «Допрос с пристрастием» (interrogation) — 6 экранов. Шуточный допрос-викторина.
 */
import type { TemplateSchema } from './types';
import { sharedDateFields } from './_dateFields';
import { tailScreens, PREMIUM } from './_multiScreen';

export const interrogation: TemplateSchema = {
  id: 'interrogation',
  name: 'Допрос с пристрастием',
  description: 'Шуточный детектор лжи: тебя «допрашивают», готов(а) ли ты на свидание.',
  themes: ['neutral', 'playful', 'romantic'],
  fields: sharedDateFields,
  startScreen: 'start',
  screens: [
    {
      id: 'start',
      kind: 'intro',
      elements: [
        { kind: 'heading', id: 'h', text: '🚨 ВНИМАНИЕ' },
        { kind: 'text', id: 't', text: 'Агент {{имя_адресата}}, вы вызваны на допрос.' },
        { kind: 'button', id: 'b', text: 'Начать допрос 🎤', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'q1' }],
      emits: [{ type: 'opened', messageTemplate: 'Допрос начали: {{имя_адресата}}.' }],
    },
    {
      id: 'q1',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: 'Вопрос 1' },
        { kind: 'text', id: 't', text: 'Как вы относитесь к {{подпись}}?' },
        { kind: 'button', id: 'a1', text: 'Обожаю 😍', action: 'click:next' },
        { kind: 'button', id: 'a2', text: 'Терплю 😏', action: 'click:next' },
        { kind: 'button', id: 'a3', text: 'Без комментариев 🤐', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'q2' }],
    },
    {
      id: 'q2',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: 'Вопрос 2' },
        { kind: 'text', id: 't', text: 'Готовы провести вечер в компании {{подпись}}?' },
        { kind: 'button', id: 'a1', text: 'Конечно!', action: 'click:next' },
        { kind: 'button', id: 'a2', text: 'Надо подумать...', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'invite' }],
    },
    ...tailScreens(
      'Приговор вступил в силу! ⚖️ Свидание неизбежно — {{подпись}}',
      '⚖️ {{имя_адресата}} признан(а) виновной в симпатии!',
    ),
  ],
  premiumFeatures: PREMIUM,
};
