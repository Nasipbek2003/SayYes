/**
 * Cloudinary image storage (task 4.3 — author photo upload, Requirement 2.2).
 *
 * Author-uploaded photos are stored in Cloudinary rather than served from our
 * own origin. The upload flow is a **server-side signed upload**: the browser
 * posts the file to our `POST /api/invitations/:id/photo` route (authenticated,
 * ownership-checked), and this module forwards the bytes to Cloudinary using a
 * request signed with the account's API secret. The secret therefore never
 * leaves the server, and clients cannot upload arbitrary content on their own.
 *
 * Configuration lives in {@link env.cloudinary} (parsed from `CLOUDINARY_URL`).
 * When it is absent (e.g. local dev without a Cloudinary account) uploads fail
 * with a clear {@link StorageError} instead of a generic 500, so the missing
 * configuration is obvious.
 *
 * The pure helpers ({@link validateImage}, {@link signParams}) are exported so
 * they can be unit-tested without hitting the network.
 */
import { createHash } from 'node:crypto';

import { getCloudinaryConfig } from '@/lib/settings/appConfig';

/** Maximum accepted image size in bytes (mirrors the UI hint: 7 MB). */
export const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

/** Image MIME types the author may upload (Requirement 2.2). */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Error carrying the HTTP status the photo route should return. */
export class StorageError extends Error {
  constructor(
    readonly status: 400 | 500 | 502,
    message: string,
    /** Machine-readable code for the client. */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Доступы Cloudinary: сначала таблица `Setting` (их правит администратор из
 * панели), затем `CLOUDINARY_URL` из окружения — см. `getCloudinaryConfig`.
 */
async function resolveConfig() {
  return getCloudinaryConfig();
}

/** True when Cloudinary credentials are present and uploads can proceed. */
export async function isConfigured(): Promise<boolean> {
  const { cloudName, apiKey, apiSecret } = await resolveConfig();
  return Boolean(cloudName && apiKey && apiSecret);
}

/**
 * Validate an uploaded file's declared type and size, throwing a 400
 * {@link StorageError} for an unsupported type, an oversized file, or an empty
 * file (Requirement 2.2). Pure — takes only the metadata it needs.
 */
export function validateImage(file: { type: string; size: number }): void {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as AllowedImageType)) {
    throw new StorageError(
      400,
      'Поддерживаются только JPEG, PNG, WebP и GIF.',
      'unsupported_type',
    );
  }
  if (file.size === 0) {
    throw new StorageError(400, 'Файл пустой.', 'empty_file');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new StorageError(400, 'Файл больше 7 МБ.', 'file_too_large');
  }
}

/**
 * Build a Cloudinary upload signature: SHA-1 of the signable params (sorted by
 * key, joined `k=v&…`) concatenated with the API secret. Only the params that
 * participate in signing are passed here (never `file`, `api_key` or
 * `resource_type`). Pure and deterministic — unit-testable.
 */
export function signParams(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex');
}

/** Result of a successful upload. */
export interface UploadResult {
  /** Public HTTPS URL of the stored image (Cloudinary `secure_url`). */
  url: string;
  /** Cloudinary public id (useful for later deletion — privacy purge). */
  publicId: string;
}

/**
 * Upload an image buffer to Cloudinary via a signed request and return its
 * secure URL. Throws a {@link StorageError} when storage is unconfigured (500)
 * or Cloudinary rejects the upload (502).
 */
export async function uploadImage(
  buffer: Buffer,
  opts: { contentType: string; folder?: string },
): Promise<UploadResult> {
  const { cloudName, apiKey, apiSecret, uploadFolder } = await resolveConfig();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new StorageError(
      500,
      'Хранилище изображений не настроено.',
      'storage_unconfigured',
    );
  }

  const folder = opts.folder ?? uploadFolder;
  const timestamp = Math.floor(Date.now() / 1000);

  // Only `folder` and `timestamp` are signed (Cloudinary excludes file/api_key).
  const signature = signParams({ folder, timestamp }, apiSecret);

  const form = new FormData();
  // Wrap in a Uint8Array so the Blob part type is unambiguous across TS libs.
  form.append('file', new Blob([new Uint8Array(buffer)], { type: opts.contentType }));
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);

  let res: Response;
  try {
    res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body: form },
    );
  } catch {
    throw new StorageError(502, 'Не удалось связаться с хранилищем.', 'upload_failed');
  }

  if (!res.ok) {
    let message = `Ошибка загрузки (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* non-JSON error body */
    }
    throw new StorageError(502, message, 'upload_rejected');
  }

  const body = (await res.json()) as { secure_url?: string; public_id?: string };
  if (!body.secure_url) {
    throw new StorageError(502, 'Хранилище не вернуло ссылку.', 'no_url');
  }
  return { url: body.secure_url, publicId: body.public_id ?? '' };
}

/**
 * Delete every image whose public id starts with `prefix` via the Cloudinary
 * Admin API (privacy purge — remove an invitation's uploaded photos once its
 * link expires). Photos are stored under `sayyes/<invitationId>`, so passing
 * that prefix removes all of an invitation's uploads in one call.
 *
 * Best-effort: returns the number of deleted resources, or 0 on any failure /
 * when unconfigured, so the caller can continue purging other data.
 */
export async function deleteByPrefix(prefix: string): Promise<number> {
  if (prefix === '') return 0;
  const { cloudName, apiKey, apiSecret } = await resolveConfig();
  if (!cloudName || !apiKey || !apiSecret) return 0;
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const url =
    `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload` +
    `?prefix=${encodeURIComponent(prefix)}`;
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { authorization: `Basic ${auth}` },
    });
    if (!res.ok) return 0;
    const body = (await res.json()) as { deleted?: Record<string, string> };
    return body.deleted ? Object.keys(body.deleted).length : 0;
  } catch {
    return 0;
  }
}

/**
 * Delete an image from Cloudinary by its public id (used by the privacy purge
 * when an invitation expires). Best-effort: returns `false` on any failure so
 * the caller can continue purging other data. No-op when unconfigured or the
 * public id is empty.
 */
export async function deleteImage(publicId: string): Promise<boolean> {
  if (publicId === '') return false;
  const { cloudName, apiKey, apiSecret } = await resolveConfig();
  if (!cloudName || !apiKey || !apiSecret) return false;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ public_id: publicId, timestamp }, apiSecret);

  const form = new FormData();
  form.append('public_id', publicId);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      { method: 'POST', body: form },
    );
    return res.ok;
  } catch {
    return false;
  }
}
