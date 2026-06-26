/**
 * Resolve the request origin from the incoming request headers.
 *
 * In local dev (`next dev -H 0.0.0.0`) `request.url` always shows
 * `localhost` even when the request came from another device (e.g. a phone
 * on the same Wi-Fi). The `Host` header reflects the actual address the
 * client used, so we prefer it — that way redirect responses land on the
 * right host instead of bouncing the user to `localhost`.
 *
 * In production the server sits behind a reverse proxy that sets
 * `X-Forwarded-Proto`, so we honour that for the scheme.
 */
export function getRequestOrigin(request: Request): string {
  const host = request.headers.get('host');
  if (host) {
    const proto =
      request.headers.get('x-forwarded-proto') ??
      (/^(localhost|127\.|192\.|10\.|172\.(1[6-9]|2\d|3[01]))/.test(host)
        ? 'http'
        : 'https');
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}
