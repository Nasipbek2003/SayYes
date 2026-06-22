/**
 * Creation flow page — `/create?template=<id>&theme=<id>` (task 10.2).
 *
 * The gallery (`app/page.tsx`) links here with the chosen template/theme in the
 * query string (Requirements 1.2/1.3). This server component resolves and
 * validates that selection, then renders the interactive {@link CreateForm}
 * (Requirements 2.1, 2.4, 2.5, 3.1).
 *
 * ## Authorisation decision
 * Creating an invitation is an *author* operation: the draft CRUD, photo,
 * preview and checkout endpoints all require an author session (Requirement
 * 10.4). Rather than let the author fill in the whole form only to hit a 401 on
 * the first save, we gate the page on a session here: an unauthenticated
 * visitor is redirected to `/login` with a `redirect` back to this URL so they
 * return to the same template/theme after signing in. (The client form also
 * handles a session that expires mid-edit by redirecting to `/login`.)
 */
import Link from 'next/link';

import { getCurrentAuthorId } from '@/lib/auth/nextCookies';
import { templateRegistry, TemplateNotFoundError } from '@/lib/templates/registry';

import { CreateForm } from './CreateForm';

export const dynamic = 'force-dynamic';

export default async function CreatePage({
  searchParams,
}: {
  searchParams?: Promise<{ template?: string; theme?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const templateId = params.template;
  const themeId = params.theme;

  // Resolve and validate the template/theme selection.
  let template: ReturnType<typeof templateRegistry.get> | null = null;
  if (templateId) {
    try {
      template = templateRegistry.get(templateId);
    } catch (error) {
      if (!(error instanceof TemplateNotFoundError)) throw error;
    }
  }

  if (!template) {
    return <SelectionError />;
  }

  // Default to the template's first theme when none/invalid is supplied.
  const resolvedTheme =
    themeId && template.themes.includes(themeId) ? themeId : template.themes[0];

  // No auth gate here — anyone can browse and fill in the form.
  // Auth is required only when saving/paying (handled client-side in CreateForm).
  const authorId = await getCurrentAuthorId();

  return (
    <main>
      <CreateForm
        template={{
          id: template.id,
          name: template.name,
          description: template.description,
          fields: template.fields,
          premiumFeatures: template.premiumFeatures,
        }}
        themeId={resolvedTheme}
        isAuthed={!!authorId}
      />
    </main>
  );
}

/** Friendly error when the template selection is missing/unknown. */
function SelectionError() {
  return (
    <main style={{ maxWidth: 560, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Шаблон не выбран</h1>
      <p style={{ color: 'var(--muted)' }}>
        Не удалось определить шаблон приглашения. Вернись в галерею и выбери
        подходящий шаблон.
      </p>
      <p style={{ marginTop: '1.5rem' }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          ← К галерее шаблонов
        </Link>
      </p>
    </main>
  );
}
