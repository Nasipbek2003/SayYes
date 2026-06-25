/**
 * Общий «хвост» многоэкранных шаблонов: приглашение → подтверждение → финал.
 *
 * Эти три экрана одинаковы во всех многоэкранных шаблонах и рендерятся общими
 * компонентами рантайма (DateAskInvite / DateAskFinal). Декоративные экраны
 * (интро, чат, новости и т.п.) у каждого шаблона свои и ведут на экран `invite`.
 */
import type { ScreenSchema } from './types';

/** Экран «приглашение» (id `invite`) — картинка + заголовок + Да/убегающая Нет. */
export function inviteScreen(): ScreenSchema {
  return {
    id: 'invite',
    kind: 'invite',
    elements: [
      { kind: 'image', id: 'photo', src: '{{фото}}' },
      { kind: 'heading', id: 'title', text: '{{screen1_title}}' },
      { kind: 'button', id: 'yes', text: '{{btn_yes}}', action: 'click:yes' },
      { kind: 'button', id: 'no', text: '{{btn_no}}', action: 'click:no' },
    ],
    transitions: [
      { on: 'click:yes', to: 'confirm' },
      { on: 'click:no', to: 'confirm' },
    ],
  };
}

/** Экран «подтверждение» (id `confirm`). */
export function confirmScreen(): ScreenSchema {
  return {
    id: 'confirm',
    kind: 'invite',
    elements: [
      { kind: 'image', id: 'photo2', src: '{{screen2_image}}' },
      { kind: 'heading', id: 'title2', text: '{{screen2_title}}' },
      { kind: 'text', id: 'subtitle2', text: '{{screen2_subtitle}}' },
      { kind: 'button', id: 'yes', text: '{{btn_confirm}}', action: 'click:confirm' },
      { kind: 'button', id: 'no', text: '{{btn_no}}', action: 'click:confirm-no' },
    ],
    transitions: [{ on: 'click:confirm', to: 'final' }],
  };
}

/** Финальный экран (id `final`) с конфетти и событием `accepted`. */
export function finalScreen(successText: string, acceptedMessage: string): ScreenSchema {
  return {
    id: 'final',
    kind: 'final',
    elements: [
      { kind: 'text', id: 'success', text: successText },
      { kind: 'text', id: 'confetti', props: { effect: 'confetti' } },
    ],
    transitions: [],
    emits: [{ type: 'accepted', messageTemplate: acceptedMessage }],
  };
}

/** Все три «хвостовых» экрана разом. */
export function tailScreens(successText: string, acceptedMessage: string): ScreenSchema[] {
  return [inviteScreen(), confirmScreen(), finalScreen(successText, acceptedMessage)];
}

export const PREMIUM = ['Расширенные анимации', 'Фоновая музыка', 'Без подписи бренда'];
