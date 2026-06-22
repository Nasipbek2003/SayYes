import Link from 'next/link';

export const metadata = { title: 'Условия использования — SayYes' };

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 720, margin: '48px auto', padding: '0 20px 64px', color: 'var(--text)' }}>
      <Link href="/" style={{ fontSize: 13, color: 'var(--accent)', display: 'inline-block', marginBottom: 24 }}>← На главную</Link>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400, marginBottom: 24 }}>Условия использования</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 32 }}>Последнее обновление: июнь 2025</p>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 20, fontSize: 15, lineHeight: 1.7 }}>
        <p>Используя SayYes, вы соглашаетесь с настоящими условиями.</p>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Описание сервиса</h2>
        <p style={{ color: 'var(--text-muted)' }}>SayYes — онлайн-сервис для создания интерактивных приглашений. Пользователь создаёт персональное приглашение, получает уникальную ссылку и отправляет её адресату.</p>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Использование контента</h2>
        <p style={{ color: 'var(--text-muted)' }}>Вы несёте ответственность за загружаемые материалы (фото, тексты). Запрещено загружать незаконный, оскорбительный или нарушающий авторские права контент.</p>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Оплата</h2>
        <p style={{ color: 'var(--text-muted)' }}>Оплата производится разово за каждое приглашение. После активации ссылки оплата не возвращается.</p>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Ограничение ответственности</h2>
        <p style={{ color: 'var(--text-muted)' }}>Сервис предоставляется «как есть». Мы не несём ответственности за косвенные убытки, связанные с использованием или невозможностью использования сервиса.</p>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Контакты</h2>
        <p style={{ color: 'var(--text-muted)' }}>По вопросам: <a href="mailto:hello@sayyes.app" style={{ color: 'var(--accent)' }}>hello@sayyes.app</a></p>
      </section>
    </main>
  );
}
