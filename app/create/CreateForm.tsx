'use client';

/**
 * Author creation form + preview + tier/checkout (task 10.2).
 *
 * Renders an input for every {@link TemplateField} of the chosen template
 * (Requirement 2.1), a places editor (Requirement 2.4), a live preview
 * (Requirement 2.5) and tier selection → checkout (Requirement 3.1). The draft
 * is created on first edit and auto-saved as the author types (Requirement 2.6,
 * via {@link Debouncer} + `PATCH /api/invitations/:id`).
 *
 * Authorisation decision: creating an invitation is an author operation
 * (Requirement 10.4). This component is only reached after the server page has
 * confirmed a session; if the session expires mid-edit any author API call that
 * returns 401 ({@link UnauthorizedError}) redirects the author to `/login`.
 *
 * All non-trivial logic (field→input mapping, validation, places editing,
 * debounce timing, persistence shaping) lives in pure helpers under
 * `lib/create/*` and `app/create/client.ts`, keeping this component a thin
 * rendering + effect layer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { CheckoutTier } from '@/lib/services/payment';
import type { PreviewPayload } from '@/lib/services/invitation';
import type { TemplateField, TemplateSchema } from '@/templates/types';
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

/** Serialisable template metadata the server page passes to the form. */
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
  /** True when the server confirmed an active session. */
  isAuthed?: boolean;
}

