/**
 * Auth layer barrel (task 4.1).
 *
 * Runtime-agnostic building blocks for author authentication:
 *  - `session`    — signed-JWT session issue/verify + cookie options
 *  - `magicLink`  — email magic-link token issue/consume (single-use, short TTL)
 *  - `mailer`     — Mailer interface + console/in-memory implementations
 *  - `guards`     — getCurrentAuthor(Id) / requireAuthor (401) / assertOwnership (403)
 *
 * Next.js-bound helpers that read cookies from `next/headers` live in
 * `./nextCookies` and are imported directly by Route Handlers.
 */
export * from './session';
export * from './magicLink';
export * from './mailer';
export * from './guards';
