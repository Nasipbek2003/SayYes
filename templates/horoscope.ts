/**
 * «Гороскоп совместимости» (horoscope) — 6 экранов. Совместимость всегда 100%.
 */
import type { TemplateSchema } from './types';
import { sharedDateFields } from './_dateFields';
import { tailScreens, PREMIUM } from './_multiScreen';

export const horoscope: TemplateSchema = {
  id: 'horoscope',
  name: 'Гороскоп совместимости',
  description: 'Звёзды рассчитывают вашу совместимость. Спойлер: 100%.',
  themes: ['neutral', 'romantic', 'playful'],
  fields: sharedDateFields,
  startScreen: 'sky',
  screens: [
    {
      id: 'sky',
      kind: 'intro',
      elements: [
        { kind: 'heading', id: 'h', text: '✨ Звёзды говорят...' },
        { kind: 'text', id: 't', text: '{{имя_адресата}}, узнай свою совместимость с {{подпись}}.' },
        { kind: 'button', id: 'b', text: 'Узнать гороскоп ♈', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'calc' }],
      emits: [{ type: 'opened', messageTemplate: 'Гороскоп открыли: {{имя_адресата}}.' }],
    },
    {
      id: 'calc',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: 'Расчёт совместимости...' },
        { kind: 'text', id: 't', text: '30% → 67% → 99% → 100% 💫' },
        { kind: 'button', id: 'b', text: 'Показать результат', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'result' }],
    },
    {
      id: 'result',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: 'Совместимость: 100%! 💫' },
        { kind: 'text', id: 't', text: 'Звёзды предсказывают вам незабываемый вечер.' },
        { kind: 'button', id: 'b', text: 'Что дальше?', action: 'click:next' },
      ],
      transitions: [{ on: 'click:next', to: 'invite' }],
    },
    ...tailScreens(
      'Записано в звёздный каталог! ✨ — {{подпись}}',
      '🌟 {{имя_адресата}} согласилась! Совместимость 100%.',
    ),
  ],
  premiumFeatures: PREMIUM,
};
