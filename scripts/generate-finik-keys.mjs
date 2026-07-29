/**
 * Генерация пары RSA-ключей для Finik Web SDK.
 *
 *   node scripts/generate-finik-keys.mjs
 *
 * Приватным ключом мы подписываем каждый запрос к Finik, публичный — загружаем
 * в личный кабинет Finik при создании API-ключа типа «Веб-клиент».
 *
 * Файлы кладутся в ./secrets (в .gitignore). Приватный ключ никогда не должен
 * попадать в git, в клиентский бандл или в логи.
 */
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve(process.cwd(), 'secrets');
const privatePath = resolve(outDir, 'finik_private.pem');
const publicPath = resolve(outDir, 'finik_public.pem');

if (existsSync(privatePath) && !process.argv.includes('--force')) {
  console.error(
    `Ключи уже существуют: ${privatePath}\n` +
      'Перегенерация сделает недействительным API-ключ, выданный Finik.\n' +
      'Если это точно нужно — запусти с флагом --force.',
  );
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

mkdirSync(outDir, { recursive: true });
writeFileSync(privatePath, privateKey, { mode: 0o600 });
writeFileSync(publicPath, publicKey, { mode: 0o644 });

console.log('Готово.');
console.log(`  приватный ключ → ${privatePath}  (секрет, только на бэкенде)`);
console.log(`  публичный ключ → ${publicPath}   (загрузить в кабинет Finik)`);
console.log('\nПубличный ключ (finik_public.pem):\n');
console.log(publicKey.trim());
console.log(
  '\nДальше:\n' +
    '  1. Загрузи finik_public.pem в кабинете Finik → «Ключи» → «Сгенерировать ключ» (тип: Веб-клиент).\n' +
    '  2. Полученный API-ключ положи в FINIK_API_KEY, id счёта — в FINIK_ACCOUNT_ID.\n' +
    '  3. Приватный ключ пропиши в FINIK_PRIVATE_KEY (одной строкой с \\n) либо оставь файл и укажи FINIK_PRIVATE_KEY_PATH=secrets/finik_private.pem.\n' +
    '  4. Публичный ключ Finik (для проверки подписи вебхуков) запроси у Finik и положи в FINIK_WEBHOOK_PUBLIC_KEY.',
);
