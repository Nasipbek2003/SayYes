'use client';
/**
 * Живая CSS-анимация «Как это работает»:
 * 4 сцены по ~3 сек каждая = ~12 сек цикл, потом повтор.
 * Сцена 1 — Выбор шаблона
 * Сцена 2 — Заполнение данных
 * Сцена 3 — Адресат открывает ссылку / проходит сценарий
 * Сцена 4 — Автор получает уведомление в Telegram
 */
import { useEffect, useState } from 'react';
import styles from './HowItWorksDemo.module.css';

const SCENE_DURATION = 3000; // мс на сцену
const SCENES = 4;

export function HowItWorksDemo() {
  const [scene, setScene] = useState(0);
  const [animating, setAnimating] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setAnimating(false);
      setTimeout(() => {
        setScene((s) => (s + 1) % SCENES);
        setAnimating(true);
      }, 300);
    }, SCENE_DURATION);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={styles.wrapper}>
      {/* Индикатор прогресса */}
      <div className={styles.progress}>
        {Array.from({ length: SCENES }).map((_, i) => (
          <div
            key={i}
            className={`${styles.dot} ${i === scene ? styles['dot--active'] : ''} ${i < scene ? styles['dot--done'] : ''}`}
          />
        ))}
      </div>

      {/* Экран-телефон */}
      <div className={styles.phone}>
        <div className={styles.phoneBar}>
          <span className={styles.phoneBarDot} />
          <span className={styles.phoneBarDot} />
          <span className={styles.phoneBarDot} />
        </div>
        <div className={`${styles.screen} ${animating ? styles['screen--in'] : styles['screen--out']}`}>
          {scene === 0 && <Scene1 />}
          {scene === 1 && <Scene2 />}
          {scene === 2 && <Scene3 />}
          {scene === 3 && <Scene4 />}
        </div>
      </div>

      {/* Подпись сцены */}
      <div className={`${styles.caption} ${animating ? styles['caption--in'] : styles['caption--out']}`}>
        {scene === 0 && <><strong>Шаг 1</strong> — Выбери шаблон и тему</>}
        {scene === 1 && <><strong>Шаг 2</strong> — Впиши данные: имя, фото, места</>}
        {scene === 2 && <><strong>Шаг 3</strong> — Адресат открывает ссылку и отвечает</>}
        {scene === 3 && <><strong>Готово</strong> — Уведомление в Telegram</>}
      </div>
    </div>
  );
}

/* ── Сцена 1: Выбор шаблона ── */
function Scene1() {
  return (
    <div className={styles.scene1}>
      <p className={styles.s1Label}>Выбери шаблон</p>
      <div className={styles.s1Cards}>
        {[
          { emoji: '💖', name: 'Свидание', active: true },
          { emoji: '🎉', name: 'Той / праздник', active: false },
          { emoji: '🎂', name: 'День рождения', active: false },
        ].map(({ emoji, name, active }) => (
          <div key={name} className={`${styles.s1Card} ${active ? styles['s1Card--active'] : ''}`}>
            <span className={styles.s1Emoji}>{emoji}</span>
            <span className={styles.s1Name}>{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Сцена 2: Заполнение формы ── */
function Scene2() {
  return (
    <div className={styles.scene2}>
      <p className={styles.s2Label}>Заполни данные</p>
      <div className={styles.s2Form}>
        <div className={styles.s2Field}>
          <span className={styles.s2FieldLabel}>Имя адресата</span>
          <div className={styles.s2FieldValue}>
            Айя<span className={styles.s2Cursor}>|</span>
          </div>
        </div>
        <div className={styles.s2Field}>
          <span className={styles.s2FieldLabel}>Текст приглашения</span>
          <div className={styles.s2FieldValue} style={{ fontSize: 11 }}>
            Пойдём в кино в субботу?
          </div>
        </div>
        <div className={styles.s2Field}>
          <span className={styles.s2FieldLabel}>Место</span>
          <div className={styles.s2FieldValue} style={{ fontSize: 11 }}>
            🎬 Кинотеатр &quot;Манас&quot;
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Сцена 3: Адресат проходит сценарий ── */
function Scene3() {
  return (
    <div className={styles.scene3}>
      <div className={styles.s3Heart}>💖</div>
      <p className={styles.s3Greeting}>Привет, Айя!</p>
      <p className={styles.s3Text}>Пойдём в кино в субботу?</p>
      <div className={styles.s3Buttons}>
        <button className={styles.s3Yes} type="button">Давай!</button>
        <button className={styles.s3No} type="button">Нет</button>
      </div>
    </div>
  );
}

/* ── Сцена 4: Уведомление в Telegram ── */
function Scene4() {
  return (
    <div className={styles.scene4}>
      <div className={styles.s4App}>
        <div className={styles.s4AppBar}>
          <span className={styles.s4BotIcon}>🤖</span>
          <span className={styles.s4BotName}>SayYes бот</span>
        </div>
        <div className={styles.s4Message}>
          <span className={styles.s4MsgText}>
            🎉 Айя согласилась!<br />
            <span className={styles.s4MsgSub}>Выбрала: Кинотеатр &quot;Манас&quot;</span>
          </span>
          <span className={styles.s4MsgTime}>только что</span>
        </div>
      </div>
      <p className={styles.s4Caption}>Уведомление пришло мгновенно</p>
    </div>
  );
}
