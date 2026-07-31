/**
 * Создать (или обновить) пользователя с ролью ADMIN.
 *
 *   npm run admin:create -- --login nnbek23 --password nasipbek
 *   npm run admin:create -- --login nnbek23 --password ... --email admin@sayyes.kg
 *
 * Пароль хранится как scrypt-хэш (`lib/auth/password.ts`) — тот же формат, что
 * у обычных авторов, так что проверку делает одна и та же функция. Если автор с
 * таким логином/email уже есть, ему обновляются роль и пароль: скрипт можно
 * запускать повторно (идемпотентно).
 */
import { hashPassword } from '../lib/auth/password';
import { prisma } from '../lib/prisma';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

async function main(): Promise<void> {
  const login = (arg('login') ?? '').trim().toLowerCase();
  const password = arg('password') ?? '';
  const email = arg('email')?.trim().toLowerCase();

  if (!login || !password) {
    console.error(
      'Использование: npm run admin:create -- --login <логин> --password <пароль> [--email <email>]',
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const existing = await prisma.author.findFirst({
    where: { OR: [{ login }, ...(email ? [{ email }] : [])] },
  });

  const author = existing
    ? await prisma.author.update({
        where: { id: existing.id },
        data: { login, role: 'ADMIN', passwordHash, ...(email ? { email } : {}) },
      })
    : await prisma.author.create({
        data: { login, role: 'ADMIN', passwordHash, email: email ?? null },
      });

  console.log(
    `${existing ? 'Обновлён' : 'Создан'} администратор: login=${author.login} id=${author.id} email=${author.email ?? '—'}`,
  );
  console.log('Вход: /admin');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