/** Tier display metadata (pricing mirrors `TIER_AMOUNTS` in the payment service). */
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
    features: [
      'Без подписи бренда',
      'Расширенные анимации',
      'Фоновая музыка',
      'Уведомления в Telegram',
    ],
  },
];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function CreateForm({ template, themeId, isAuthed = false }: CreateFormProps) {
  const router = useRouter();

  const [data, setData] = useState<FormData>(() =>
    buildInitialData({ fields: template.fields }),
  );
  const [invitationId, setInvitationId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [tier, setTier] = useState<CheckoutTier>('basic');
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // Latest invitation id available to async callbacks without re-binding them.
  const invitationIdRef = useRef<string | null>(null);
  invitationIdRef.current = invitationId;

  const validation = useMemo(
    () => validateAuthorForm(template.id, data),
    [template.id, data],
  );

  /** Redirect to login when a session expired mid-edit (Requirement 10.4). */
  const handleAuthError = useCallback(() => {
    router.push('/login');
  }, [router]);

  /** Ensure a draft exists; create it on first use. Returns the id or null. */
  const ensureDraft = useCallback(
    async (currentData: FormData): Promise<string | null> => {
      if (invitationIdRef.current) return invitationIdRef.current;
      try {
        const draft = await createDraft({
          templateId: template.id,
          themeId,
          data: toPersistedData(currentData),
        });
        invitationIdRef.current = draft.id;
        setInvitationId(draft.id);
        return draft.id;
      } catch (err) {
        if (err instanceof UnauthorizedError) handleAuthError();
        else setError(err instanceof ApiError ? err.message : 'Не удалось создать черновик.');
        return null;
      }
    },
    [template.id, themeId, handleAuthError],
  );

  /** Persist the current data (creating the draft if needed). */
  const persist = useCallback(
    async (currentData: FormData) => {
      setSaveState('saving');
      const id = await ensureDraft(currentData);
      if (!id) {
        setSaveState('error');
        return;
      }
      // The very first persistence happened during create; skip a redundant patch.
      try {
        await updateDraft(id, { data: toPersistedData(currentData), themeId });
        setSaveState('saved');
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          handleAuthError();
          return;
        }
        setSaveState('error');
      }
    },
    [ensureDraft, themeId, handleAuthError],
  );

  // Debounced auto-save (Requirement 2.6). Stable across renders.
  const debouncerRef = useRef<Debouncer<FormData> | null>(null);
  if (debouncerRef.current === null) {
    debouncerRef.current = new Debouncer<FormData>(
      (value) => void persist(value),
      AUTOSAVE_DEBOUNCE_MS,
    );
  }
  // Keep the flush callback pointing at the latest `persist` closure.
  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    const debouncer = debouncerRef.current;
    return () => debouncer?.cancel();
  }, []);

  /** Update one field and schedule an auto-save. */
  const onFieldChange = (key: string, value: unknown) => {
    setData((prev) => {
      const next = setFieldValue(prev, key, value);
      debouncerRef.current?.schedule(next);
      return next;
    });
    setSaveState('saving');
  };

  /* --- Places editor handlers (Requirement 2.4) --- */
  const onPlacesChange = (key: string, places: PlaceDraft[]) => {
    onFieldChange(key, places);
  };

  /* --- Photo upload (Requirement 2.2) --- */
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

  /* --- Preview (Requirement 2.5) --- */
  const onPreview = async () => {
    setError(null);
    // Flush pending edits so the preview reflects the latest data.
    debouncerRef.current?.flushNow();
    const id = await ensureDraft(data);
    if (!id) return;
    try {
      // Ensure the very latest data is saved before fetching the preview.
      await updateDraft(id, { data: toPersistedData(data), themeId });
      const payload = await fetchPreview(id);
      setPreview(payload);
      setShowPreview(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) handleAuthError();
      else setError(err instanceof ApiError ? err.message : 'Не удалось загрузить предпросмотр.');
    }
  };

  /* --- Dev bypass: activate without payment --- */
  const onDevActivate = async () => {
    if (!isAuthed) { setShowLoginPrompt(true); return; }
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

  /* --- Checkout (Requirement 3.1) --- */
  const onCheckout = async () => {
    if (!isAuthed) { setShowLoginPrompt(true); return; }
    setError(null);
    if (!validation.ok) {
      setError('Заполни обязательные поля перед оплатой.');
      return;
    }
    setCheckingOut(true);
    debouncerRef.current?.flushNow();
    const id = await ensureDraft(data);
    if (!id) {
      setCheckingOut(false);
      return;
    }
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

  const saveLabel: Record<SaveState, string> = {
    idle: '',
    saving: 'Сохранение…',
    saved: 'Черновик сохранён',
    error: 'Ошибка сохранения',
  };

  return (
    <div className={styles.page}>
      {/* Модальный оверлей «Войди чтобы продолжить» */}
      {showLoginPrompt && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(61, 44, 42, 0.35)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem',
          }}
          onClick={() => setShowLoginPrompt(false)}
        >
          <div
            style={{
              background: 'var(--card)', border: '1.5px solid var(--border)',
              borderRadius: 'var(--radius-card)', padding: '36px 32px',
              maxWidth: 380, width: '100%', textAlign: 'center',
              display: 'flex', flexDirection: 'column', gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '2.5rem' }}>💌</div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 400, color: 'var(--text)' }}>
              Войди, чтобы продолжить
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Для оформления приглашения нужен аккаунт. Это займёт 30 секунд — просто введи email.
            </p>
            <a
              href={`/login?redirect=${encodeURIComponent(
                `/create?template=${template.id}&theme=${themeId}`
              )}`}
              style={{
                display: 'block', background: 'var(--accent)', color: 'var(--text-on-cta)',
                fontWeight: 500, fontSize: '0.875rem', padding: '12px 24px',
                borderRadius: 'var(--radius-btn)', textDecoration: 'none',
              }}
            >
              Войти или зарегистрироваться
            </a>
            <button
              type="button"
              onClick={() => setShowLoginPrompt(false)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: '0.8rem', color: 'var(--text-muted)',
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
      <div className={styles.topbar}>
        <Link href="/" className={styles.back}>
          ← К галерее
        </Link>
        <span className={styles.saveStatus}>{saveLabel[saveState]}</span>
      </div>

      <h1 className={styles.heading}>{template.name}</h1>
      <p className={styles.subheading}>{template.description}</p>

      <div className={styles.layout}>
        <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
          {template.fields.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              value={data[field.key]}
              error={validation.fieldErrors[field.key]}
              onChange={(value) => onFieldChange(field.key, value)}
              onPlacesChange={(places) => onPlacesChange(field.key, places)}
              onUploadPhoto={(file) => onUploadPhoto(field.key, file)}
            />
          ))}

          <section>
            <h2 className={styles.label}>Тариф</h2>
            <div className={styles.tiers}>
              {TIERS.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={
                    tier === t.id ? `${styles.tier} ${styles['tier--active']}` : styles.tier
                  }
                  aria-pressed={tier === t.id}
                  onClick={() => setTier(t.id)}
                >
                  <span className={styles.tierName}>{t.name}</span>
                  <span className={styles.tierPrice}>{t.price}</span>
                  <ul className={styles.tierFeatures}>
                    {t.features.map((f) => (
                      <li key={f}>· {f}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </section>

          {error ? (
            <p className={`${styles.notice} ${styles['notice--error']}`} role="alert">
              {error}
            </p>
          ) : null}

          {!validation.ok ? (
            <p className={`${styles.notice} ${styles['notice--info']}`}>
              Заполни обязательные поля, чтобы перейти к оплате.
            </p>
          ) : null}

          <div className={styles.actions}>
            <button type="button" className={styles.uploadBtn} onClick={onPreview}>
              Предпросмотр
            </button>
            <button
              type="button"
              className={styles.checkoutBtn}
              onClick={onCheckout}
              disabled={!validation.ok || checkingOut}
            >
              {checkingOut ? 'Переход к оплате…' : 'Оплатить и получить ссылку'}
            </button>
            {process.env.NODE_ENV !== 'production' && (
              <button
                type="button"
                onClick={onDevActivate}
                disabled={!validation.ok || checkingOut}
                style={{
                  appearance: 'none',
                  font: 'inherit',
                  fontSize: '13px',
                  cursor: 'pointer',
                  padding: '9px 16px',
                  borderRadius: '999px',
                  border: '1px dashed rgba(255,200,0,0.4)',
                  background: 'rgba(255,200,0,0.07)',
                  color: '#ffd600',
                  opacity: (!validation.ok || checkingOut) ? 0.4 : 1,
                }}
              >
                🛠 Разработчик — без оплаты
              </button>
            )}
          </div>
        </form>

        <div className={styles.previewCol}>
          {showPreview && preview ? (
            <PreviewPane preview={preview} />
          ) : (
            <p className={`${styles.notice} ${styles['notice--info']}`}>
              Нажми «Предпросмотр», чтобы увидеть, как будет выглядеть приглашение.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** A single field control, dispatched by the field's input kind. */
function FieldControl({
  field,
  value,
  error,
  onChange,
  onPlacesChange,
  onUploadPhoto,
}: {
  field: TemplateField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  onPlacesChange: (places: PlaceDraft[]) => void;
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
        <input
          id={`field-${field.key}`}
          type="checkbox"
          className={styles.checkbox}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label className={styles.label} htmlFor={`field-${field.key}`}>
          {field.label}
        </label>
      </div>
    );
  }

  if (kind === 'places') {
    return (
      <div className={styles.field}>
        {label}
        <PlacesEditor places={readPlaces(value)} onChange={onPlacesChange} />
        {error ? <span className={styles.error}>{error}</span> : null}
      </div>
    );
  }

  if (kind === 'image') {
    const url = typeof value === 'string' ? value : '';
    return (
      <div className={styles.field}>
        {label}
        <div className={styles.imageField}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.imagePreview} src={url} alt="" />
          ) : null}
          <label className={styles.uploadBtn}>
            {url ? 'Заменить фото' : 'Загрузить фото'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadPhoto(file);
              }}
            />
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
        <textarea
          id={`field-${field.key}`}
          className={error ? `${styles.textarea} ${styles['textarea--error']}` : styles.textarea}
          value={typeof value === 'string' ? value : ''}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
        {error ? <span className={styles.error}>{error}</span> : null}
      </div>
    );
  }

  // text / datetime
  return (
    <div className={styles.field}>
      {label}
      <input
        id={`field-${field.key}`}
        type={kind === 'datetime' ? 'datetime-local' : 'text'}
        className={error ? `${styles.input} ${styles['input--error']}` : styles.input}
        value={typeof value === 'string' ? value : ''}
        maxLength={field.maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  );
}

/** Editable list of places: add / edit / remove (Requirement 2.4). */
function PlacesEditor({
  places,
  onChange,
}: {
  places: PlaceDraft[];
  onChange: (places: PlaceDraft[]) => void;
}) {
  return (
    <div className={styles.places}>
      {places.map((place, index) => (
        <div className={styles.place} key={index}>
          <div className={styles.placeHead}>
            <span className={styles.placeTitle}>Место {index + 1}</span>
            <button
              type="button"
              className={styles.removeBtn}
              onClick={() => onChange(removePlace(places, index))}
            >
              Удалить
            </button>
          </div>
          <input
            className={styles.input}
            placeholder="Название"
            value={place.название}
            onChange={(e) => onChange(updatePlace(places, index, { название: e.target.value }))}
          />
          <input
            className={styles.input}
            placeholder="Фото (URL, опц.)"
            value={place.фото ?? ''}
            onChange={(e) => onChange(updatePlace(places, index, { фото: e.target.value }))}
          />
          <input
            className={styles.input}
            placeholder="Описание (опц.)"
            value={place.описание ?? ''}
            onChange={(e) => onChange(updatePlace(places, index, { описание: e.target.value }))}
          />
        </div>
      ))}
      <button type="button" className={styles.addBtn} onClick={() => onChange(addPlace(places))}>
        + Добавить место
      </button>
    </div>
  );
}
