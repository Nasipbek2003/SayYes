'use client';

/**
 * Прячет сайтовую шапку внутри админ-панели: у `/admin` собственный каркас с
 * тёмной темой, и «Тёплый персик» поверх него выглядел бы как чужой элемент.
 * Клиентская обёртка нужна потому, что путь запроса в серверном layout
 * недоступен.
 */
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function HideOnAdmin({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin')) return null;
  return <>{children}</>;
}
