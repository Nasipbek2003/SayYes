/**
 * Перенос конфигурации из `.env` в таблицу `Setting`.
 *
 *   npx tsx scripts/seed-settings.ts
 *
 * Зачем: приложение читает настройки по правилу «база → окружение», и локально
 * всё работало из `.env`. На задеплоенном стенде того же `.env` нет, поэтому
 * значения нужно один раз положить в базу — она общая, и прод подхватит их сам.
 *
 * Секреты (API secret Cloudinary) шифруются ключом `SETTINGS_ENCRYPTION_KEY`.
 * Этот ключ обязан совпадать на всех стендах, иначе прод не сможет расшифровать
 * значение и снова останется без доступов.
 */
import './loadEnv';

import { getCloudinaryConfig, saveCloudinaryConfig, SETTING_KEYS } from '../lib/settings/appConfig';
import { env } from '../lib/env';
import { prisma } from '../lib/prisma';
import { getSetting, setSetting } from '../lib/settings/store';

async function main(): Promise<void> {
  if (!process.env.SETTINGS_ENCRYPTION_KEY) {
    console.warn(
      'ВНИМАНИЕ: SETTINGS_ENCRYPTION_KEY не задан — секрет будет зашифрован ключом из\n' +
        'SESSION_SECRET, который на проде другой. Задайте явный ключ и повторите.',
    );
  }

  // Cloudinary: имя облака и ключ — обычные значения, secret — шифруется.
  if (env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret) {
    await saveCloudinaryConfig({
      cloudName: env.cloudinary.cloudName,
      apiKey: env.cloudinary.apiKey,
      apiSecret: env.cloudinary.apiSecret,
      uploadFolder: env.cloudinary.uploadFolder,
    });
    console.log(`✓ Cloudinary: ${env.cloudinary.cloudName} (папка ${env.cloudinary.uploadFolder})`);
  } else {
    console.log('— Cloudinary в .env не задан, пропускаю');
  }

  // Имя Telegram-бота: нужно для ссылки привязки.
  if (env.telegram.botUsername) {
    await setSetting(SETTING_KEYS.botUsername, env.telegram.botUsername, {
      description: 'Имя Telegram-бота для ссылки привязки (t.me/<username>)',
    });
    console.log(`✓ Telegram-бот: @${env.telegram.botUsername}`);
  }

  // Проверка: читаем обратно уже через обычный путь приложения.
  const check = await getCloudinaryConfig();
  const secretReadable = Boolean(await getSetting(SETTING_KEYS.cloudinaryApiSecret));
  console.log(
    `\nПроверка чтения из базы: облако=${check.cloudName || '—'}, ` +
      `api key=${check.apiKey ? 'есть' : 'нет'}, secret расшифрован=${secretReadable ? 'да' : 'НЕТ'}`,
  );

  const rows = await prisma.setting.count();
  console.log(`Всего настроек в базе: ${rows}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
