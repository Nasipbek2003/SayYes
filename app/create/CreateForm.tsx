'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';

import type { CheckoutTier } from '@/lib/services/payment';
import type { PreviewPayload } from '@/lib/services/invitation';
import type { TemplateField } from '@/templates/types';
import {
  type FormData,
  buildInitialData,
  setFieldValue,
  toPersistedData,
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

/** Готовые картинки: 1-4 для первого экрана, 5-8 для второго (лежат в /public). */
const SCREEN1_IMAGES = ['/1.webp', '/2.webp', '/3.webp', '/4.webp'];
const SCREEN2_IMAGES = ['/5.webp', '/6.webp', '/7.webp', '/8.webp'];

const TIERS: ReadonlyArray<{ id: CheckoutTier; name: string; price: string; features: string[] }> = [
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

const TOTAL_STEPS = 4;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function CreateForm({ template, themeId }: CreateFormProps) {
  const router = useRouter();

  // Ключи реальных полей шаблона (для валидации и рендера).
  const imageKey = useMemo(
    () => template.fields.find((f) => f.type === 'image')?.key ?? 'фото',
    [template.fields],
  );
  const titleKey = useMemo(
    () => template.fields.find((f) => f.type === 'longtext')?.key ?? 'текст_приглашения',
    [template.fields],
  );
  const hasName = template.fields.some((f) => f.key === 'имя_адресата');
  const hasSignature = template.fields.some((f) => f.key === 'подпись');

  const [step, setStep] = useState(1);
  const [editScreen, setEditScreen] = useState<1 | 2>(1);
  const [data, setData] = useState<FormData>(() => {
    const base = buildInitialData({ fields: template.fields });
    return {
      ...base,
      [imageKey]: base[imageKey] || SCREEN1_IMAGES[0],
      screen2_image: base['screen2_image'] || SCREEN2_IMAGES[0],
      btn_yes: base['btn_yes'] || 'Да',
      btn_no: base['btn_no'] || 'Нет',
      screen2_title: base['screen2_title'] || 'Подожди, ты действительно сказала да?',
      screen2_subtitle: base['screen2_subtitle'] || '',
      btn_confirm: base['btn_confirm'] || 'Да, конечно!',
    };
  });

  const [invitationId, setInvitationId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [tier, setTier] = useState<CheckoutTier>('basic');
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const invitationIdRef = useRef<string | null>(null);
  invitationIdRef.current = invitationId;

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

  const str = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : '');
  const saveLabel: Record<SaveState, string> = { idle: '', saving: 'Сохранение…', saved: 'Сохранено ✓', error: 'Ошибка сохранения' };

  // Данные для живого превью текущего редактируемого экрана.
  const previewImage = editScreen === 1 ? str(imageKey) : str('screen2_image');
  const previewTitle = editScreen === 1
    ? (str(titleKey) || 'Ты пойдёшь со мной на свидание?')
    : (str('screen2_title') || 'Подожди, ты действительно сказала да?');

  return (
    <div className={styles.wizard}>
      <span className={`${styles.petal} ${styles.petal1}`} aria-hidden="true" />
      <span className={`${styles.petal} ${styles.petal2}`} aria-hidden="true" />
      <span className={`${styles.petal} ${styles.petal3}`} aria-hidden="true" />
      <span className={`${styles.petal} ${styles.petal4}`} aria-hidden="true" />

      <div className={styles.progressBar}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => {
          const n = i + 1;
          return (
            <span key={n}>
              {i > 0 && <span className={`${styles.progressLine} ${n <= step ? styles.progressLineDone : ''}`} />}
              <span className={`${styles.progressDot} ${n === step ? styles.progressDotActive : ''} ${n < step ? styles.progressDotDone : ''}`}>
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
              <p className={styles.welcomeSubtitle}>и отправь ссылку тому, кого хочешь пригласить</p>
              <p className={styles.welcomeQuestion}>Готовы сделать романтичный сюрприз? 💝</p>
              <div className={styles.welcomeActions}>
                <button className={styles.btnPrimary} onClick={() => setStep(2)}>Да! 💐</button>
                <button className={styles.btnSecondary} onClick={() => router.push('/')}>Не сейчас</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Шаг 2: Двухэкранный редактор ═══ */}
        {step === 2 && (
          <div className={styles.editorLayout}>
            {/* Левая колонка: вкладки + живое превью */}
            <div className={styles.editorPreviewCol}>
              <div className={styles.screenTabs}>
                <button
                  className={`${styles.screenTab} ${editScreen === 1 ? styles.screenTabActive : ''}`}
                  onClick={() => setEditScreen(1)}
                >
                  Экран 1
                </button>
                <button
                  className={`${styles.screenTab} ${editScreen === 2 ? styles.screenTabActive : ''}`}
                  onClick={() => setEditScreen(2)}
                >
                  Экран 2
                </button>
              </div>

              <div className={styles.editorPhone}>
                <div className={styles.editorScreen}>
                  <div className={styles.previewCard}>
                    {previewImage ? (
                      <img className={styles.previewImg} src={previewImage} alt="" />
                    ) : (
                      <div className={styles.previewImgPlaceholder}>
                        <Heart fill="#E8367A" color="#E8367A" size={48} strokeWidth={0} />
                      </div>
                    )}
                    <p className={styles.previewTitle}>{previewTitle}</p>
                    {editScreen === 2 && str('screen2_subtitle') && (
                      <p className={styles.previewSubtitle}>{str('screen2_subtitle')}</p>
                    )}
                    <div className={styles.previewBtns}>
                      {editScreen === 1 ? (
                        <>
                          <span className={styles.previewBtnYes}>{str('btn_yes') || 'Да'}</span>
                          <span className={styles.previewBtnNo}>{str('btn_no') || 'Нет'}</span>
                        </>
                      ) : (
                        <span className={styles.previewBtnYes}>{str('btn_confirm') || 'Да, конечно!'}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Правая колонка: форма */}
            <div className={styles.editorForm}>
              <div className={styles.editorHeader}>
                <h2 className={styles.editorHeaderTitle}>Настрой первые экраны приглашения</h2>
                <p className={styles.editorHeaderDesc}>Тексты и картинки для шагов 1 и 2, которые увидит приглашённый</p>
              </div>

              {editScreen === 1 ? (
                <div className={styles.editorSection}>
                  <p className={styles.editorSectionTitle}>Экран 1 — приглашение</p>

                  {hasName && (
                    <div className={styles.field}>
                      <label className={styles.label}>Имя адресата</label>
                      <input
                        className={validation.fieldErrors['имя_адресата'] ? `${styles.input} ${styles['input--error']}` : styles.input}
                        value={str('имя_адресата')}
                        placeholder="Например, Айя"
                        maxLength={60}
                        onChange={(e) => setVal('имя_адресата', e.target.value)}
                      />
                      {validation.fieldErrors['имя_адресата'] && <span className={styles.error}>{validation.fieldErrors['имя_адресата']}</span>}
                    </div>
                  )}

                  <ImagePicker
                    label="Картинка на экране"
                    images={SCREEN1_IMAGES}
                    value={str(imageKey)}
                    onPick={(url) => setVal(imageKey, url)}
                    onUpload={(file) => onUploadImage(imageKey, file)}
                  />

                  <div className={styles.field}>
                    <label className={styles.label}>Заголовок</label>
                    <textarea
                      className={validation.fieldErrors[titleKey] ? `${styles.textarea} ${styles['textarea--error']}` : styles.textarea}
                      value={str(titleKey)}
                      placeholder="Ты пойдёшь со мной на свидание?"
                      maxLength={300}
                      onChange={(e) => setVal(titleKey, e.target.value)}
                    />
                    <span className={styles.charCount}>{str(titleKey).length}/300</span>
                    {validation.fieldErrors[titleKey] && <span className={styles.error}>{validation.fieldErrors[titleKey]}</span>}
                  </div>

                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label className={styles.label}>Кнопка «Да»</label>
                      <input className={styles.input} value={str('btn_yes')} placeholder="Да" maxLength={30} onChange={(e) => setVal('btn_yes', e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Кнопка «Нет»</label>
                      <input className={styles.input} value={str('btn_no')} placeholder="Нет" maxLength={30} onChange={(e) => setVal('btn_no', e.target.value)} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.editorSection}>
                  <p className={styles.editorSectionTitle}>Экран 2 — подтверждение</p>

                  <ImagePicker
                    label="Картинка на экране"
                    images={SCREEN2_IMAGES}
                    value={str('screen2_image')}
                    onPick={(url) => setVal('screen2_image', url)}
                    onUpload={(file) => onUploadImage('screen2_image', file)}
                  />

                  <div className={styles.field}>
                    <label className={styles.label}>Заголовок</label>
                    <textarea
                      className={styles.textarea}
                      value={str('screen2_title')}
                      placeholder="Подожди, ты действительно сказала да?"
                      maxLength={300}
                      onChange={(e) => setVal('screen2_title', e.target.value)}
                    />
                    <span className={styles.charCount}>{str('screen2_title').length}/300</span>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Подзаголовок</label>
                    <textarea
                      className={styles.textarea}
                      value={str('screen2_subtitle')}
                      placeholder='Я был готов, что скажешь "нет" ахах'
                      maxLength={300}
                      onChange={(e) => setVal('screen2_subtitle', e.target.value)}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Кнопка подтверждения</label>
                    <input className={styles.input} value={str('btn_confirm')} placeholder="Да, конечно!" maxLength={30} onChange={(e) => setVal('btn_confirm', e.target.value)} />
                  </div>

                  {hasSignature && (
                    <div className={styles.field}>
                      <label className={styles.label}>Ваше имя (подпись)</label>
                      <input
                        className={validation.fieldErrors['подпись'] ? `${styles.input} ${styles['input--error']}` : styles.input}
                        value={str('подпись')}
                        placeholder="От кого приглашение"
                        maxLength={60}
                        onChange={(e) => setVal('подпись', e.target.value)}
                      />
                      {validation.fieldErrors['подпись'] && <span className={styles.error}>{validation.fieldErrors['подпись']}</span>}
                    </div>
                  )}
                </div>
              )}

              {saveState !== 'idle' && <p className={styles.saveStatus}>{saveLabel[saveState]}</p>}
              {error && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}

              <div className={styles.stepActions}>
                {editScreen === 1 ? (
                  <button className={styles.btnBack} onClick={() => setStep(1)}>← Назад</button>
                ) : (
                  <button className={styles.btnBack} onClick={() => setEditScreen(1)}>← Экран 1</button>
                )}
                {editScreen === 1 ? (
                  <button className={styles.btnPrimary} onClick={() => setEditScreen(2)}>Далее →</button>
                ) : (
                  <button className={styles.btnPrimary} onClick={onPreview}>Предпросмотр →</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ Шаг 3: Предпросмотр ═══ */}
        {step === 3 && (
          <div className={styles.previewStep}>
            <h2 className={styles.stepTitle}>Предпросмотр</h2>
            <p className={styles.stepDesc} style={{ marginBottom: 8 }}>Так увидит приглашение адресат</p>
            {preview ? <PreviewPane preview={preview} /> : <p className={`${styles.notice} ${styles.noticeInfo}`}>Загружаем предпросмотр…</p>}
            <div className={styles.stepActions}>
              <button className={styles.btnBack} onClick={() => setStep(2)}>← Назад</button>
              <button className={styles.btnPrimary} onClick={() => setStep(4)}>К оплате →</button>
            </div>
          </div>
        )}

        {/* ═══ Шаг 4: Тариф ═══ */}
        {step === 4 && (
          <div className={styles.formStep}>
            <h2 className={styles.stepTitle}>Выбери тариф</h2>
            <p className={styles.stepDesc}>Оплата разовая — за одно приглашение</p>
            <div className={styles.tiers}>
              {TIERS.map((t) => (
                <button type="button" key={t.id} className={`${styles.tier} ${tier === t.id ? styles.tierActive : ''}`} onClick={() => setTier(t.id)}>
                  <span className={styles.tierName}>{t.name}</span>
                  <span className={styles.tierPrice}>{t.price}</span>
                  <ul className={styles.tierFeatures}>{t.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
                </button>
              ))}
            </div>
            {!validation.ok && <p className={`${styles.notice} ${styles.noticeInfo}`}>Заполни обязательные поля, чтобы перейти к оплате.</p>}
            {error && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}
            <div className={styles.stepActions}>
              <button className={styles.btnBack} onClick={() => setStep(3)}>← Назад</button>
              <button className={styles.btnPrimary} onClick={onCheckout} disabled={!validation.ok || checkingOut}>
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

/** Сетка готовых картинок + кнопка «Загрузить свою». */
function ImagePicker({
  label, images, value, onPick, onUpload,
}: {
  label: string;
  images: string[];
  value: string;
  onPick: (url: string) => void;
  onUpload: (file: File) => void;
}) {
  return (
    <div className={styles.imageBlock}>
      <span className={styles.imageBlockLabel}>{label}</span>
      <div className={styles.imageGrid}>
        {images.map((src) => (
          <button
            type="button"
            key={src}
            className={`${styles.imageThumb} ${value === src ? styles.imageThumbActive : ''}`}
            onClick={() => onPick(src)}
            aria-label={`Выбрать картинку ${src}`}
          >
            <img className={styles.imageThumbImg} src={src} alt="" />
          </button>
        ))}
      </div>
      <label className={styles.uploadOwn}>
        Загрузить свою
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={(e) => { const file = e.target.files?.[0]; if (file) onUpload(file); }}
        />
      </label>
      <span className={styles.fileHint}>до 7 МБ, JPEG, PNG, GIF, WebP, HEIC</span>
    </div>
  );
}
