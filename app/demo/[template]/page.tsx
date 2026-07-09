/**
 * GET /demo/[template] — interactive "try as guest" demo of a template.
 *
 * A visitor can play through the full scenario before creating or paying — a
 * strong conversion lever from the gallery. The page resolves the template
 * schema, generates local demo data ({@link buildDemoData}) and hands both to
 * the client {@link DemoRuntime}, which runs the real scenario engine with no
 * network calls. Unknown templates return a 404. The page is `noindex` (it is a
 * marketing/demo surface, not real content).
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { templateRegistry, TemplateNotFoundError } from '@/lib/templates/registry';
import { buildCreateHref } from '@/lib/gallery/gallery';
import { buildDemoData } from '@/lib/demo/sampleData';

import { DemoRuntime } from './DemoRuntime';

export const metadata: Metadata = {
  title: 'Демо шаблона — SayYes',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ template: string }>;
  searchParams: Promise<{ theme?: string }>;
}

export default async function DemoPage({ params, searchParams }: PageProps) {
  const { template } = await params;
  const { theme } = await searchParams;

  let schema;
  try {
    schema = templateRegistry.get(template);
  } catch (error) {
    if (error instanceof TemplateNotFoundError) notFound();
    throw error;
  }

  const themeId =
    theme && schema.themes.includes(theme) ? theme : schema.themes[0] ?? 'neutral';
  const data = buildDemoData(schema);
  const createHref = buildCreateHref(schema.id, themeId);

  return (
    <div className="invitation-page">
      <DemoRuntime
        schema={schema}
        themeId={themeId}
        data={data}
        createHref={createHref}
      />
    </div>
  );
}
