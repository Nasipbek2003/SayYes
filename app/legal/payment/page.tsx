import Link from 'next/link';

export const metadata = { title: 'Правила оплаты — SayYes' };

export default function PaymentPage() {
  return (
    <main style={{ maxWidth: 720, margin: '48px auto', padding: '0 20px 64px', color: 'var(--text)' }}>
      <Link href="/" style={{ fontSize: 13, color: 'var(--accent)', display: 'inline-block', marginBottom: 24 }}>← На главную</Link>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400, marginBottom: 24 }}>Правила оплаты</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 32 }}>Последнее обновление: июнь 2025</p>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 20, fontSize: 15, lineHeight: 1.7 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400 }}>Способы оплаты</h2>
        <p style={{ color: 'var(--text-muted)' }}>Оплата производится банковской картой через защищённый платёжный шлюз. Данные карты не хранятся на наших серверах.</p>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Тарифы</h2>
        <ul style={{ paddingLeft: 20, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li><strong style={{ color: 'var(--text)' }}>Базовый</strong> — 990 ₸ за одно приглашение</li>
          <li><strong style={{ color: 'var(--text)' }}>Премиум</strong> — 1 990 ₸ за одно приглашение</li>
        </ul>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Возврат</h2>
        <p style={{ color: 'var(--text-muted)' }}>После успешной активации ссылки (получения уникального URL) оплата возврату не подлежит. Если активация не произошла по техническим причинам на нашей стороне — обратитесь в поддержку.</p>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, marginTop: 8 }}>Поддержка</h2>
        <p style={{ color: 'var(--text-muted)' }}>По вопросам оплаты: <a href="mailto:hello@sayyes.app" style={{ color: 'var(--accent)' }}>hello@sayyes.app</a></p>
      </section>
    </main>
  );
}
