import Link from 'next/link';

export const metadata = { title: 'Политика конфиденциальности — SayYes' };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '48px auto', padding: '0 20px 64px', color: 'var(--text)' }}>
      <Link href="/" style={{ fontSize: 13, color: 'var(--accent)', display: 'inline-block', marginBottom: 24 }}>← На главную</Link>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400, marginBottom: 24 }}>Политика конфиденциальности</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 32 }}>Последнее обновление: июнь 2025</p>

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

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Хранение данных</h2>
        <p style={{ color: 'var(--text-muted)' }}>Данные хранятся на защищённых серверах. Приглашения по умолчанию хранятся бессрочно — вы можете удалить их из личного кабинета.</p>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Контакты</h2>
        <p style={{ color: 'var(--text-muted)' }}>По вопросам конфиденциальности: <a href="mailto:hello@sayyes.app" style={{ color: 'var(--accent)' }}>hello@sayyes.app</a></p>
      </section>
    </main>
  );
}
