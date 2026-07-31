/**
 * Явная загрузка `.env` для служебных скриптов.
 *
 * `lib/env.ts` считывает `process.env` в момент импорта модуля, а `tsx` сам
 * `.env` не читает — его подтягивает Prisma при своей инициализации. Из-за этого
 * работоспособность скрипта зависела от порядка импортов: если `lib/env` был
 * первым, переменные оказывались пустыми и конфигурация «терялась».
 *
 * Поэтому этот модуль импортируется **первой строкой** в каждом скрипте:
 *
 *   import './loadEnv';
 *   import { prisma } from '../lib/prisma';
 */
import { readFileSync } from 'node:fs';

function load(file: string): void {
  let raw: string;
  try {
    raw = readFileSync(new URL(file, import.meta.url), 'utf8');
  } catch {
    return;
  }

  for (const line of raw.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    // Переменные, уже заданные в окружении, приоритетнее файла.
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

load('../.env');
