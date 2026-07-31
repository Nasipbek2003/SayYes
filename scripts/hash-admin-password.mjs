#!/usr/bin/env node
/**
 * Генерация значения ADMIN_PASSWORD_HASH для админ-панели.
 *
 * Формат — тот же `salt:hash` (scrypt), что и у авторских паролей в
 * `lib/auth/password.ts`, поэтому проверку делает та же функция.
 *
 * Использование:
 *   node scripts/hash-admin-password.mjs "мой-пароль"
 *   node scripts/hash-admin-password.mjs            # спросит пароль в консоли
 */
import { randomBytes, scrypt } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv } from 'node:process';

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const derived = await new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return `${salt}:${derived.toString('hex')}`;
}

const fromArgs = argv[2];
let password = fromArgs;

if (!password) {
  const rl = createInterface({ input: stdin, output: stdout });
  password = await rl.question('Пароль администратора: ');
  rl.close();
}

if (!password || password.length < 10) {
  console.error('Пароль должен быть не короче 10 символов.');
  process.exit(1);
}

const hash = await hashPassword(password);

console.log('\nДобавьте в .env:\n');
console.log(`ADMIN_EMAIL="admin@sayyes.kg"`);
console.log(`ADMIN_PASSWORD_HASH="${hash}"`);
console.log('\nИ отдельный секрет подписи admin-сессии (по желанию):');
console.log(`ADMIN_SESSION_SECRET="${randomBytes(32).toString('base64')}"\n`);
