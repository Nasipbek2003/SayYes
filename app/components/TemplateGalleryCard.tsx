'use client';

/**
 * Анимированная карточка шаблона в галерее.
 *
 * У каждого шаблона своя тема: профессиональная векторная иконка (lucide),
 * фирменный градиент превью под цвет рантайма шаблона и собственная анимация
 * иконки, которая проигрывается при наведении (десктоп) или нажатии (мобильный),
 * плюс мягкое появление карточки при прокрутке.
 */
import Link from 'next/link';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { motion, type Variants } from 'framer-motion';
import {
  Heart,
  Mail,
  Fingerprint,
  Clapperboard,
  Star,
  ChefHat,
  Search,
  Hourglass,
  Mic,
  Flame,
  Moon,
  MessageCircle,
  Plane,
  Radio,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

import type { GalleryTemplateView } from '@/lib/gallery/gallery';
import styles from '../page.module.css';

/** Тематическое оформление одной карточки. */
interface CardTheme {
  /** Профессиональная векторная иконка шаблона. */
  Icon: LucideIcon;
  /** Цвет иконки / акцент карточки. */
  color: string;
  /** Цвет свечения за иконкой (rgba). */
  glow: string;
  /** Градиент зоны превью (под цвет рантайма шаблона). */
  bg: string;
  /** Анимация иконки: состояния rest / active. */
  variants: Variants;
}

/* ── Готовые анимации иконок ───────────────────────────────────────────────── */

const heartbeat: Variants = {
  rest: { scale: 1 },
  active: { scale: [1, 1.3, 1, 1.3, 1], transition: { duration: 1, repeat: Infinity, repeatDelay: 0.2 } },
};

const envelope: Variants = {
  rest: { rotate: 0, y: 0 },
  active: { rotate: [0, -8, 8, 0], y: [0, -4, 0], transition: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } },
};

const scan: Variants = {
  rest: { scale: 1, opacity: 1 },
  active: { scale: [1, 1.12, 1], opacity: [1, 0.55, 1], transition: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } },
};

const clap: Variants = {
  rest: { rotate: 0 },
  active: { rotate: [0, -14, 0, -10, 0], transition: { duration: 0.7, repeat: Infinity, repeatDelay: 0.3 } },
};

const twinkle: Variants = {
  rest: { rotate: 0, scale: 1 },
  active: { rotate: [0, 18, -18, 0], scale: [1, 1.22, 1], transition: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } },
};

const wobble: Variants = {
  rest: { rotate: 0, y: 0 },
  active: { rotate: [0, -7, 7, -4, 0], y: [0, -3, 0], transition: { duration: 1, repeat: Infinity, ease: 'easeInOut' } },
};

const magnify: Variants = {
  rest: { scale: 1, x: 0, y: 0 },
  active: { scale: 1.15, x: [0, 5, -5, 0], y: [0, -4, 4, 0], transition: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } },
};

const spin: Variants = {
  rest: { rotate: 0 },
  active: { rotate: 360, transition: { duration: 2, repeat: Infinity, ease: 'linear' } },
};

const tapMic: Variants = {
  rest: { rotate: 0 },
  active: { rotate: [0, -12, 12, -8, 0], transition: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } },
};

const flicker: Variants = {
  rest: { scale: 1, rotate: 0 },
  active: { scale: [1, 1.18, 0.95, 1.12, 1], rotate: [-4, 4, -3, 3, 0], transition: { duration: 0.8, repeat: Infinity, ease: 'easeInOut' } },
};

const orbit: Variants = {
  rest: { rotate: 0, scale: 1 },
  active: { rotate: [0, 12, -12, 0], scale: [1, 1.12, 1], transition: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } },
};

const buzz: Variants = {
  rest: { x: 0, rotate: 0 },
  active: { x: [0, -3, 3, -3, 3, 0], rotate: [0, -6, 6, 0], transition: { duration: 0.55, repeat: Infinity } },
};

const fly: Variants = {
  rest: { x: 0, y: 0, rotate: 0 },
  active: { x: [0, 9, -3, 0], y: [0, -7, 0], rotate: [0, -10, 0], transition: { duration: 1.3, repeat: Infinity, ease: 'easeInOut' } },
};

const pulse: Variants = {
  rest: { scale: 1, opacity: 1 },
  active: { scale: [1, 1.14, 1], opacity: [1, 0.65, 1], transition: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } },
};

/* ── Карта тем по шаблонам ─────────────────────────────────────────────────── */

