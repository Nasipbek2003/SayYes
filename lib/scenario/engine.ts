/**
 * ScenarioEngine — клиентский конечный автомат сценария (task 7.1).
 *
 * Движок интерпретирует декларативную {@link TemplateSchema} (см.
 * `templates/types.ts`) и ведёт адресата по экранам согласно их
 * `transitions`. Он **framework-независимый** и чисто логический: никаких
 * React-зависимостей и побочных эффектов. Рендер экранов и анимации — задача
 * 7.2 (`ScreenRenderer`), которая использует этот движок как источник состояния.
 *
 * Соответствует разделу дизайна «Components and Interfaces → 2. Scenario Engine»:
 *
 * ```ts
 * interface ScenarioEngine {
 *   current: ScreenSchema;          // текущий экран
 *   context: GuestContext;          // накопленные ответы
 *   dispatch(action, payload?): …;  // движение по transitions
 *   isFinal(): boolean;
 *   buildResponse(): GuestResponse; // финальный ответ для сервера
 * }
 * ```
 *
 * ## Модель работы
 * - Состояние = id текущего экрана + накопленные `answers`.
 * - {@link dispatch} принимает имя действия (совпадает с `Transition.on`,
 *   например `"click:yes"`, `"select:place"`) и необязательный `payload`.
 *   - Если `payload` — это объект, его поля **сливаются** в `answers`
 *     (например `{ выбранное_место: 'Парк' }`). Так UI-слой записывает выбор
 *     гостя в контекст, не зная внутренней структуры движка.
 *   - Затем ищется исходящий переход с подходящим `on`. Если найден — текущий
 *     экран меняется на `to`; иначе состояние экрана не меняется (действия без
 *     перехода, например убегающая кнопка «Нет», просто игнорируются).
 * - {@link isFinal} — текущий экран имеет `kind = 'final'`.
 * - {@link buildResponse} собирает {@link GuestResponse} из `answers` и типа
 *   события финального экрана (`accepted` / `declined` / `rsvp`).
 *
 * Целостность переходов (Correctness Property 4) гарантируется схемами
 * (`templates/*.ts`) и проверяется тестами: любой путь из `startScreen`
 * достижимо завершается экраном `kind = 'final'`, висячих переходов нет. Движок
 * дополнительно защищается на рантайме — переход на несуществующий `screen.id`
 * считается ошибкой схемы и бросает {@link ScenarioError}.
 */
import type {
  AuthorEvent,
  GuestContext,
  GuestResponse,
  ScreenSchema,
  TemplateSchema,
} from '@/templates/types';

/** Ошибка некорректной схемы/использования движка. */
export class ScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioError';
  }
}

/** Опции конструктора движка. */
export interface ScenarioEngineOptions {
  /** Предзаполненные ответы (например, восстановление состояния). */
  initialAnswers?: Record<string, unknown>;
}

/**
 * Маппинг ключей накопленного контекста на поля {@link GuestResponse}.
 *
 * Экраны записывают выбор гостя в `answers` по доменным ключам (`field` у
 * элементов схемы, например `выбранное_место`). `buildResponse` переносит их в
 * типизированные поля ответа, который уходит на сервер и валидируется
 * `TemplateRegistry.validateResponse`.
 */
const RESPONSE_KEY_MAP: Record<string, keyof GuestResponse> = {
  выбранное_место: 'place',
  выбранное_время: 'time',
  имя_гостя: 'guestName',
  число_гостей: 'guests',
  статус_rsvp: 'rsvp',
  rsvp: 'rsvp',
  guestName: 'guestName',
  guestKey: 'guestKey',
  place: 'place',
  time: 'time',
  guests: 'guests',
};

/** Конечный автомат прохождения сценария одним адресатом. */
export class ScenarioEngine {
  /** Схема шаблона, по которой идёт сценарий. */
  readonly schema: TemplateSchema;

  private readonly screensById: Map<string, ScreenSchema>;
  private currentId: string;
  private answers: Record<string, unknown>;

  constructor(schema: TemplateSchema, options: ScenarioEngineOptions = {}) {
    this.schema = schema;
    this.screensById = new Map(schema.screens.map((screen) => [screen.id, screen]));

    if (!this.screensById.has(schema.startScreen)) {
      throw new ScenarioError(
        `Template "${schema.id}" startScreen "${schema.startScreen}" does not exist.`,
      );
    }

    this.currentId = schema.startScreen;
    this.answers = { ...(options.initialAnswers ?? {}) };
  }

  /** Текущий экран. */
  get current(): ScreenSchema {
    const screen = this.screensById.get(this.currentId);
    if (!screen) {
      // Не должно случаться: переходы валидируются перед сменой экрана.
      throw new ScenarioError(`Current screen "${this.currentId}" does not exist.`);
    }
    return screen;
  }

