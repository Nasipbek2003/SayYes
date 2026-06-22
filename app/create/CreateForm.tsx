'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';

import type { CheckoutTier } from '@/lib/services/payment';
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
  startCheckout,
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

const TIERS: ReadonlyArray<{
  id: CheckoutTier;
  name: string;
  price: string;
  features: string[];
}> = [
  {
    id: 'basic',
    name: 'Базовый',
    price: '990 ₸',
    features: ['Интерактивное приглашение', 'Уникальная ссылка', 'Подпись SayYes'],
  },
  {
    id: 'premium',
    name: 'Премиум',
    price: '1990 ₸',
    features: ['Без подписи бренда', 'Расширенные анимации', 'Фоновая музыка', 'Уведомления в Telegram'],
  },
];

const TOTAL_STEPS = 5;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function CreateForm({ template, themeId, isAuthed = false }: CreateFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(() => buildInitialData({ fields: template.fields }));
  const [invitationId, setInvitationId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [tier, setTier] = useState<CheckoutTier>('basic');
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const invitationIdRef = useRef<string | null>(null);
  invitationIdRef.current = invitationId;

  const hasPlaces = template.fields.some((f) => f.type === 'placesList');
  const mainFields = template.fields.filter((f) => f.type !== 'placesList');
  const placeFields = template.fields.filter((f) => f.type === 'placesList');

  const validation = useMemo(() => validateAuthorForm(template.id, data), [template.id, data]);

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

  const onFieldChange = (key: string, value: unknown) => {
    setData((prev) => {
      const next = setFieldValue(prev, key, value);
      debouncerRef.current?.schedule(next);
      return next;
    });
    setSaveState('saving');
  };

  const onUploadPhoto = async (key: string, file: File) => {
    const id = await ensureDraft(data);
    if (!id) return;
    try {
      const { url } = await uploadPhoto(id, file);
      onFieldChange(key, url);
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
      setStep(4);
    } catch (err) {
      if (err instanceof UnauthorizedError) handleAuthError();
      else setError(err instanceof ApiError ? err.message : 'Не удалось загрузить предпросмотр.');
    }
  };

  const onCheckout = async () => {
    setError(null);
    if (!validation.ok) { setError('Заполни обязательные поля.'); return; }
    setCheckingOut(true);
    debouncerRef.current?.flushNow();
    const id = await ensureDraft(data);
    if (!id) { setCheckingOut(false); return; }
    try {
      await updateDraft(id, { data: toPersistedData(data), themeId });
      const { checkoutUrl } = await startCheckout(id, tier);
      window.location.href = checkoutUrl;
    } catch (err) {
      setCheckingOut(false);
      if (err instanceof UnauthorizedError) handleAuthError();
      else setError(err instanceof ApiError ? err.message : 'Не удалось перейти к оплате.');
    }
  };

  const onDevActivate = async () => {
    setError(null);
    setCheckingOut(true);
    debouncerRef.current?.flushNow();
    const id = await ensureDraft(data);
    if (!id) { setCheckingOut(false); return; }
    try {
      await updateDraft(id, { data: toPersistedData(data), themeId });
      const { url } = await devActivate(id);
      window.location.href = url;
    } catch (err) {
      setCheckingOut(false);
      if (err instanceof UnauthorizedError) handleAuthError();
      else setError(err instanceof ApiError ? err.message : 'Ошибка активации.');
    }
  };

  const saveLabel: Record<SaveState, string> = { idle: '', saving: 'Сохранение…', saved: 'Сохранено ✓', error: 'Ошибка сохранения' };

  return (
    <div className={styles.wizard}>
      {/* Декоративные лепестки */}
      <span className={`${styles.petal} ${styles.petal1}`} aria-hidden="true" />
      <span className={`${styles.petal} ${styles.petal2}`} aria-hidden="true" />
      <span className={`${styles.petal} ${styles.petal3}`} aria-hidden="true" />
      <span className={`${styles.petal} ${styles.petal4}`} aria-hidden="true" />

      {/* Progress bar */}
      <div className={styles.progressBar}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => {
          const n = i + 1;
          const isActive = n === step;
          const isDone = n < step;
          return (
            <span key={n}>
              {i > 0 && <span className={`${styles.progressLine} ${isDone ? styles.progressLineDone : ''}`} />}
              <span className={`${styles.progressDot} ${isActive ? styles.progressDotActive : ''} ${isDone ? styles.progressDotDone : ''}`}>
                {n}
              </span>
            </span>
          );
        })}
      </div>

      <div className={styles.stepContent}>
        {/* ═══ Шаг 1: Приветствие ═══ */}
        {step === 1 && (
          <div className={styles.welcomeLayout}>
            <div className={styles.welcomeImage}>
              <div className={styles.welcomePhone}>
                <div className={styles.welcomeScreen}>
                  <div className={styles.welcomeScreenHeart}>
                    <Heart fill="#E8367A" color="#E8367A" size={92} strokeWidth={0} />
                  </div>
                  <div className={styles.welcomeCard}>
                    <p className={styles.welcomeCardLabel}>Приглашение на свидание</p>
                    <p className={styles.welcomeCardTitle}>Тебе приглашают<br />на свидание!</p>
                    <p className={styles.welcomeCardSub}>Для тебя приготовили кое-что особенное</p>
                    <span className={styles.welcomeCardBtn}>Открыть →</span>
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.welcomeRight}>
              <h1 className={styles.welcomeTitle}>
                Создай приглашение на свидание
                <span className={styles.welcomeAccent}>ЗА 2 МИНУТЫ</span>
              </h1>
              <p className={styles.welcomeSubtitle}>
                и отправь ссылку тому, кого хочешь пригласить
              </p>
              <p className={styles.welcomeQuestion}>
                Готовы сделать романтичный сюрприз? 💝
              </p>
              <div className={styles.welcomeActions}>
                <button className={styles.btnPrimary} onClick={() => setStep(2)}>
                  Да! 💐
                </button>
                <button className={styles.btnSecondary} onClick={() => router.push('/')}>
                  Не сейчас
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Шаг 2: Основные поля ═══ */}
        {step === 2 && (
          <div className={styles.formStep}>
            <h2 className={styles.stepTitle}>Заполни данные</h2>
            <p className={styles.stepDesc}>Имя, фото и текст приглашения</p>

            {mainFields.map((field) => (
              <FieldControl
                key={field.key}
                field={field}
                value={data[field.key]}
                error={validation.fieldErrors[field.key]}
                onChange={(value) => onFieldChange(field.key, value)}
                onUploadPhoto={(file) => onUploadPhoto(field.key, file)}
              />
            ))}

            {saveState !== 'idle' && <p className={styles.saveStatus}>{saveLabel[saveState]}</p>}
            {error && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}

            <div className={styles.stepActions}>
              <button className={styles.btnBack} onClick={() => setStep(1)}>← Назад</button>
              <button className={styles.btnPrimary} onClick={() => setStep(hasPlaces ? 3 : 4)}>
                Далее →
              </button>
            </div>
          </div>
        )}

        {/* ═══ Шаг 3: Места (если есть) ═══ */}
        {step === 3 && hasPlaces && (
          <div className={styles.formStep}>
            <h2 className={styles.stepTitle}>Выбор мест</h2>
            <p className={styles.stepDesc}>Добавь варианты мест для встречи</p>

            {placeFields.map((field) => (
              <div key={field.key} className={styles.field}>
                <label className={styles.label}>{field.label}</label>
                <PlacesEditor
                  places={readPlaces(data[field.key])}
                  onChange={(places) => onFieldChange(field.key, places)}
                />
              </div>
            ))}

            {error && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}

            <div className={styles.stepActions}>
              <button className={styles.btnBack} onClick={() => setStep(2)}>← Назад</button>
              <button className={styles.btnPrimary} onClick={() => onPreview()}>
                Предпросмотр →
              </button>
            </div>
          </div>
        )}

        {/* ═══ Шаг 4: Предпросмотр ═══ */}
        {step === 4 && (
          <div className={styles.previewStep}>
            <h2 className={styles.stepTitle}>Предпросмотр</h2>
            <p className={styles.stepDesc} style={{ marginBottom: 8 }}>Так увидит приглашение адресат</p>

            {preview ? (
              <PreviewPane preview={preview} />
            ) : (
              <p className={`${styles.notice} ${styles.noticeInfo}`}>
                Загружаем предпросмотр…
              </p>
            )}

            <div className={styles.stepActions}>
              <button className={styles.btnBack} onClick={() => setStep(hasPlaces ? 3 : 2)}>← Назад</button>
              <button className={styles.btnPrimary} onClick={() => setStep(5)}>
                К оплате →
              </button>
            </div>
          </div>
        )}

        {/* ═══ Шаг 5: Тариф и оплата ═══ */}
        {step === 5 && (
          <div className={styles.formStep}>
            <h2 className={styles.stepTitle}>Выбери тариф</h2>
            <p className={styles.stepDesc}>Оплата разовая — за одно приглашение</p>

            <div className={styles.tiers}>
              {TIERS.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={`${styles.tier} ${tier === t.id ? styles.tierActive : ''}`}
                  onClick={() => setTier(t.id)}
                >
                  <span className={styles.tierName}>{t.name}</span>
                  <span className={styles.tierPrice}>{t.price}</span>
                  <ul className={styles.tierFeatures}>
                    {t.features.map((f) => <li key={f}>✓ {f}</li>)}
                  </ul>
                </button>
              ))}
            </div>

            {!validation.ok && (
              <p className={`${styles.notice} ${styles.noticeInfo}`}>
                Заполни обязательные поля, чтобы перейти к оплате.
              </p>
            )}
            {error && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}

            <div className={styles.stepActions}>
              <button className={styles.btnBack} onClick={() => setStep(4)}>← Назад</button>
              <button
                className={styles.btnPrimary}
                onClick={onCheckout}
                disabled={!validation.ok || checkingOut}
              >
                {checkingOut ? 'Переход к оплате…' : 'Оплатить и получить ссылку'}
              </button>
            </div>

            {process.env.NODE_ENV !== 'production' && (
              <button
                type="button"
                onClick={onDevActivate}
                disabled={!validation.ok || checkingOut}
                style={{
                  appearance: 'none', font: 'inherit', fontSize: '13px', cursor: 'pointer',
                  padding: '9px 16px', borderRadius: '999px',
                  border: '1px dashed rgba(233,91,139,0.3)', background: 'rgba(233,91,139,0.05)',
                  color: '#E95B8B', alignSelf: 'center',
                  opacity: (!validation.ok || checkingOut) ? 0.4 : 1,
                }}
              >
                🛠 Без оплаты (dev)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldControl({
  field, value, error, onChange, onUploadPhoto,
}: {
  field: TemplateField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  onUploadPhoto: (file: File) => void;
}) {
  const kind = fieldInputKind(field.type);
  const label = (
    <label className={styles.label} htmlFor={`field-${field.key}`}>
      {field.label}
      {!field.required ? <span className={styles.optional}> (опц.)</span> : null}
    </label>
  );

  if (kind === 'checkbox') {
    return (
      <div className={styles.checkboxRow}>
        <input id={`field-${field.key}`} type="checkbox" className={styles.checkbox}
          checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <label className={styles.label} htmlFor={`field-${field.key}`}>{field.label}</label>
      </div>
    );
  }

  if (kind === 'image') {
    const url = typeof value === 'string' ? value : '';
    return (
      <div className={styles.field}>
        {label}
        <div className={styles.imageField}>
          {url ? <img className={styles.imagePreview} src={url} alt="" /> : null}
          <label className={styles.uploadBtn}>
            {url ? 'Заменить фото' : 'Загрузить фото'}
            <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
              onChange={(e) => { const file = e.target.files?.[0]; if (file) onUploadPhoto(file); }} />
          </label>
        </div>
        {error ? <span className={styles.error}>{error}</span> : null}
      </div>
    );
  }

  if (kind === 'textarea') {
    return (
      <div className={styles.field}>
        {label}
        <textarea id={`field-${field.key}`}
          className={error ? `${styles.textarea} ${styles['textarea--error']}` : styles.textarea}
          value={typeof value === 'string' ? value : ''} maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)} />
        {error ? <span className={styles.error}>{error}</span> : null}
      </div>
    );
  }

  return (
    <div className={styles.field}>
      {label}
      <input id={`field-${field.key}`} type={kind === 'datetime' ? 'datetime-local' : 'text'}
        className={error ? `${styles.input} ${styles['input--error']}` : styles.input}
        value={typeof value === 'string' ? value : ''} maxLength={field.maxLength}
        onChange={(e) => onChange(e.target.value)} />
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  );
}

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
          <input className={styles.input} placeholder="Фото (URL, опц.)" value={place.фото ?? ''}
            onChange={(e) => onChange(updatePlace(places, index, { фото: e.target.value }))} />
          <input className={styles.input} placeholder="Описание (опц.)" value={place.описание ?? ''}
            onChange={(e) => onChange(updatePlace(places, index, { описание: e.target.value }))} />
        </div>
      ))}
      <button type="button" className={styles.addBtn} onClick={() => onChange(addPlace(places))}>+ Добавить место</button>
    </div>
  );
}
