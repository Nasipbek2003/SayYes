import Link from 'next/link';

export const metadata = { title: 'Политика конфиденциальности — SayYes' };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '48px auto', padding: '0 20px 64px', color: 'var(--text)' }}>
      <Link href="/" style={{ fontSize: 13, color: 'var(--accent)', display: 'inline-block', marginBottom: 24 }}>← На главную</Link>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400, marginBottom: 24 }}>Политика конфиденциальности</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 32 }}>Последнее обновление: июль 2026</p>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 20, fontSize: 15, lineHeight: 1.7 }}>
        <p>SayYes уважает вашу конфиденциальность. Мы собираем только те данные, которые необходимы для работы сервиса.</p>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Какие данные мы собираем</h2>
        <ul style={{ paddingLeft: 20, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>Email-адрес для авторизации через magic-link</li>
          <li>Telegram chat ID при привязке бота для уведомлений</li>
          <li>Данные приглашений: имена, фото, тексты — только те, что вы вводите</li>
          <li>Ответы адресатов на приглашения</li>
        </ul>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Как мы используем данные</h2>
        <p style={{ color: 'var(--text-muted)' }}>Данные используются исключительно для предоставления услуг сервиса. Мы не продаём и не передаём ваши данные третьим лицам без вашего согласия.</p>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Где хранятся фото</h2>
        <p style={{ color: 'var(--text-muted)' }}>Загружаемые фотографии хранятся у стороннего провайдера облачного хранилища (Cloudinary) и отдаются по прямым ссылкам в рамках конкретного приглашения.</p>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Приватность ссылок</h2>
        <ul style={{ paddingLeft: 20, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>Страницы приглашений закрыты от индексации поисковыми системами (noindex).</li>
          <li>Доступ к приглашению возможен только по уникальной ссылке.</li>
          <li>Вы можете задать срок жизни ссылки и одноразовый просмотр.</li>
        </ul>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Хранение и удаление данных</h2>
        <p style={{ color: 'var(--text-muted)' }}>Данные хранятся на защищённых серверах. Когда срок жизни ссылки истекает, приглашение становится недоступным, а загруженные для него фотографии автоматически удаляются из хранилища. Вы также можете удалить приглашение из личного кабинета в любой момент; при удалении аккаунта удаляются все связанные данные.</p>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Контакты</h2>
        <p style={{ color: 'var(--text-muted)' }}>По вопросам конфиденциальности: <a href="mailto:hello@sayyes.app" style={{ color: 'var(--accent)' }}>hello@sayyes.app</a></p>
      </section>
    </main>
  );
}
