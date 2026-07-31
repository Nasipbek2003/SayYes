'use client';

/**
 * Renders a sticker/animation asset by its `src`.
 *
 * The sticker catalog mixes animated `.webp` images and `.webm` video clips.
 * A plain `<img>` cannot play a video, so this helper picks the element by the
 * URL: Cloudinary video links carry `/video/upload/`, local files end in
 * `.webm` (see {@link isVideoUrl}).
 *
 *  - видео → muted, looping, autoplaying `<video>` (ведёт себя как стикер)
 *  - остальное (webp / png / jpg / gif / загруженные фото) → `<img>`
 *
 * Both the editor preview and the published invitation use this component, so a
 * chosen animation looks identical while editing and after publishing.
 */
import { isVideoUrl } from '@/lib/storage/stickerUrl';

export interface StickerMediaProps {
  /** Ссылка на файл: локальная или Cloudinary. */
  src: string;
  className?: string;
  alt?: string;
  /** Постер для видео: показывается, пока клип не загрузился. */
  poster?: string;
}

export function StickerMedia({ src, className, alt = '', poster }: StickerMediaProps) {
  if (isVideoUrl(src)) {
    return (
      <video
        className={className}
        src={src}
        poster={poster}
        muted
        loop
        autoPlay
        playsInline
        // Метаданные вперёд: браузер не тянет весь клип до показа экрана.
        preload="metadata"
        aria-label={alt || undefined}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={src} alt={alt} loading="lazy" decoding="async" />;
}
