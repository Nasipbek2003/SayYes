'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, Mail, Pencil, Send, RefreshCw } from 'lucide-react';

import type { PreviewPayload, PreviewPlace } from '@/lib/services/invitation';
import type { TemplateField, TemplateSchema } from '@/templates/types';
import {
  type FormData,
  type PlaceDraft,
  addPlace,
  buildFieldScreenMap,
  buildInitialData,
  fieldInputKind,
  readPlaces,
  removePlace,
  setFieldValue,
  toPersistedData,
  updatePlace,
  validateAuthorForm,
} from '@/lib/create/form';
import { AUTOSAVE_DEBOUNCE_MS, Debouncer } from '@/lib/create/autosave';

import {
  ApiError,
  UnauthorizedError,
  checkTelegramLink,
  createDraft,
  devActivate,
  updateDraft,
  uploadPhoto,
} from './client';
import { PreviewPane } from './PreviewPane';
import styles from './create.module.css';

export interface CreateFormTemplate {
  id: string;
  name: string;
  description: string;
  fields: TemplateField[];
  premiumFeatures: string[];
  /** First screen the scenario engine should render (for the live preview). */
  startScreen: string;
  /** Full screen list, used to render the live in-editor preview locally. */
  screens: TemplateSchema['screens'];
}

export interface CreateFormProps {
  template: CreateFormTemplate;
  themeId: string;
  isAuthed?: boolean;
  /** Telegram bot username (without @) for the "open the bot" link. */
  botUsername?: string;
}

/** Готовые стикеры-картинки (лежат в /public) — для любого image-поля. */
const STICKERS = ['/1.webp', '/2.webp', '/3.webp', '/4.webp', '/5.webp', '/6.webp', '/7.webp', '/8.webp'];

const STEP_LABELS_START = 'Начало';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type MobileView = 'edit' | 'preview';
/** Telegram-ник: статус проверки доступа бота к аккаунту. */
type TgStatus = 'idle' | 'checking' | 'invalid' | 'linked' | 'not_linked';