const THEMES: Record<string, CardTheme> = {
  'date-ask': { Icon: Heart, color: '#E8625A', glow: 'rgba(232,98,90,0.4)', bg: 'linear-gradient(150deg, #FFE3D6 0%, #FFC9D6 100%)', variants: heartbeat },
  'secret-letter': { Icon: Mail, color: '#E8625A', glow: 'rgba(232,98,90,0.35)', bg: 'linear-gradient(150deg, #FFF3EC 0%, #FFE0D0 100%)', variants: envelope },
  'mission-date': { Icon: Fingerprint, color: '#00E676', glow: 'rgba(0,230,118,0.45)', bg: 'linear-gradient(150deg, #1A1A2E 0%, #16213E 100%)', variants: scan },
  'movie-poster': { Icon: Clapperboard, color: '#E5C04A', glow: 'rgba(212,175,55,0.45)', bg: 'linear-gradient(150deg, #2B2118 0%, #1A1410 100%)', variants: clap },
  'wish-star': { Icon: Star, color: '#A99FFF', glow: 'rgba(140,120,255,0.5)', bg: 'linear-gradient(150deg, #1A1A40 0%, #0D0D26 100%)', variants: twinkle },
  'recipe-date': { Icon: ChefHat, color: '#B07D3C', glow: 'rgba(176,125,60,0.35)', bg: 'linear-gradient(150deg, #FBF6EC 0%, #F3E8D4 100%)', variants: wobble },
  quest: { Icon: Search, color: '#B8860B', glow: 'rgba(184,134,11,0.38)', bg: 'linear-gradient(150deg, #F3E9D2 0%, #E8D5AE 100%)', variants: magnify },
  'time-machine': { Icon: Hourglass, color: '#A0784A', glow: 'rgba(160,120,74,0.4)', bg: 'linear-gradient(150deg, #F0E6D8 0%, #E0D0BA 100%)', variants: spin },
  interrogation: { Icon: Mic, color: '#FFD93B', glow: 'rgba(255,217,59,0.45)', bg: 'linear-gradient(150deg, #1C1C24 0%, #14141A 100%)', variants: tapMic },
  'tinder-story': { Icon: Flame, color: '#E8367A', glow: 'rgba(232,54,122,0.45)', bg: 'linear-gradient(150deg, #FFE3EC 0%, #FFD0E0 100%)', variants: flicker },
  horoscope: { Icon: Moon, color: '#A99FFF', glow: 'rgba(140,120,255,0.5)', bg: 'linear-gradient(150deg, #1A1A40 0%, #0D0D26 100%)', variants: orbit },
  'ex-message': { Icon: MessageCircle, color: '#E8367A', glow: 'rgba(232,54,122,0.4)', bg: 'linear-gradient(150deg, #FFE3EC 0%, #FFD0E0 100%)', variants: buzz },
  boarding: { Icon: Plane, color: '#1976D2', glow: 'rgba(25,118,210,0.4)', bg: 'linear-gradient(150deg, #E3F2FD 0%, #BBDEFB 100%)', variants: fly },
  'breaking-news': { Icon: Radio, color: '#D32F2F', glow: 'rgba(211,47,47,0.4)', bg: 'linear-gradient(150deg, #FFFFFF 0%, #F0F0F0 100%)', variants: pulse },
};

const DEFAULT_THEME: CardTheme = {
  Icon: Sparkles,
  color: '#E8625A',
  glow: 'rgba(232,98,90,0.4)',
  bg: 'linear-gradient(150deg, #FFE3D6 0%, #FFC9D6 100%)',
  variants: heartbeat,
};

export function TemplateGalleryCard({
  template,
  index = 0,
}: {
  template: GalleryTemplateView;
  index?: number;
}) {
  const theme = THEMES[template.id] ?? DEFAULT_THEME;
  const { Icon } = theme;
  const [active, setActive] = useState(false);

  return (
    <motion.li
      className={styles.card}
      style={{ '--tpl-accent': theme.color, '--tpl-glow': theme.glow } as CSSProperties}
      data-active={active ? 'true' : undefined}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.45, ease: 'easeOut', delay: Math.min(index, 7) * 0.05 }}
      onHoverStart={() => setActive(true)}
      onHoverEnd={() => setActive(false)}
      onTapStart={() => setActive(true)}
      onTap={() => setActive(false)}
      onTapCancel={() => setActive(false)}
    >
      <Link
        href={template.createHref}
        className={styles.preview}
        style={{ background: theme.bg }}
        aria-label={`Создать по шаблону «${template.name}»`}
      >
        <motion.span
          className={styles.previewGlow}
          aria-hidden="true"
          animate={active ? { opacity: 1, scale: 1.25 } : { opacity: 0.4, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
        <motion.div
          className={styles.previewPhone}
          animate={active ? { y: -4 } : { y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <motion.span
            className={styles.previewIcon}
            variants={theme.variants}
            initial="rest"
            animate={active ? 'active' : 'rest'}
          >
            <Icon size={34} strokeWidth={1.8} color={theme.color} aria-hidden="true" />
          </motion.span>
        </motion.div>
      </Link>
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{template.name}</h3>
        <p className={styles.cardDesc}>{template.description}</p>
        <Link href={template.createHref} className={styles.createButton}>
          Создать →
        </Link>
      </div>
    </motion.li>
  );
}
