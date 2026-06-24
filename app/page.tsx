/**
 * Главная страница — полноценный лендинг SayYes.
 * Структура вдохновлена wedwed.ru/invitations/ — Hero, преимущества,
 * как это работает, каталог шаблонов, фичи, FAQ, футер-CTA.
 */
import Link from 'next/link';
import { buildGallery } from '@/lib/gallery/gallery';
import { HowItWorksDemo } from './components/HowItWorksDemo';
import {
  BenefitIconLink,
  BenefitIconTarget,
  BenefitIconNotify,
  FeatureIconScenario,
  FeatureIconPlace,
  FeatureIconRsvp,
  FeatureIconTelegram,
  FeatureIconMobile,
  FeatureIconPreview,
  HeroHeart,
  HeroSparkle,
  FinalCtaIcon,
  FooterLogoIcon,
} from './components/LandingIcons';
import styles from './page.module.css';

export default function HomePage() {
  const templates = buildGallery();

  return (
    <>
      {/* ══════════════════════════════════════════
          1. HERO
      ══════════════════════════════════════════ */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.badge}>Сервис интерактивных приглашений</span>
          <h1 className={styles.heroTitle}>
            Создай персональное<br />приглашение за 5 минут
          </h1>
          <p className={styles.heroSubtitle}>
            Выбери шаблон, впиши данные и получи уникальную ссылку.
            Адресат откроет её в мессенджере и ответит прямо внутри.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/#catalog" className={styles.ctaPrimary}>
              Выбрать шаблон
            </Link>
            <Link href="/#how" className={styles.ctaSecondary}>
              Как это работает
            </Link>
          </div>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.phoneMock}>
            <div className={styles.phoneMockInner}>
              <div className={styles.phoneMockScreen}>
                <div className={styles.mockHeart}><HeroHeart /></div>
                <p className={styles.mockText}>Привет, Айя!</p>
                <p className={styles.mockSubtext}>У меня для тебя кое-что есть...</p>
                <button className={styles.mockBtn}>Открыть →</button>
              </div>
            </div>
          </div>
          {/* Декоративные иконки */}
          <span className={styles.deco1}><HeroSparkle /></span>
          <span className={styles.deco2}><HeroHeart /></span>
          <span className={styles.deco3}><HeroSparkle /></span>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          2. ПРЕИМУЩЕСТВА
      ══════════════════════════════════════════ */}
      <section className={styles.benefits}>
        <div className={styles.container}>
          <div className={styles.benefitsGrid}>
            {[
              { icon: <BenefitIconLink />, title: 'Одна ссылка — все гости', desc: 'Создаёшь раз, отправляешь сколько угодно. Никаких конвертов и курьеров.' },
              { icon: <BenefitIconTarget />, title: 'Уникальный опыт', desc: 'Интерактивный сценарий с анимациями — адресат почувствует заботу ещё до встречи.' },
              { icon: <BenefitIconNotify />, title: 'Ответы в Telegram', desc: 'Узнаешь кто открыл, кто согласился и какое место выбрал — сразу в уведомлении.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className={styles.benefitCard}>
                <span className={styles.benefitIcon}>{icon}</span>
                <h3 className={styles.benefitTitle}>{title}</h3>
                <p className={styles.benefitDesc}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          3. КАК ЭТО РАБОТАЕТ
      ══════════════════════════════════════════ */}
      <section className={styles.how} id="how">
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Как это работает</h2>
          <p className={styles.sectionSubtitle}>Три простых шага — и ссылка готова</p>
          <div className={styles.howLayout}>
            {/* Шаги слева */}
            <div className={styles.stepsGrid}>
              {[
                { num: '01', title: 'Выбери шаблон', desc: 'Свидание, той, день рождения — подбери сценарий под свой повод.' },
                { num: '02', title: 'Заполни данные', desc: 'Имя адресата, фото, список мест — всё настраивается за пару минут.' },
                { num: '03', title: 'Отправь ссылку', desc: 'Адресат получает интерактивный сценарий и отвечает прямо внутри.' },
              ].map(({ num, title, desc }) => (
                <div key={num} className={styles.step}>
                  <span className={styles.stepNum}>{num}</span>
                  <div>
                    <h3 className={styles.stepTitle}>{title}</h3>
                    <p className={styles.stepDesc}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Живая демо справа */}
            <div className={styles.demoCol}>
              <HowItWorksDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          4. КАТАЛОГ ШАБЛОНОВ
      ══════════════════════════════════════════ */}
      <section className={styles.catalog} id="catalog">
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Каталог шаблонов</h2>
          <p className={styles.sectionSubtitle}>
            Каждый сценарий сделан с любовью — с анимациями, развилками и сюрпризами
          </p>

          {templates.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyEmoji}>🗂️</span>
              <h3 className={styles.emptyTitle}>Шаблоны скоро появятся</h3>
              <p className={styles.emptyText}>Мы готовим новые сценарии. Загляни чуть позже.</p>
            </div>
          ) : (
            <ul className={styles.grid}>
              {templates.map((template) => (
                <li key={template.id} className={styles.card}>
                  <Link
                    href={template.createHref}
                    className={styles.preview}
                    style={{ background: template.previewGradient }}
                    aria-label={`Создать по шаблону «${template.name}»`}
                  >
                    <span className={styles.previewEmoji} aria-hidden="true">
                      {template.previewEmoji}
                    </span>
                    <span className={styles.previewLabel}>Выбрать</span>
                  </Link>
                  <div className={styles.cardBody}>
                    <h3 className={styles.cardTitle}>{template.name}</h3>
                    <p className={styles.cardDesc}>{template.description}</p>
                    {template.themes.length > 1 && (
                      <div className={styles.themes}>
                        <span className={styles.themesLabel}>Цветовая тема</span>
                        <p className={styles.themesHint}>Меняет цвет фона и оттенок кнопок — нажми для предпросмотра</p>
                        <div className={styles.themeChips}>
                          {template.themes.map((theme) => (
                            <Link
                              key={theme.id}
                              href={theme.href}
                              className={styles.themeChip}
                              title={theme.label}
                            >
                              {/* Мини-превью градиента */}
                              <span
                                className={styles.themeSwatch}
                                style={{ background: theme.gradient }}
                                aria-hidden="true"
                              />
                              {theme.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                    <Link href={template.createHref} className={styles.createButton}>
                      Создать приглашение
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════
          5. ЧТО ВЫ ПОЛУЧАЕТЕ (фичи)
      ══════════════════════════════════════════ */}
      <section className={styles.features}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Что вы получаете</h2>
          <p className={styles.sectionSubtitle}>Не просто ссылка — полноценный интерактивный опыт</p>
          <div className={styles.featuresList}>
            {[
              {
                icon: <FeatureIconScenario />,
                title: 'Сценарии с развилками',
                desc: 'Адресат проходит мини-историю: кнопка «Нет» убегает, «Да» растёт — невозможно отказать.',
              },
              {
                icon: <FeatureIconPlace />,
                title: 'Выбор места встречи',
                desc: 'Предложи несколько вариантов — адресат выберет место, и выбор сразу придёт тебе.',
              },
              {
                icon: <FeatureIconRsvp />,
                title: 'RSVP для событий',
                desc: 'Одна ссылка — все гости отвечают в удобное время. Видишь кто придёт и сколько человек.',
              },
              {
                icon: <FeatureIconTelegram />,
                title: 'Уведомления в Telegram',
                desc: 'Узнаешь в реальном времени: открыли ссылку, согласились, выбрали место.',
              },
              {
                icon: <FeatureIconMobile />,
                title: 'Работает в мессенджерах',
                desc: 'Оптимизировано под встроенный браузер Telegram, WhatsApp, Instagram.',
              },
              {
                icon: <FeatureIconPreview />,
                title: 'Красивое превью ссылки',
                desc: 'При вставке в мессенджер появляется карточка с интригующим текстом ещё до открытия.',
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className={styles.featureItem}>
                <span className={styles.featureIcon}>{icon}</span>
                <div>
                  <h3 className={styles.featureTitle}>{title}</h3>
                  <p className={styles.featureDesc}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          6. ТАРИФЫ
      ══════════════════════════════════════════ */}
      <section className={styles.pricing}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Стоимость</h2>
          <p className={styles.sectionSubtitle}>Разовая оплата за каждое приглашение</p>
          <div className={styles.pricingGrid}>
            <div className={styles.pricingCard}>
              <h3 className={styles.planName}>Базовый</h3>
              <div className={styles.planPrice}>990 <span>сом</span></div>
              <ul className={styles.planFeatures}>
                <li>✓ Интерактивный сценарий</li>
                <li>✓ Уникальная ссылка</li>
                <li>✓ Красивое превью в мессенджерах</li>
                <li>✓ Уведомления автору</li>
                <li className={styles.planMuted}>— Подпись SayYes внизу</li>
              </ul>
              <Link href="/#catalog" className={styles.planCta}>Выбрать шаблон</Link>
            </div>
            <div className={`${styles.pricingCard} ${styles['pricingCard--featured']}`}>
              <span className={styles.planBadge}>Популярный</span>
              <h3 className={styles.planName}>Премиум</h3>
              <div className={styles.planPrice}>1 990 <span>сом</span></div>
              <ul className={styles.planFeatures}>
                <li>✓ Всё из базового</li>
                <li>✓ Без подписи бренда</li>
                <li>✓ Расширенные анимации</li>
                <li>✓ Фоновая музыка</li>
                <li>✓ Приоритетная поддержка</li>
              </ul>
              <Link href="/#catalog" className={styles.planCta}>Выбрать шаблон</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          7. FAQ
      ══════════════════════════════════════════ */}
      <section className={styles.faq}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Вопрос — ответ</h2>
          <div className={styles.faqList}>
            {[
              { q: 'Что такое интерактивное приглашение?', a: 'Это мини-сайт в виде сценария: адресат открывает ссылку в мессенджере, проходит историю с анимациями и отвечает прямо внутри. Никаких звонков и ожиданий.' },
              { q: 'Сколько раз можно отправить одну ссылку?', a: 'Для свидания и простых приглашений — одному адресату. Для шаблона «Той / праздник» — одна ссылка рассылается всем гостям, каждый отвечает под своим именем.' },
              { q: 'Как я узнаю, что адресат ответил?', a: 'После привязки Telegram-бота уведомление придёт мгновенно: «открыли ссылку», «согласился», «выбрал: Кофейня, суббота 19:00».' },
              { q: 'Как долго действует ссылка?', a: 'По умолчанию — бессрочно. Можно установить срок действия или сделать ссылку одноразовой при создании.' },
              { q: 'Работает ли в Telegram, WhatsApp, Instagram?', a: 'Да. Всё тестировалось во встроенных браузерах этих мессенджеров — анимации, кнопки и сценарии работают корректно.' },
            ].map(({ q, a }) => (
              <details key={q} className={styles.faqItem}>
                <summary className={styles.faqQ}>{q}</summary>
                <p className={styles.faqA}>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          8. ФИНАЛЬНЫЙ CTA
      ══════════════════════════════════════════ */}
      <section className={styles.finalCta}>
        <div className={styles.container}>
          <div className={styles.finalCtaInner}>
            <span className={styles.finalCtaEmoji}><FinalCtaIcon /></span>
            <h2 className={styles.finalCtaTitle}>Создай своё первое приглашение</h2>
            <p className={styles.finalCtaSubtitle}>
              Выбери шаблон, заполни данные — ссылка будет готова за 5 минут
            </p>
            <Link href="/#catalog" className={styles.ctaPrimary}>
              Начать бесплатно
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          9. ФУТЕР
      ══════════════════════════════════════════ */}
      <footer className={styles.footer}>
        <div className={styles.container}>

          {/* Верхняя строка: бренд + колонки ссылок */}
          <div className={styles.footerTop}>

            {/* Бренд и описание */}
            <div className={styles.footerBrand}>
              <span className={styles.footerLogo}><FooterLogoIcon /> SayYes</span>
              <p className={styles.footerTagline}>
                Интерактивные приглашения, которые хочется получить
              </p>
              <div className={styles.footerContacts}>
                <a href="mailto:hello@sayyes.app" className={styles.footerContact}>
                  hello@sayyes.app
                </a>
                <a href="https://t.me/sayyesapp" className={styles.footerContact} target="_blank" rel="noopener noreferrer">
                  @sayyesapp в Telegram
                </a>
              </div>
            </div>

            {/* Навигация */}
            <div className={styles.footerCols}>
              <div className={styles.footerCol}>
                <p className={styles.footerColTitle}>Сервис</p>
                <Link href="/#catalog">Шаблоны</Link>
                <Link href="/#how">Как работает</Link>
                <Link href="/#pricing">Цены</Link>
                <Link href="/#faq">Вопросы</Link>
              </div>
              <div className={styles.footerCol}>
                <p className={styles.footerColTitle}>Личный кабинет</p>
                <Link href="/me/invitations">Мои приглашения</Link>
                <Link href="/login">Войти</Link>
              </div>
              <div className={styles.footerCol}>
                <p className={styles.footerColTitle}>Поддержка</p>
                <a href="mailto:hello@sayyes.app">Написать нам</a>
                <a href="https://t.me/sayyesapp" target="_blank" rel="noopener noreferrer">Telegram-бот</a>
              </div>
            </div>
          </div>

          {/* Нижняя строка: копирайт + юридические ссылки */}
          <div className={styles.footerBottom}>
            <p className={styles.footerCopy}>© 2025 SayYes. Все права защищены.</p>
            <div className={styles.footerLegal}>
              <Link href="/legal/privacy">Политика конфиденциальности</Link>
              <Link href="/legal/terms">Условия использования</Link>
              <Link href="/legal/payment">Правила оплаты</Link>
            </div>
          </div>

        </div>
      </footer>
    </>
  );
}
