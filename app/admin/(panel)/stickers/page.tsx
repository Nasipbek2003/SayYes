/**
 * Раздел «Стикеры»: каталог, который видит автор в форме создания.
 *
 * Файлы лежат в Cloudinary, в базе — только ссылки, поэтому набор меняется
 * отсюда без деплоя.
 */
import { requireAdmin } from '@/lib/admin/guard';
import { getCloudinaryConfig } from '@/lib/settings/appConfig';
import { listAllStickers } from '@/lib/storage/stickers';

import styles from '../../admin.module.css';
import { num } from '../../ui';
import { StickersManager } from './StickersManager';

export const dynamic = 'force-dynamic';

export default async function AdminStickersPage() {
  await requireAdmin();

  const [categories, config] = await Promise.all([
    listAllStickers(),
    getCloudinaryConfig(),
  ]);

  const total = categories.reduce((sum, group) => sum + group.items.length, 0);
  const hidden = categories.reduce(
    (sum, group) => sum + group.items.filter((item) => item.hidden).length,
    0,
  );
  const weight = categories.reduce(
    (sum, group) => sum + group.items.reduce((s, item) => s + (item.bytes ?? 0), 0),
    0,
  );

  const configured = Boolean(config.cloudName && config.apiKey && config.apiSecret);

  return (
    <>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Стикеры</h1>
        <p className={styles.pageSubtitle}>
          {num(total)} в каталоге ({num(hidden)} скрыто) · исходники{' '}
          {Math.round(weight / 1024).toLocaleString('ru-RU')} КБ ·{' '}
          {configured ? `облако ${config.cloudName}` : 'Cloudinary не настроен'}
        </p>
      </div>

      <p className={styles.pageSubtitle} style={{ marginBottom: 16 }}>
        Автору отдаются сжатые версии: формат подбирается под браузер, ширина — под
        место в макете. Плитки каталога дополнительно уменьшены, а для видео берётся
        первый кадр вместо клипа.
      </p>

      <StickersManager
        configured={configured}
        categories={categories.map((group) => ({
          id: group.id,
          label: group.label,
          items: group.items.map((item) => ({
            id: item.id,
            thumbUrl: item.thumbUrl,
            url: item.url,
            kind: item.kind,
            hidden: item.hidden,
            bytes: item.bytes,
          })),
        }))}
      />
    </>
  );
}
