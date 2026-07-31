/**
 * Сборка ссылок Cloudinary для стикеров и анимаций.
 *
 * Ключевая мысль: ускорение даёт не сам факт хранения в Cloudinary (папка
 * `public` на Vercel тоже раздаётся через CDN), а **преобразования на лету**.
 * Поэтому каждая ссылка несёт:
 *
 *  - `f_auto` — формат под браузер (AVIF/WebP вместо исходника);
 *  - `q_auto` — подбор сжатия без видимой потери качества;
 *  - `w_<N>,dpr_auto` — ровно та ширина, что нужна в этом месте макета,
 *    с поправкой на плотность экрана.
 *
 * Без этого стикер-мишка отдавался бы исходными 1.6 МБ на каждый показ.
 *
 * Модуль чистый (без БД и `node:crypto`), поэтому его можно импортировать и в
 * клиентские компоненты.
 */

/** Тип файла: определяет путь доставки (`image/upload` или `video/upload`). */
export type StickerKindValue = 'IMAGE' | 'VIDEO';

export interface StickerUrlOptions {
  /** Требуемая ширина в CSS-пикселях. Без неё отдаётся исходный размер. */
  width?: number;
  /**
   * Для видео: отдать статичный кадр вместо клипа (превью в каталоге).
   * Экономит трафик и обходит лимиты видео-преобразований.
   */
  poster?: boolean;
}

/** Базовый адрес доставки Cloudinary для облака. */
function deliveryBase(cloudName: string, resource: 'image' | 'video'): string {
  return `https://res.cloudinary.com/${cloudName}/${resource}/upload`;
}

/**
 * Ссылка на стикер с преобразованиями.
 *
 * @param cloudName имя облака Cloudinary
 * @param publicId  идентификатор файла (без версии и расширения)
 * @param kind      картинка или видео
 */
export function buildStickerUrl(
  cloudName: string,
  publicId: string,
  kind: StickerKindValue,
  options: StickerUrlOptions = {},
): string {
  if (!cloudName || !publicId) return '';

  const isVideo = kind === 'VIDEO';
  const asPoster = isVideo && options.poster === true;

  // Кадр из видео берётся тем же ресурсом `video`, только с расширением .jpg:
  // путь `image/upload/<id>.jpg` для видео отдаёт 404.
  const resource: 'image' | 'video' = isVideo ? 'video' : 'image';

  const parts: string[] = [];

  if (isVideo && !asPoster) {
    parts.push('f_auto', 'q_auto');
  } else if (asPoster) {
    // so_0 — первый кадр; иначе Cloudinary берёт середину клипа.
    parts.push('f_auto', 'q_auto', 'so_0');
  } else {
    // `f_auto:animated` сохраняет анимацию и выбирает animated WebP/AVIF.
    // Просто `f_auto` конвертирует анимированный WebP в GIF, а он весит больше
    // исходника (проверено: 140 КБ → 381 КБ).
    parts.push('f_auto:animated', 'q_auto');
  }

  if (options.width) {
    // c_limit — только уменьшение: маленький стикер не растягивается вверх,
    // иначе вес растёт без выигрыша в качестве.
    parts.push(`w_${Math.round(options.width)}`, 'c_limit');
  }

  const transform = parts.join(',');
  const suffix = asPoster ? `${publicId}.jpg` : publicId;
  return `${deliveryBase(cloudName, resource)}/${transform}/${suffix}`;
}

/**
 * Ширины, которыми пользуется UI. Держим в одном месте, чтобы кеш Cloudinary
 * попадал в уже сгенерированные варианты, а не плодил новые на каждый пиксель.
 */
export const STICKER_WIDTHS = {
  /** Плитка выбора стикера в форме создания. */
  thumb: 160,
  /** Стикер на экране приглашения. */
  screen: 480,
} as const;

/* ============================================================
   Типы каталога для клиентских компонентов
   ============================================================ */

export interface StickerCatalogItem {
  id: string;
  /** Ссылка для показа на экране приглашения (её же сохраняем в данных). */
  url: string;
  /** Уменьшенная ссылка для плитки выбора. */
  thumbUrl: string;
  kind: StickerKindValue;
}

export interface StickerCatalogCategory {
  id: string;
  label: string;
  items: StickerCatalogItem[];
}

/**
 * Видео ли по ссылке.
 *
 * У ссылок Cloudinary расширения нет — тип виден по сегменту `/video/upload/`.
 * Локальные файлы из `public` определяются по `.webm`, поэтому проверяем оба
 * признака: в данных уже созданных приглашений встречаются и те, и другие.
 */
export function isVideoUrl(src: string): boolean {
  return /\.webm(\?|#|$)/i.test(src) || src.includes('/video/upload/');
}
