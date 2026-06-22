import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  const storedBuffer = Buffer.from(hash, 'hex');
  if (derived.length !== storedBuffer.length) return false;
  return timingSafeEqual(derived, storedBuffer);
}