export function CreateForm({ template, themeId, isAuthed = false, botUsername }: CreateFormProps) {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(() => buildInitialData({ fields: template.fields }));
  const [invitationId, setInvitationId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>('edit');
  const [activeScreenId, setActiveScreenId] = useState<string>(template.startScreen);
  /** Telegram-ник автора — туда придёт уведомление, когда гость ответит. */
  const [notifyTelegram, setNotifyTelegram] = useState('');
  /** Статус проверки: может ли бот написать на этот ник. */
  const [tgStatus, setTgStatus] = useState<TgStatus>('idle');
  /** Поля, которые автор уже редактировал — ошибки показываем только для них. */
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const markTouched = useCallback(
    (key: string) => setTouched((t) => (t[key] ? t : { ...t, [key]: true })),
    [],
  );

  const invitationIdRef = useRef<string | null>(null);
  invitationIdRef.current = invitationId;

  /** Latest Telegram nickname, so debounced auto-save reads the current value. */
  const notifyTelegramRef = useRef<string>('');
  notifyTelegramRef.current = notifyTelegram;

  /** Field key → the screen it affects, so the preview follows the editor. */
  const fieldScreenMap = useMemo(
    () => buildFieldScreenMap(template.screens, template.fields),
    [template.screens, template.fields],
  );

  const focusField = useCallback(
    (key: string) => setActiveScreenId(fieldScreenMap[key] ?? template.startScreen),
    [fieldScreenMap, template.startScreen],
  );

  /**
   * Поля, сгруппированные по экранам приглашения, в порядке самих экранов.
   * Каждая группа — отдельный уровень мастера: уровень 2 = экран 1, уровень 3 =
   * экран 2 и т.д. Поля, не привязанные ни к одному экрану, добавляются в первую
   * группу.
   */
  const fieldGroups = useMemo(() => {
    const byScreen = new Map<string, TemplateField[]>();
    const unmapped: TemplateField[] = [];
    for (const field of template.fields) {
      const screenId = fieldScreenMap[field.key];
      if (screenId) {
        const list = byScreen.get(screenId);
        if (list) list.push(field);
        else byScreen.set(screenId, [field]);
      } else {
        unmapped.push(field);
      }
    }
    const groups: { screenId: string; fields: TemplateField[] }[] = [];
    for (const screen of template.screens) {
      const list = byScreen.get(screen.id);
      if (list && list.length) groups.push({ screenId: screen.id, fields: list });
    }
    if (unmapped.length) {
      if (groups.length) groups[0] = { ...groups[0], fields: [...unmapped, ...groups[0].fields] };
      else groups.push({ screenId: template.startScreen, fields: unmapped });
    }
    return groups;
  }, [template.fields, template.screens, template.startScreen, fieldScreenMap]);

  const stepLabels = useMemo(
    () => [STEP_LABELS_START, ...fieldGroups.map((_, i) => `Экран ${i + 1}`)],
    [fieldGroups],
  );

  const groupIndex = step - 2;
  const currentGroup = groupIndex >= 0 ? fieldGroups[groupIndex] : undefined;
  const isLastGroup = step === 1 + fieldGroups.length;

  // Превью всегда показывает экран текущего уровня.
  useEffect(() => {
    if (currentGroup) setActiveScreenId(currentGroup.screenId);
  }, [currentGroup]);

  const validation = validateAuthorForm(template.id, data);

  /**
   * Live, client-side preview payload built straight from the form data — no
   * server round-trip and no draft/auth required, so the author sees changes
   * instantly while typing. It mirrors the shape the server preview endpoint
   * returns so {@link PreviewPane} can render it unchanged.
   */
  const previewPayload = useMemo<PreviewPayload>(() => {
    const persisted = toPersistedData(data);
    const placesKey = template.fields.find((f) => f.type === 'placesList')?.key;
    const places = placesKey ? ((persisted[placesKey] as PreviewPlace[]) ?? []) : [];
    return {
      invitationId: invitationId ?? 'preview',
      templateId: template.id,
      themeId,
      tier: 'BASIC' as PreviewPayload['tier'],
      features: { showBrandSignature: true, music: false, advancedAnimations: false, authorNotifications: false, premiumFeatures: [] },
      status: 'DRAFT' as PreviewPayload['status'],
      template: {
        name: template.name,
        description: template.description,
        startScreen: template.startScreen,
        screens: template.screens,
        premiumFeatures: template.premiumFeatures,
      },
      data: persisted,
      places,
      validation: { ok: validation.ok, errors: [] },
    };
  }, [data, template, themeId, invitationId, validation.ok]);

  const handleAuthError = useCallback(() => { router.push('/login'); }, [router]);

  const ensureDraft = useCallback(async (currentData: FormData): Promise<string | null> => {
    if (invitationIdRef.current) return invitationIdRef.current;
    try {
      const draft = await createDraft({
        templateId: template.id,
        themeId,
        data: toPersistedData(currentData),
        notifyTelegram: notifyTelegramRef.current || undefined,
      });
      invitationIdRef.current = draft.id;
      setInvitationId(draft.id);
      return draft.id;
    } catch (err) {
      if (err instanceof UnauthorizedError) handleAuthError();
      else setError(err instanceof ApiError ? err.message : 'Не удалось создать черновик.');
      return null;
    }
  }, [template.id, themeId, handleAuthError]);

  const persist = useCallback(async (currentData: FormData) => {
    setSaveState('saving');
    const id = await ensureDraft(currentData);
    if (!id) { setSaveState('error'); return; }
    try {
      await updateDraft(id, {
        data: toPersistedData(currentData),
        themeId,
        notifyTelegram: notifyTelegramRef.current,
      });
      setSaveState('saved');
    } catch (err) {
      if (err instanceof UnauthorizedError) { handleAuthError(); return; }
      setSaveState('error');
    }
  }, [ensureDraft, themeId, handleAuthError]);

  const debouncerRef = useRef<Debouncer<FormData> | null>(null);
  if (debouncerRef.current === null) {
    debouncerRef.current = new Debouncer<FormData>((value) => void persist(value), AUTOSAVE_DEBOUNCE_MS);
  }

  useEffect(() => {
    const debouncer = debouncerRef.current;
    return () => debouncer?.cancel();
  }, []);

  const setVal = (key: string, value: unknown) => {
    setData((prev) => {
      const next = setFieldValue(prev, key, value);
      // Auto-save only once the author is signed in; an anonymous visitor fills
      // the form freely (the live preview is local) and is asked to sign in only
      // when they request the link — see onActivate.
      if (isAuthed) debouncerRef.current?.schedule(next);
      return next;
    });
    if (isAuthed) setSaveState('saving');
  };

  const onChangeTelegram = (value: string) => {
    setNotifyTelegram(value);
    if (isAuthed && invitationIdRef.current) {
      debouncerRef.current?.schedule(data);
      setSaveState('saving');
    }
  };

  /** Проверить, может ли бот написать на указанный ник. */
  const verifyTelegram = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (trimmed === '') {
      setTgStatus('idle');
      return;
    }
    setTgStatus('checking');
    try {
      const { valid, linked } = await checkTelegramLink(trimmed);
      setTgStatus(!valid ? 'invalid' : linked ? 'linked' : 'not_linked');
    } catch {
      // 401 или сетевая ошибка — считаем, что доступ ещё не подтверждён.
      setTgStatus('not_linked');
    }
  }, []);

  // Автопроверка ника с задержкой, пока автор печатает.
  useEffect(() => {
    if (notifyTelegram.trim() === '') {
      setTgStatus('idle');
      return;
    }
    setTgStatus('checking');
    const timer = setTimeout(() => void verifyTelegram(notifyTelegram), 700);
    return () => clearTimeout(timer);
  }, [notifyTelegram, verifyTelegram]);

  const onUploadImage = async (key: string, file: File) => {    const id = await ensureDraft(data);
    if (!id) return;
    try {
      const { url } = await uploadPhoto(id, file);
      setVal(key, url);
    } catch (err) {
      if (err instanceof UnauthorizedError) handleAuthError();
      else setError(err instanceof ApiError ? err.message : 'Не удалось загрузить фото.');
    }
  };

  const onActivate = async () => {
    setError(null);
    if (!validation.ok) {
      // Подсветить незаполненные обязательные поля.
      setTouched(Object.fromEntries(template.fields.map((f) => [f.key, true])));
      setError('Заполни обязательные поля.');
      return;
    }
    setActivating(true);
    debouncerRef.current?.flushNow();
    const id = await ensureDraft(data);
    if (!id) { setActivating(false); return; }
    try {
      await updateDraft(id, {
        data: toPersistedData(data),
        themeId,
        notifyTelegram,
      });
      const { url } = await devActivate(id);
      window.location.href = url;
    } catch (err) {
      setActivating(false);
      if (err instanceof UnauthorizedError) handleAuthError();
      else setError(err instanceof ApiError ? err.message : 'Не удалось создать ссылку.');
    }
  };

  const saveLabel: Record<SaveState, string> = { idle: '', saving: 'Сохранение…', saved: 'Сохранено', error: 'Ошибка сохранения' };

  return (
    <div className={styles.wizard}>
      <span className={`${styles.petal} ${styles.petal1}`} aria-hidden="true" />
      <span className={`${styles.petal} ${styles.petal2}`} aria-hidden="true" />
      <span className={`${styles.petal} ${styles.petal3}`} aria-hidden="true" />
      <span className={`${styles.petal} ${styles.petal4}`} aria-hidden="true" />

      <div className={styles.progressBar}>
        {stepLabels.map((label, i) => {
          const n = i + 1;
          const isActive = n === step;
          const isDone = n < step;
          return (
            <span key={n} style={{ display: 'contents' }}>
              {i > 0 && <span className={`${styles.progressLine} ${isDone || isActive ? styles.progressLineDone : ''}`} />}
              <div className={styles.progressStep}>
                <span className={`${styles.progressDot} ${isActive ? styles.progressDotActive : ''} ${isDone ? styles.progressDotDone : ''}`}>
                  {isDone ? <Check size={18} strokeWidth={3} /> : n}
                </span>
                <span className={`${styles.progressLabel} ${isActive ? styles.progressLabelActive : ''} ${isDone ? styles.progressLabelDone : ''}`}>
                  {label}
                </span>
              </div>
            </span>
          );
        })}
      </div>

      <div className={styles.stepContent}>
        {/* ═══ Шаг 1: Приветствие (зависит от шаблона) ═══ */}
        {step === 1 && (
          <div className={styles.startScreen}>
            <div className={styles.startCard}>
              <span className={styles.startEmoji}><Mail size={44} strokeWidth={1.5} color="#E8367A" /></span>
              <h1 className={styles.startTitle}>{template.name}</h1>
              <p className={styles.startDesc}>{template.description}</p>
              <div className={styles.welcomeActions}>
                <button className={styles.btnPrimary} onClick={() => setStep(2)}>Создать →</button>
                <button className={styles.btnSecondary} onClick={() => router.push('/')}>В галерею</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Уровни 2…N: по одному экрану на уровень ═══ */}
        {step >= 2 && currentGroup && (
          <div className={styles.editorWrap}>
            <div className={styles.mobileToggle}>
              <div className={styles.screenTabs}>
                <button
                  type="button"
                  className={`${styles.screenTab} ${mobileView === 'edit' ? styles.screenTabActive : ''}`}
                  onClick={() => setMobileView('edit')}
                >
                  <Pencil size={15} /> Поля
                </button>
                <button
                  type="button"
                  className={`${styles.screenTab} ${mobileView === 'preview' ? styles.screenTabActive : ''}`}
                  onClick={() => setMobileView('preview')}
                >
                  <Eye size={16} /> Превью
                </button>
              </div>
            </div>

            <div className={styles.editorLayout}>
              {/* Левая колонка: живой телефон-превью текущего экрана */}
              <div className={styles.editorPreviewCol} data-hidden={mobileView === 'edit'}>
                <PreviewPane preview={previewPayload} activeScreenId={activeScreenId} />
              </div>

              {/* Правая колонка: поля только этого экрана */}
              <div className={styles.editorForm} data-hidden={mobileView === 'preview'}>
                <div className={styles.editorHeader}>
                  <h2 className={styles.editorHeaderTitle}>Экран {groupIndex + 1}</h2>
                  <p className={styles.editorHeaderDesc}>
                    Заполняй поля этого экрана — в превью слева сразу видно результат
                  </p>
                </div>

                <div className={styles.editorSection}>
                  {currentGroup.fields.map((field) => (
                    <FieldControl
                      key={field.key}
                      field={field}
                      value={data[field.key]}
                      error={touched[field.key] ? validation.fieldErrors[field.key] : undefined}
                      onChange={(v) => setVal(field.key, v)}
                      onUpload={(file) => onUploadImage(field.key, file)}
                      onFocus={() => focusField(field.key)}
                      onBlur={() => markTouched(field.key)}
                    />
                  ))}
                </div>

                {saveState !== 'idle' && <p className={styles.saveStatus}>{saveLabel[saveState]}</p>}
                {error && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}

                {isLastGroup && (
                  <div className={styles.field}>
                    <label className={styles.label}>
                      Твой Telegram для ответов
                      <span className={styles.optional}> (необяз.)</span>
                    </label>
                    <input
                      type="text"
                      className={styles.input}
                      value={notifyTelegram}
                      placeholder="@username"
                      autoComplete="off"
                      inputMode="text"
                      onChange={(e) => onChangeTelegram(e.target.value)}
                    />

                    {tgStatus === 'checking' && (
                      <span className={styles.fileHint}>Проверяем доступ…</span>
                    )}

                    {tgStatus === 'invalid' && (
                      <span className={styles.error}>
                        Это не похоже на ник Telegram. Пример: @anna_ivanova
                      </span>
                    )}

                    {tgStatus === 'linked' && (
                      <span className={styles.tgOk}>
                        <Check size={15} strokeWidth={3} /> Telegram подключён —
                        уведомления придут сюда.
                      </span>
                    )}

                    {tgStatus === 'not_linked' && (
                      <div className={styles.tgConnect}>
                        <p className={styles.tgConnectText}>
                          Пока не могу писать на этот ник. Открой бота, нажми{' '}
                          <strong>Start</strong>, потом вернись и нажми «Проверить».
                          Это нужно один раз.
                        </p>
                        <div className={styles.tgConnectActions}>
                          {botUsername && (
                            <a
                              className={styles.btnSecondary}
                              href={`https://t.me/${botUsername}?start=notify`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Send size={16} /> Открыть бота
                            </a>
                          )}
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            onClick={() => void verifyTelegram(notifyTelegram)}
                          >
                            <RefreshCw size={16} /> Проверить
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className={styles.stepActions}>
                  <button className={styles.btnBack} onClick={() => setStep(step - 1)}>← Назад</button>
                  {isLastGroup ? (
                    <button
                      className={styles.btnPrimary}
                      onClick={onActivate}
                      disabled={!validation.ok || activating}
                    >
                      {activating ? 'Создаём ссылку…' : 'Получить ссылку'}
                    </button>
                  ) : (
                    <button className={styles.btnPrimary} onClick={() => setStep(step + 1)}>
                      Далее →
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Контрол одного поля шаблона — выбирается по типу поля. */
function FieldControl({
  field, value, error, onChange, onUpload, onFocus, onBlur,
}: {
  field: TemplateField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  onUpload: (file: File) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const kind = fieldInputKind(field.type);
  const str = typeof value === 'string' ? value : '';

  const label = (
    <label className={styles.label}>
      {field.label}
      {!field.required ? <span className={styles.optional}> (необяз.)</span> : null}
    </label>
  );

  if (kind === 'image') {
    return (
      <div className={styles.field} onFocusCapture={onFocus} onPointerDownCapture={onFocus}>
        {label}
        <ImagePicker value={str} onPick={onChange} onUpload={onUpload} />
        {error ? <span className={styles.error}>{error}</span> : null}
      </div>
    );
  }

  if (kind === 'checkbox') {
    return (
      <div className={styles.checkboxRow} onFocusCapture={onFocus} onPointerDownCapture={onFocus}>
        <input type="checkbox" className={styles.checkbox} checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <label className={styles.label}>{field.label}</label>
      </div>
    );
  }

  if (kind === 'places') {
    return (
      <div className={styles.field} onFocusCapture={onFocus} onPointerDownCapture={onFocus}>
        {label}
        <PlacesEditor places={readPlaces(value)} onChange={onChange} />
        {error ? <span className={styles.error}>{error}</span> : null}
      </div>
    );
  }

  if (kind === 'textarea') {
    return (
      <div className={styles.field} onFocusCapture={onFocus} onBlurCapture={onBlur}>
        {label}
        <textarea
          className={error ? `${styles.textarea} ${styles['textarea--error']}` : styles.textarea}
          value={str}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {field.maxLength ? <span className={styles.charCount}>{str.length}/{field.maxLength}</span> : null}
        {error ? <span className={styles.error}>{error}</span> : null}
      </div>
    );
  }

  return (
    <div className={styles.field} onFocusCapture={onFocus} onBlurCapture={onBlur}>
      {label}
      <input
        type={kind === 'datetime' ? 'datetime-local' : 'text'}
        className={error ? `${styles.input} ${styles['input--error']}` : styles.input}
        value={str}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  );
}

/** Сетка готовых стикеров + загрузка своей картинки. */
function ImagePicker({ value, onPick, onUpload }: { value: string; onPick: (url: string) => void; onUpload: (file: File) => void }) {
  return (
    <div className={styles.imageBlock}>
      <div className={styles.imageGrid}>
        {STICKERS.map((src) => (
          <button
            type="button"
            key={src}
            className={`${styles.imageThumb} ${value === src ? styles.imageThumbActive : ''}`}
            onClick={() => onPick(src)}
            aria-label={`Выбрать ${src}`}
          >
            <img className={styles.imageThumbImg} src={src} alt="" />
          </button>
        ))}
      </div>
      <label className={styles.uploadOwn}>
        Загрузить свою
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }}
          onChange={(e) => { const file = e.target.files?.[0]; if (file) onUpload(file); }} />
      </label>
      <span className={styles.fileHint}>до 7 МБ, JPEG, PNG, GIF, WebP</span>
    </div>
  );
}

/** Редактор списка мест (для шаблонов с placesList). */
function PlacesEditor({ places, onChange }: { places: PlaceDraft[]; onChange: (places: PlaceDraft[]) => void }) {
  return (
    <div className={styles.places}>
      {places.map((place, index) => (
        <div className={styles.place} key={index}>
          <div className={styles.placeHead}>
            <span className={styles.placeTitle}>Место {index + 1}</span>
            <button type="button" className={styles.removeBtn} onClick={() => onChange(removePlace(places, index))}>Удалить</button>
          </div>
          <input className={styles.input} placeholder="Название" value={place.название}
            onChange={(e) => onChange(updatePlace(places, index, { название: e.target.value }))} />
          <input className={styles.input} placeholder="Описание (необяз.)" value={place.описание ?? ''}
            onChange={(e) => onChange(updatePlace(places, index, { описание: e.target.value }))} />
        </div>
      ))}
      <button type="button" className={styles.addBtn} onClick={() => onChange(addPlace(places))}>+ Добавить место</button>
    </div>
  );
}
