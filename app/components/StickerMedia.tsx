'use client';

/**
 * Renders a sticker/animation asset by its `src`.
 *
 * The sticker catalog mixes animated `.webp` images and `.webm` video clips
 * (see `public/Bear` and `public/Cat`). A plain `<img>` cannot play `.webm`,
 * so this helper picks the right element by file extension:
 *  - `.webm` → muted, looping, autoplaying `<video>` (behaves like a sticker)
 *  - everything else (webp / png / jpg / gif / uploaded photos) → `<img>`
 *
 * Used both in the create-flow picker and in the live invitation runtime so a
 * chosen animation looks identical while editing and after publishing.
 */
export interface StickerMediaProps {
  src: string;
  className?: string;
  alt?: string;
}

/** Whether a sticker `src` points at a video clip rather than an image. */
export function isVideoSticker(src: string): boolean {
  return /\.webm(\?|#|$)/i.test(src);
}

export function StickerMedia({ src, className, alt = '' }: StickerMediaProps) {
  if (isVideoSticker(src)) {
    return (
      <video
        className={className}
        src={src}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={src} alt={alt} />;
}
