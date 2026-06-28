/**
 * «Квест: Найди приглашение» (quest) — интерактивный мини-квест с двумя
 * загадками, у каждой — 1 правильный + 2–3 неправильных варианта ответа.
 *
 * Структура экранов:
 *  intro     → r1           — приветствие / начало квеста
 *  r1        → r1_wrong | r2  — загадка 1 (правильный ответ → r2, остальные → r1_wrong)
 *  r1_wrong  → r1           — «Не то! Подумай ещё» с возвратом к загадке 1
 *  r2        → r2_wrong | chest — загадка 2 (правильный → тайник, остальные → r2_wrong)
 *  r2_wrong  → r2           — «Не то!» с возвратом к загадке 2
 *  chest     → invite       — «Ты нашла тайник!»
 *  invite    → confirm      — собственно приглашение
 *  confirm   → final        — подтверждение
 *  final                    — финал с конфетти
 *
 * Автор задаёт:
 *  - текст каждой загадки
 *  - правильный ответ
 *  - 2 неправильных варианта (+ опциональный 3-й)
 *  - подсказку при неверном ответе (необяз.)
 */
import type { TemplateSchema } from './types';
import { composeFields } from './_dateFields';
import { tailScreens, PREMIUM } from './_multiScreen';

export const quest: TemplateSchema = {
  id: 'quest',
  name: 'Квест: найди приглашение',
  description: 'Мини-квест с двумя загадками и тайником. Угадай — получишь приглашение!',
  themes: ['neutral', 'playful', 'romantic'],
  fields: composeFields({
    photoLabel: 'Картинка приглашения',
    inviteLabel: 'Текст приглашения (в тайнике)',
    content: [
      /* ── Загадка 1 ── */
      {
        key: 'загадка_1',
        label: 'Загадка 1 — текст',
        type: 'longtext',
        required: true,
        maxLength: 250,
        placeholder: 'Например: Меня нельзя купить, но можно потерять. Что это?',
      },
      {
        key: 'загадка_1_верно',
        label: 'Загадка 1 — правильный ответ',
        type: 'text',
        required: true,
        maxLength: 60,
        placeholder: 'Например: Время ⏳',
      },
      {
        key: 'загадка_1_неверно_1',
        label: 'Загадка 1 — неверный вариант 1',
        type: 'text',
        required: true,
        maxLength: 60,
        placeholder: 'Например: Деньги 💰',
      },
      {
        key: 'загадка_1_неверно_2',
        label: 'Загадка 1 — неверный вариант 2',
        type: 'text',
        required: true,
        maxLength: 60,
        placeholder: 'Например: Книга 📚',
      },
      {
        key: 'загадка_1_неверно_3',
        label: 'Загадка 1 — неверный вариант 3 (необяз.)',
        type: 'text',
        required: false,
        maxLength: 60,
        placeholder: 'Например: Мечта ✨',
      },
      {
        key: 'загадка_1_подсказка',
        label: 'Загадка 1 — подсказка при неверном ответе (необяз.)',
        type: 'text',
        required: false,
        maxLength: 120,
        placeholder: 'Например: Оно всегда идёт вперёд...',
      },

      /* ── Загадка 2 ── */
      {
        key: 'загадка_2',
        label: 'Загадка 2 — текст',
        type: 'longtext',
        required: true,
        maxLength: 250,
        placeholder: 'Например: Без рук, без ног, а дверь открывает. Что это?',
      },
      {
        key: 'загадка_2_верно',
        label: 'Загадка 2 — правильный ответ',
        type: 'text',
        required: true,
        maxLength: 60,
        placeholder: 'Например: Ключ 🔑',
      },
      {
        key: 'загадка_2_неверно_1',
        label: 'Загадка 2 — неверный вариант 1',
        type: 'text',
        required: true,
        maxLength: 60,
        placeholder: 'Например: Ветер 🌬️',
      },
      {
        key: 'загадка_2_неверно_2',
        label: 'Загадка 2 — неверный вариант 2',
        type: 'text',
        required: true,
        maxLength: 60,
        placeholder: 'Например: Замок 🔒',
      },
      {
        key: 'загадка_2_неверно_3',
        label: 'Загадка 2 — неверный вариант 3 (необяз.)',
        type: 'text',
        required: false,
        maxLength: 60,
        placeholder: 'Например: Огонь 🔥',
      },
      {
        key: 'загадка_2_подсказка',
        label: 'Загадка 2 — подсказка при неверном ответе (необяз.)',
        type: 'text',
        required: false,
        maxLength: 120,
        placeholder: 'Например: Им открывают замки...',
      },
    ],
  }),
  startScreen: 'intro',
  screens: [
    /* ── Вступление ── */
    {
      id: 'intro',
      kind: 'intro',
      elements: [
        { kind: 'heading', id: 'h', text: '🔍 Тайная миссия' },
        {
          kind: 'text',
          id: 't',
          text: '{{имя_адресата}}, я спрятал(а) кое-что важное. Реши две загадки — и найдёшь!',
        },
        { kind: 'button', id: 'start', text: 'Начать квест 🚀', action: 'click:start' },
      ],
      transitions: [{ on: 'click:start', to: 'r1' }],
      emits: [{ type: 'opened', messageTemplate: 'Квест начат: {{имя_адресата}} в деле!' }],
    },

    /* ── Загадка 1 ── */
    {
      id: 'r1',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: '🧩 Загадка 1 из 2' },
        { kind: 'text', id: 'q', text: '{{загадка_1}}' },
        /* Правильный ответ — action click:r1_correct */
        { kind: 'button', id: 'r1a_right', text: '{{загадка_1_верно}}', action: 'click:r1_correct' },
        /* Неверные варианты — все ведут на r1_wrong */
        { kind: 'button', id: 'r1a_w1', text: '{{загадка_1_неверно_1}}', action: 'click:r1_wrong' },
        { kind: 'button', id: 'r1a_w2', text: '{{загадка_1_неверно_2}}', action: 'click:r1_wrong' },
        { kind: 'button', id: 'r1a_w3', text: '{{загадка_1_неверно_3}}', action: 'click:r1_wrong' },
      ],
      transitions: [
        { on: 'click:r1_correct', to: 'r2' },
        { on: 'click:r1_wrong', to: 'r1_wrong' },
      ],
    },

    /* ── Неверный ответ на загадку 1 ── */
    {
      id: 'r1_wrong',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: '❌ Не то!' },
        { kind: 'text', id: 'hint', text: '{{загадка_1_подсказка}}' },
        { kind: 'button', id: 'retry', text: 'Попробовать ещё раз 🔄', action: 'click:retry_r1' },
      ],
      transitions: [{ on: 'click:retry_r1', to: 'r1' }],
    },

    /* ── Загадка 2 ── */
    {
      id: 'r2',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: '🧩 Загадка 2 из 2' },
        { kind: 'text', id: 'q', text: '{{загадка_2}}' },
        { kind: 'button', id: 'r2a_right', text: '{{загадка_2_верно}}', action: 'click:r2_correct' },
        { kind: 'button', id: 'r2a_w1', text: '{{загадка_2_неверно_1}}', action: 'click:r2_wrong' },
        { kind: 'button', id: 'r2a_w2', text: '{{загадка_2_неверно_2}}', action: 'click:r2_wrong' },
        { kind: 'button', id: 'r2a_w3', text: '{{загадка_2_неверно_3}}', action: 'click:r2_wrong' },
      ],
      transitions: [
        { on: 'click:r2_correct', to: 'chest' },
        { on: 'click:r2_wrong', to: 'r2_wrong' },
      ],
    },

    /* ── Неверный ответ на загадку 2 ── */
    {
      id: 'r2_wrong',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: '❌ Не то!' },
        { kind: 'text', id: 'hint', text: '{{загадка_2_подсказка}}' },
        { kind: 'button', id: 'retry', text: 'Попробовать ещё раз 🔄', action: 'click:retry_r2' },
      ],
      transitions: [{ on: 'click:retry_r2', to: 'r2' }],
    },

    /* ── Тайник ── */
    {
      id: 'chest',
      kind: 'fork',
      elements: [
        { kind: 'heading', id: 'h', text: '🎁 Тайник найден!' },
        {
          kind: 'text',
          id: 't',
          text: '{{имя_адресата}}, ты справилась! Внутри что-то важное...',
        },
        { kind: 'button', id: 'open', text: 'Открыть 🔓', action: 'click:open' },
      ],
      transitions: [{ on: 'click:open', to: 'invite' }],
    },

    /* ── Общий хвост: invite → confirm → final ── */
    ...tailScreens(
      '🏆 Квест пройден! Свидание с {{подпись}} — твоя награда!',
      '🏆 {{имя_адресата}} прошёл(а) квест и согласился(ась)!',
    ),
  ],
  premiumFeatures: PREMIUM,
};
