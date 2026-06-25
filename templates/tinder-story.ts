/**
 * «Тиндер-стори» (tinder-story) — 7 экранов. Фейковый дейтинг с «IT'S A MATCH!».
 */
import type { TemplateSchema } from './types';
import { sharedDateFields } from './_dateFields';
import { tailScreens, PREMIUM } from './_multiScreen';

export const tinderStory: TemplateSchema = {
  id: 'tinder-story',
  name: 'Тиндер-стори',
  description: 'Фейковое дейтинг-приложение с моментом «IT’S A MATCH!» и чатом.',
  themes: ['romantic', 'playful', 'neutral'],
  fields: sharedDateFields,
  startScreen: 'loading',
  screens: [
    {
      id: 'loading',
      kind: 'intro',
      elements: [
        { kind: 'heading', id: 'h', text: 'LoveMatch™' },
        { kind: 'text', id: 't', text: 'Поиск идеальной пары для {{имя_адресата}}...' },
        { kind: 'button', id: 'b', text: 'Начать поиск 💘', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'profile' }],
      emits: [{ type: 'opened', messageTemplate: 'Профиль открыли: {{имя_адресата}}.' }],
    },
    {
      id: 'profile',
      kind: 'fork',
      elements: [
        { kind: 'image', id: 'img', src: '{{фото}}' },
        { kind: 'heading', id: 'h', text: '{{подпись}}, рядом' },
        { kind: 'text', id: 't', text: 'Хочет познакомиться с тобой поближе ✨' },
        { kind: 'button', id: 'like', text: '♥ Нравится', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'match' }],
    },
    {
      id: 'match',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: "IT'S A MATCH! 🎉" },
        { kind: 'text', id: 't', text: 'Вы понравились друг другу!' },
        { kind: 'button', id: 'b', text: 'Написать сообщение 💬', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'invite' }],
    },
    ...tailScreens(
      'Свидание назначено! 💘 Не забудь зарядить телефон — {{подпись}}',
      '💘 {{имя_адресата}} ответила на твой мэтч!',
    ),
  ],
  premiumFeatures: PREMIUM,
};
