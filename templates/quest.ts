/**
 * «Квест: Найди приглашение» (quest) — 7 экранов. Загадки → тайник → приглашение.
 */
import type { TemplateSchema } from './types';
import { sharedDateFields } from './_dateFields';
import { tailScreens, PREMIUM } from './_multiScreen';

export const quest: TemplateSchema = {
  id: 'quest',
  name: 'Квест: найди приглашение',
  description: 'Мини-квест с загадками и тайником, где спрятано приглашение.',
  themes: ['neutral', 'playful', 'romantic'],
  fields: sharedDateFields,
  startScreen: 'intro',
  screens: [
    {
      id: 'intro',
      kind: 'intro',
      elements: [
        { kind: 'heading', id: 'h', text: '🔍 Тайная миссия' },
        { kind: 'text', id: 't', text: '{{имя_адресата}}, у меня для тебя кое-что есть... но сначала найди!' },
        { kind: 'button', id: 'b', text: 'Начать квест', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'r1' }],
      emits: [{ type: 'opened', messageTemplate: 'Квест начали: {{имя_адресата}}.' }],
    },
    {
      id: 'r1',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: 'Загадка №1' },
        { kind: 'text', id: 't', text: 'Что нельзя удержать, но можно подарить?' },
        { kind: 'button', id: 'a1', text: 'Время ⏳', action: 'click:next' },
        { kind: 'button', id: 'a2', text: 'Улыбку 😊', action: 'click:next' },
        { kind: 'button', id: 'a3', text: 'Сердце ❤️', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'r2' }],
    },
    {
      id: 'r2',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: 'Загадка №2' },
        { kind: 'text', id: 't', text: 'Чем больше делишься, тем больше становится. Что это?' },
        { kind: 'button', id: 'a1', text: 'Радость ✨', action: 'click:next' },
        { kind: 'button', id: 'a2', text: 'Любовь 💛', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'chest' }],
    },
    {
      id: 'chest',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: 'Ты нашёл(а) тайник! 🎁' },
        { kind: 'text', id: 't', text: 'Внутри что-то спрятано... Открыть?' },
        { kind: 'button', id: 'b', text: 'Открыть тайник', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'invite' }],
    },
    ...tailScreens(
      'Квест пройден! 🏆 Награда — свидание с {{подпись}}',
      '🏆 {{имя_адресата}} прошёл(ла) квест и согласился(ась)!',
    ),
  ],
  premiumFeatures: PREMIUM,
};