  /** Накопленное состояние гостя (копия — внешняя мутация исключена). */
  get context(): GuestContext {
    return {
      templateId: this.schema.id,
      currentScreen: this.currentId,
      answers: { ...this.answers },
    };
  }

  /** Имена действий, по которым есть исходящий переход с текущего экрана. */
  availableActions(): string[] {
    return this.current.transitions.map((t) => t.on);
  }

  /** Есть ли с текущего экрана переход по действию `action`. */
  canDispatch(action: string): boolean {
    return this.current.transitions.some((t) => t.on === action);
  }

  /**
   * Обработать действие гостя.
   *
   * Сначала (если передан объект-`payload`) его поля сливаются в `answers`.
   * Затем ищется переход с `on === action`: при наличии — переход на `to`,
   * иначе состояние экрана не меняется.
   *
   * @returns `true`, если произошёл переход на другой экран; `false`, если
   *   действие не имеет перехода с текущего экрана.
   * @throws {@link ScenarioError} если переход ведёт на несуществующий экран
   *   (ошибка схемы — «висячий» переход).
   */
  dispatch(action: string, payload?: unknown): boolean {
    if (isPlainObject(payload)) {
      this.answers = { ...this.answers, ...payload };
    }

    const transition = this.current.transitions.find((t) => t.on === action);
    if (!transition) {
      return false;
    }

    if (!this.screensById.has(transition.to)) {
      throw new ScenarioError(
        `Dangling transition on "${action}" → "${transition.to}" in template "${this.schema.id}".`,
      );
    }

    this.currentId = transition.to;
    return true;
  }

  /** Достигнут ли финальный экран. */
  isFinal(): boolean {
    return this.current.kind === 'final';
  }

  /**
   * Принудительно перейти на экран `screenId` (например, чтобы показать финал
   * «уже отвечено» при повторном открытии после ответа — Требование 5.7). В
   * отличие от {@link dispatch}, это не движение по `transitions`, а прямой
   * скачок; накопленные `answers` сохраняются.
   *
   * @throws {@link ScenarioError} если экран с таким id не существует.
   */
  goTo(screenId: string): void {
    if (!this.screensById.has(screenId)) {
      throw new ScenarioError(
        `Cannot go to non-existent screen "${screenId}" in template "${this.schema.id}".`,
      );
    }
    this.currentId = screenId;
  }

  /** События автору, объявленные на текущем экране (для слоя уведомлений). */
  currentEmits(): AuthorEvent[] {
    return this.current.emits ?? [];
  }

  /**
   * Собрать финальный {@link GuestResponse} для отправки на сервер.
   *
   * Тип исхода берётся из события финального экрана (`accepted` / `declined` /
   * `rsvp`), а поля ответа — из накопленного контекста по {@link RESPONSE_KEY_MAP}.
   *
   * @throws {@link ScenarioError} если вызван не на финальном экране.
   */
  buildResponse(): GuestResponse {
    if (!this.isFinal()) {
      throw new ScenarioError(
        `buildResponse() called on non-final screen "${this.currentId}".`,
      );
    }

    const response: GuestResponse = { type: this.resolveOutcomeType() };

    for (const [contextKey, value] of Object.entries(this.answers)) {
      if (value === undefined || value === null) continue;
      const responseKey = RESPONSE_KEY_MAP[contextKey];
      if (responseKey) {
        response[responseKey] = value as never;
      }
    }

    return response;
  }

  /** Сбросить сценарий в начальное состояние. */
  reset(): void {
    this.currentId = this.schema.startScreen;
    this.answers = {};
  }

  /**
   * Определить тип исхода по событиям финального экрана. Предпочитается
   * нефактовое «opened»: финал несёт реальный исход (`accepted`/`declined`/
   * `rsvp`). Если эмитов нет — считаем согласием (единственный реальный исход
   * по умолчанию).
   */
  private resolveOutcomeType(): GuestResponse['type'] {
    const emits = this.current.emits ?? [];
    const outcome = emits.find((e) => e.type !== 'opened') ?? emits[0];
    return outcome?.type ?? 'accepted';
  }
}

/**
 * Построить движок по id шаблона из переданного списка схем. Удобная фабрика
 * для UI-слоя; не зависит от конкретного реестра.
 */
export function createScenarioEngine(
  schemas: readonly TemplateSchema[],
  templateId: string,
  options?: ScenarioEngineOptions,
): ScenarioEngine {
  const schema = schemas.find((s) => s.id === templateId);
  if (!schema) {
    throw new ScenarioError(`Template not found: ${templateId}`);
  }
  return new ScenarioEngine(schema, options);
}

/** Узкая проверка «обычного» объекта (не массив, не null). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
