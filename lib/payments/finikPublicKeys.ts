/**
 * Публичные ключи Finik для проверки подписи вебхуков.
 *
 * Опубликованы в документации (Справочник → «Публичные ключи»), секретом не
 * являются, поэтому лежат в коде: так они гарантированно попадают в деплой и на
 * хостинге ничего дополнительно настраивать не нужно. Переопределить можно
 * через `FINIK_WEBHOOK_PUBLIC_KEY` / `FINIK_WEBHOOK_PUBLIC_KEY_PATH`.
 *
 * Источник: https://www.finik.kg/documentation/web-sdk/reference/
 */

/** Прод: api.acquiring.averspay.kg */
export const FINIK_PROD_WEBHOOK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuF/PUmhMPPidcMxhZBPb
BSGJoSphmCI+h6ru8fG8guAlcPMVlhs+ThTjw2LHABvciwtpj51ebJ4EqhlySPyT
hqSfXI6Jp5dPGJNDguxfocohaz98wvT+WAF86DEglZ8dEsfoumojFUy5sTOBdHEu
g94B4BbrJvjmBa1YIx9Azse4HFlWhzZoYPgyQpArhokeHOHIN2QFzJqeriANO+wV
aUMta2AhRVZHbfyJ36XPhGO6A5FYQWgjzkI65cxZs5LaNFmRx6pjnhjIeVKKgF99
4OoYCzhuR9QmWkPl7tL4Kd68qa/xHLz0Psnuhm0CStWOYUu3J7ZpzRK8GoEXRcr8
tQIDAQAB
-----END PUBLIC KEY-----`;

/** Бета: beta.api.acquiring.averspay.kg */
export const FINIK_BETA_WEBHOOK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwlrlKz/8gLWd1ARWGA/8
o3a3Qy8G+hPifyqiPosiTY6nCHovANMIJXk6DH4qAqqZeLu8pLGxudkPbv8dSyG7
F9PZEAryMPzjoB/9P/F6g0W46K/FHDtwTM3YIVvstbEbL19m8yddv/xCT9JPPJTb
LsSTVZq5zCqvKzpupwlGS3Q3oPyLAYe+ZUn4Bx2J1WQrBu3b08fNaR3E8pAkCK27
JqFnP0eFfa817VCtyVKcFHb5ij/D0eUP519Qr/pgn+gsoG63W4pPHN/pKwQUUiAy
uLSHqL5S2yu1dffyMcMVi9E/Q2HCTcez5OvOllgOtkNYHSv9pnrMRuws3u87+hNT
ZwIDAQAB
-----END PUBLIC KEY-----`;

/** Ключ, соответствующий среде (бета определяется по хосту `beta.`). */
export function finikWebhookPublicKeyFor(baseUrl: string): string {
  let host = '';
  try {
    host = new URL(baseUrl).host;
  } catch {
    host = baseUrl;
  }
  return host.startsWith('beta.')
    ? FINIK_BETA_WEBHOOK_PUBLIC_KEY
    : FINIK_PROD_WEBHOOK_PUBLIC_KEY;
}
