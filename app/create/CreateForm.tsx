'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { PreviewPayload } from '@/lib/services/invitation';
import type { TemplateField } from '@/templates/types';
import {
  type FormData,
  type PlaceDraft,
  addPlace,
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
  createDraft,
  devActivate,
  fetchPreview,
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
}

export interface CreateFormProps {
  template: CreateFormTemplate;
  themeId: string;
  isAuthed?: boolean;
}

/** Готовые стикеры-картинки (лежат в /public) — для любого image-поля. */
const STICKERS = ['/1.webp', '/2.webp', '/3.webp', '/4.webp', '/5.webp', '/6.webp', '/7.webp', '/8.webp'];

const TOTAL_STEPS = 3;
const STEP_LABELS = ['Начало', 'Заполни поля', 'Готово'];
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function CreateForm({ template, themeId }: CreateFormProps) {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(() => buildInitialData({ fields: template.fields }));
  const [invitationId, setInvitationId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  const invitationIdRef = useRef<string | null>(null);
  invitationIdRef.current = invitationId;

  const validation = validateAuthorForm(template.id, data);

  const handleAuthError = useCallback(() => { router.push('/login'); }, [router]);

  const ensureDraft = useCallback(async (currentData: FormData): Promise<string | null> => {
    if (invitationIdRef.current) return invitationIdRef.current;
    try {
      const draft = await createDraft({ templateId: template.id, themeId, data: toPersistedData(currentData) });
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
      await updateDraft(id, { data: toPersistedData(currentData), themeId });
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
      debouncerRef.current?.schedule(next);
      return next;
    });
    setSaveState('saving');
  };

  const onUploadImage = async (key: string, file: File) => {
    const id = await ensureDraft(data);
    if (!id) return;
    try {
      const { url } = await uploadPhoto(id, file);
      setVal(key, url);
    } catch (err) {
      if (err instanceof UnauthorizedError) handleAuthError();
      else setError(err instanceof ApiError ? err.message : 'Не удалось загрузить фото.');
    }
  };

  const onPreview = async () => {
    setError(null);
    debouncerRef.current?.flushNow();
    const id = await ensureDraft(data);
    if (!id) return;
    try {
      await updateDraft(id, { data: toPersistedData(data), themeId });
      const payload = await fetchPreview(id);
      setPreview(payload);
      setStep(3);
    } catch (err) {
      if (err instanceof UnauthorizedError) handleAuthError();
      else setError(err instanceof ApiError ? err.message : 'Не удалось загрузить предпросмотр.');
    }
  };

  const onActivate = async () => {
    setError(null);
    if (!validation.ok) { setError('Заполни обязательные поля.'); return; }
    setActivating(true);
    debouncerRef.current?.flushNow();
    const id = await ensureDraft(data);
    if (!id) { setActivating(false); return; }
    try {
      await updateDraft(id, { data: toPersistedData(data), themeId });
      const { url } = await devActivate(id);
      window.location.href = url;
    } catch (err) {
      setActivating(false);
      if (err instanceof UnauthorizedError) handleAuthError();
      else setError(err instanceof ApiError ? err.message : 'Не удалось создать ссылку.');
    }
  };

  const saveLabel: Record<SaveState, string> = { idle: '', saving: 'Сохранение…', saved: 'Сохранено ✓', error: 'Ошибка сохранения' };

  return (
    <div className={styles.wizard}>
      <span className={`${styles.petal} ${styles.petal1}`} aria-hidden="true" />
      <span className={`${styles.petal} ${styles.petal2}`} aria-hidden="true" />
      <span className={`${styles.petal} ${styles.petal3}`} aria-hidden="true" />
      <span className={`${styles.petal} ${styles.petal4}`} aria-hidden="true" />

      <div className={styles.progressBar}>
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const isActive = n === step;
          const isDone = n < step;
          return (
            <span key={n} style={{ display: 'contents' }}>
              {i > 0 && <span className={`${styles.progressLine} ${isDone || isActive ? styles.progressLineDone : ''}`} />}
              <div className={styles.progressStep}>
                <span className={`${styles.progressDot} ${isActive ? styles.progressDotActive : ''} ${isDone ? styles.progressDotDone : ''}`}>
                  {isDone ? '✓' : n}
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
              <span className={styles.startEmoji}>💌</span>
              <h1 className={styles.startTitle}>{template.name}</h1>
              <p className={styles.startDesc}>{template.description}</p>
              <div className={styles.welcomeActions}>
                <button className={styles.btnPrimary} onClick={() => setStep(2)}>Создать →</button>
                <button className={styles.btnSecondary} onClick={() => router.push('/')}>В галерею</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Шаг 2: Поля шаблона ═══ */}
        {step === 2 && (
          <div className={styles.formStep}>
            <h2 className={styles.stepTitle}>{template.name}</h2>
            <p className={styles.stepDesc}>Заполни поля — это увидит приглашённый</p>

            {template.fields.map((field) => (
              <FieldControl
                key={field.key}
                field={field}
                value={data[field.key]}
                error={validation.fieldErrors[field.key]}
                onChange={(v) => setVal(field.key, v)}
                onUpload={(file) => onUploadImage(field.key, file)}
              />
            ))}

            {saveState !== 'idle' && <p className={styles.saveStatus}>{saveLabel[saveState]}</p>}
            {error && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}

            <div className={styles.stepActions}>
              <button className={styles.btnBack} onClick={() => setStep(1)}>← Назад</button>
              <button className={styles.btnPrimary} onClick={onPreview}>Предпросмотр →</button>
            </div>
          </div>
        )}

        {/* ═══ Шаг 3: Предпросмотр + Получить ссылку ═══ */}
        {step === 3 && (
          <div className={styles.previewStep}>
            <h2 className={styles.stepTitle}>Предпросмотр</h2>
            <p className={styles.stepDesc} style={{ marginBottom: 8 }}>Так увидит приглашение адресат</p>
            {preview ? <PreviewPane preview={preview} /> : <p className={`${styles.notice} ${styles.noticeInfo}`}>Загружаем…</p>}
            {error && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}
            <div className={styles.stepActions}>
              <button className={styles.btnBack} onClick={() => setStep(2)}>← Назад</button>
              <button className={styles.btnPrimary} onClick={onActivate} disabled={!validation.ok || activating}>
                {activating ? 'Создаём ссылку…' : 'Получить ссылку'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Контрол одного поля шаблона — выбирается по типу поля. */
function FieldControl({
  field, value, error, onChange, onUpload,
}: {
  field: TemplateField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  onUpload: (file: File) => void;
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
      <div className={styles.field}>
        {label}
        <ImagePicker value={str} onPick={onChange} onUpload={onUpload} />
        {error ? <span className={styles.error}>{error}</span> : null}
      </div>
    );
  }

  if (kind === 'checkbox') {
    return (
      <div className={styles.checkboxRow}>
        <input type="checkbox" className={styles.checkbox} checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <label className={styles.label}>{field.label}</label>
      </div>
    );
  }

  if (kind === 'places') {
    return (
      <div className={styles.field}>
        {label}
        <PlacesEditor places={readPlaces(value)} onChange={onChange} />
        {error ? <span className={styles.error}>{error}</span> : null}
      </div>
    );
  }

  if (kind === 'textarea') {
    return (
      <div className={styles.field}>
        {label}
        <textarea
          className={error ? `${styles.textarea} ${styles['textarea--error']}` : styles.textarea}
          value={str}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
        {field.maxLength ? <span className={styles.charCount}>{str.length}/{field.maxLength}</span> : null}
        {error ? <span className={styles.error}>{error}</span> : null}
      </div>
    );
  }

  return (
    <div className={styles.field}>
      {label}
      <input
        type={kind === 'datetime' ? 'datetime-local' : 'text'}
        className={error ? `${styles.input} ${styles['input--error']}` : styles.input}
        value={str}
        maxLength={field.maxLength}
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
