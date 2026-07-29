/**
 * Готовит приватный ключ Finik к вставке в переменную окружения хостинга:
 * переводы строк заменяются на литеральные `\n`.
 *
 *   node scripts/finik-key-oneline.mjs
 *
 * Результат кладётся в secrets/finik_private_oneline.txt (папка в .gitignore).
 * В консоль ключ не печатается — чтобы не остался в истории терминала.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve(process.cwd(), 'secrets', 'finik_private.pem');
const target = resolve(process.cwd(), 'secrets', 'finik_private_oneline.txt');

const pem = readFileSync(source, 'utf8').trim();
const oneLine = pem.replace(/\r?\n/g, '\\n');

writeFileSync(target, oneLine, { mode: 0o600 });

console.log(`Готово: ${target}`);
console.log(`Длина строки: ${oneLine.length} символов`);
console.log(
  'Открой файл, скопируй всю строку и вставь в переменную FINIK_PRIVATE_KEY на хостинге.',
);
