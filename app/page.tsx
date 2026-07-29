/**
 * Главная страница — полноценный лендинг SayYes.
 * Структура вдохновлена wedwed.ru/invitations/ — Hero, преимущества,
 * как это работает, каталог шаблонов, фичи, FAQ, футер-CTA.
 */
import Link from 'next/link';
import { Check, LayoutTemplate, ArrowRight } from 'lucide-react';
import { buildGallery } from '@/lib/gallery/gallery';
import { PLANS } from '@/lib/pricing';
import { HowItWorksDemo } from './components/HowItWorksDemo';
import { PhoneVideo } from './components/PhoneVideo';
import { TemplateGalleryCard } from './components/TemplateGalleryCard';
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
          1. HERO — асимметричный сплит, инлайн-акцент в заголовке
      ══════════════════════════════════════════ */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.badge}>Сервис интерактивных приглашений</span>
          <h1 className={styles.heroTitle}>
            Создай личное<br />
            <span className={styles.heroTitleScript}>приглашение</span>,
            <br />не просто ссылку
          </h1>
          <p className={styles.heroSubtitle}>
            Выбери сценарий, впиши данные и получи уникальную ссылку.
            Адресат откроет её в мессенджере и ответит прямо внутри.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/#catalog" className={styles.ctaPrimary}>
              Выбрать шаблон
            </Link>
          </div>
          {/* Social proof — реальные цифры из движка, без выдуманных метрик */}
          <ul className={styles.trustRow}>
            <li className={styles.trustItem}>
              <strong className={styles.trustNum}>5 мин</strong>
              <span className={styles.trustLabel}>на создание</span>
            </li>
            <li className={styles.trustDivider} aria-hidden="true" />
            <li className={styles.trustItem}>
              <strong className={styles.trustNum}>{templates.length}</strong>
              <span className={styles.trustLabel}>живых сценариев</span>
            </li>
            <li className={styles.trustDivider} aria-hidden="true" />
            <li className={styles.trustItem}>
              <strong className={styles.trustNum}>Telegram</strong>
              <span className={styles.trustLabel}>ответы онлайн</span>
            </li>
          </ul>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.phoneMock}>
            <div className={styles.phoneMockInner}>
              <PhoneVideo />
            </div>
          </div>
          {/* Тонкий декоративный акцент — статичный, не мигающие эмодзи */}
          <span className={styles.deco1} aria-hidden="true"><HeroSparkle /></span>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          2. ПРЕИМУЩЕСТВА — асимметричный bento, не 3 равные карточки
      ══════════════════════════════════════════ */}
      <section className={styles.benefits}>
        <div className={styles.container}>
          <div className={styles.benefitsGrid}>
            <div className={`${styles.benefitCard} ${styles.benefitCardLead}`}>
              <span className={styles.benefitIcon}><BenefitIconTarget /></span>
              <h3 className={styles.benefitTitle}>Уникальный опыт</h3>
              <p className={styles.benefitDesc}>
                Интерактивный сценарий с анимациями и развилками — адресат
                почувствует заботу ещё до встречи, а не просто прочитает текст.
              </p>
            </div>
            <div className={styles.benefitCard}>
              <span className={styles.benefitIcon}><BenefitIconLink /></span>
              <h3 className={styles.benefitTitle}>Одна ссылка — все гости</h3>
              <p className={styles.benefitDesc}>Создаёшь раз, отправляешь сколько угодно.</p>
            </div>
            <div className={styles.benefitCard}>
              <span className={styles.benefitIcon}><BenefitIconNotify /></span>
              <h3 className={styles.benefitTitle}>Ответы в Telegram</h3>
              <p className={styles.benefitDesc}>Узнаешь кто открыл, кто согласился и какое место выбрал.</p>
            </div>
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
              <span className={styles.emptyIcon} aria-hidden="true"><LayoutTemplate size={40} strokeWidth={1.6} /></span>
              <h3 className={styles.emptyTitle}>Шаблоны скоро появятся</h3>
              <p className={styles.emptyText}>Мы готовим новые сценарии. Загляни чуть позже.</p>
            </div>
          ) : (
            <ul className={styles.grid}>
              {templates.map((template, index) => (
                <TemplateGalleryCard key={template.id} template={template} index={index} />
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
      <section className={styles.pricing} id="pricing">
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Стоимость</h2>
          <p className={styles.sectionSubtitle}>
            Разовая оплата за приглашение или подписка на месяц
          </p>
          <div className={styles.pricingGrid}>
            <div className={styles.pricingCard}>
              <h3 className={styles.planName}>{PLANS.single.title}</h3>
              <div className={styles.planPrice}>{PLANS.single.amount} <span>сом</span></div>
              <ul className={styles.planFeatures}>
                <li><Check size={15} strokeWidth={2.2} /> Одно приглашение</li>
                <li><Check size={15} strokeWidth={2.2} /> Интерактивный сценарий</li>
                <li><Check size={15} strokeWidth={2.2} /> Уникальная ссылка</li>
                <li><Check size={15} strokeWidth={2.2} /> Красивое превью в мессенджерах</li>
                <li><Check size={15} strokeWidth={2.2} /> Уведомления автору</li>
              </ul>
              <Link href="/#catalog" className={styles.planCta}>Выбрать шаблон</Link>
            </div>
            <div className={`${styles.pricingCard} ${styles['pricingCard--featured']}`}>
              <span className={styles.planBadge}>Выгодно от 3 приглашений</span>
              <h3 className={styles.planName}>{PLANS.monthly.title}</h3>
              <div className={styles.planPrice}>
                {PLANS.monthly.amount} <span>сом / месяц</span>
              </div>
              <ul className={styles.planFeatures}>
                <li><Check size={15} strokeWidth={2.2} /> Сколько угодно приглашений</li>
                <li><Check size={15} strokeWidth={2.2} /> 30 дней доступа</li>
                <li><Check size={15} strokeWidth={2.2} /> Все функции шаблонов</li>
                <li><Check size={15} strokeWidth={2.2} /> Без подписи бренда</li>
                <li><Check size={15} strokeWidth={2.2} /> Приоритетная поддержка</li>
              </ul>
              <Link href="/#catalog" className={styles.planCta}>Выбрать шаблон</Link>
            </div>
          </div>
          <p className={styles.sectionSubtitle} style={{ marginTop: 18 }}>
            Оплата через Finik — любым банковским приложением Кыргызстана.
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          7. FAQ
      ══════════════════════════════════════════ */}
      <section className={styles.faq} id="faq">
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
            <span className={styles.finalCtaIcon} aria-hidden="true"><FinalCtaIcon /></span>
            <h2 className={styles.finalCtaTitle}>Создай своё первое приглашение</h2>
            <p className={styles.finalCtaSubtitle}>
              Выбери шаблон, заполни данные — ссылка будет готова за 5 минут
            </p>
            <Link href="/#catalog" className={styles.ctaPrimary}>
              Начать бесплатно <ArrowRight size={16} strokeWidth={2.2} />
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
            <p className={styles.footerCopy}>© {new Date().getFullYear()} SayYes. Все права защищены.</p>
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
