'use client';

/**
 * Содержимое экрана телефона в hero: видео + «живой» пример приглашения.
 *  - вертикальный ролик 9:16 заполняет экран;
 *  - сверху статус-бар и dynamic island для реалистичности;
 *  - через ~2.5с над видео всплывает карточка-пример приглашения на свидание;
 *  - muted/loop/playsInline, пауза вне экрана, уважение prefers-reduced-motion.
 */
import { useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import styles from '../page.module.css';

export interface PhoneVideoProps {
  /**
   * Ссылка на ролик. Приходит с сервера: если в настройках задан
   * `media.hero_video_public_id`, это оптимизированная ссылка Cloudinary,
   * иначе — локальный файл `/bg-hero.webm` (2.1 МБ).
   */
  src?: string;
  /** Первый кадр: показывается, пока грузится видео. */
  poster?: string;
}

export function PhoneVideo({ src = '/bg-hero.webm', poster }: PhoneVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    const video = videoRef.current;

    // Пример приглашения всплывает после загрузки
    const inviteTimer = setTimeout(() => setShowInvite(true), 2500);

    if (!video) return () => clearTimeout(inviteTimer);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      video.removeAttribute('autoplay');
      video.pause();
      return () => clearTimeout(inviteTimer);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(video);
    video.play().catch(() => {});

    return () => {
      clearTimeout(inviteTimer);
      observer.disconnect();
    };
  }, []);

  return (
    <>
      <video
        ref={videoRef}
        className={styles.phoneVideo}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
      />

      {/* Статус-бар */}
      <div className={styles.phoneStatusbar} aria-hidden="true">
        <span className={styles.phoneTime}>9:41</span>
        <span className={styles.phoneStatusIcons}>
          <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor">
            <rect x="0" y="7" width="3" height="4" rx="1" />
            <rect x="4" y="5" width="3" height="6" rx="1" />
            <rect x="8" y="2.5" width="3" height="8.5" rx="1" />
            <rect x="12" y="0" width="3" height="11" rx="1" />
          </svg>
          <svg width="22" height="11" viewBox="0 0 24 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="1.5" width="18" height="9" rx="2.5" opacity="0.5" />
            <rect x="2.5" y="3" width="13" height="6" rx="1" fill="currentColor" stroke="none" />
            <rect x="20.5" y="4" width="1.8" height="4" rx="0.9" fill="currentColor" stroke="none" />
          </svg>
        </span>
      </div>

      {/* Dynamic island */}
      <div className={styles.phoneIsland} aria-hidden="true" />

      {/* Пример приглашения */}
      <div className={`${styles.phoneInvite} ${showInvite ? styles.phoneInviteShow : ''}`}>
        <span className={styles.phoneInviteIcon}>
          <Heart size={22} fill="#E8625A" color="#E8625A" strokeWidth={0} />
        </span>
        <p className={styles.phoneInviteEyebrow}>Тебе пришло приглашение</p>
        <h3 className={styles.phoneInviteTitle}>Сходим на свидание?</h3>
        <p className={styles.phoneInviteMeta}>Суббота, 19:00 · уютное кафе</p>
        <div className={styles.phoneInviteActions}>
          <span className={styles.phoneInviteYes}>Да&nbsp;💛</span>
          <span className={styles.phoneInviteNo}>Нет</span>
        </div>
      </div>
    </>
  );
}
