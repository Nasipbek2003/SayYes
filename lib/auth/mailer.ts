/**
 * Mailer abstraction (task 4.1).
 *
 * Email delivery is hidden behind a small `Mailer` interface so the auth layer
 * never depends on a concrete provider. For MVP / local development we ship a
 * `ConsoleMailer` that logs to stdout (no external dependency, easy to test).
 * When `RESEND_API_KEY` is set the `ResendMailer` is used instead — it
 * delivers real emails via the Resend API (https://resend.com).
 */
import { env } from '@/lib/env';

export interface MagicLinkEmail {
  to: string;
  /** Fully-built sign-in URL (contains the one-time token). */
  url: string;
  /** Token lifetime, for the email copy ("expires in N minutes"). */
  expiresInMinutes: number;
}

export interface Mailer {
  sendMagicLink(email: MagicLinkEmail): Promise<void>;
}

/**
 * Development/MVP mailer that writes to the console instead of sending email.
 * The sign-in URL is printed to the server console so you can click it manually.
 */
export class ConsoleMailer implements Mailer {
  async sendMagicLink(email: MagicLinkEmail): Promise<void> {
    const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
    if (isProd) {
      console.info(`[mailer] magic-link email queued for ${email.to}`);
      return;
    }
    console.info(
      `\n📧 [mailer] magic-link for ${email.to} (expires in ${email.expiresInMinutes}m):\n  ${email.url}\n`,
    );
  }
}

/**
 * Production mailer backed by Resend (https://resend.com).
 * Requires `RESEND_API_KEY` and optionally `MAIL_FROM` in the environment.
 */
export class ResendMailer implements Mailer {
  private readonly apiKey: string;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.apiKey = apiKey;
    this.from = from;
  }

  async sendMagicLink({ to, url, expiresInMinutes }: MagicLinkEmail): Promise<void> {
    const body = {
      from: this.from,
      to: [to],
      subject: 'Ссылка для входа в SayYes',
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f0a1e;color:#f6f1ff;border-radius:16px">
          <div style="font-size:32px;margin-bottom:8px">💌</div>
          <h1 style="font-size:22px;font-weight:800;margin:0 0 8px">Войти в SayYes</h1>
          <p style="color:#b8aed1;margin:0 0 24px;line-height:1.5">
            Нажми кнопку ниже, чтобы войти. Ссылка действует ${expiresInMinutes} минут.
          </p>
          <a href="${url}"
             style="display:inline-block;background:#ff5d8f;color:#fff;font-weight:700;font-size:15px;padding:13px 28px;border-radius:999px;text-decoration:none">
            Войти в аккаунт
          </a>
          <p style="margin:24px 0 0;font-size:13px;color:#b8aed1">
            Если ты не запрашивал(а) вход — просто проигнорируй это письмо.
          </p>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:24px 0"/>
          <p style="font-size:12px;color:#b8aed1;margin:0">
            Или скопируй ссылку вручную:<br/>
            <span style="word-break:break-all;color:#ff5d8f">${url}</span>
          </p>
        </div>
      `,
    };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Resend error ${res.status}: ${text}`);
    }
  }
}

/**
 * Test mailer that records sent emails in memory instead of delivering them.
 */
export class InMemoryMailer implements Mailer {
  readonly sent: MagicLinkEmail[] = [];

  async sendMagicLink(email: MagicLinkEmail): Promise<void> {
    this.sent.push(email);
  }
}

/**
 * Default mailer: ResendMailer when RESEND_API_KEY is configured,
 * otherwise ConsoleMailer (prints the link to the server terminal).
 *
 * Instantiated lazily per-call so a key added after server start is picked up
 * without a restart (important during development).
 */
function createMailer(): Mailer {
  const apiKey = process.env.RESEND_API_KEY ?? '';
  if (apiKey) {
    const from = process.env.MAIL_FROM ?? 'SayYes <onboarding@resend.dev>';
    return new ResendMailer(apiKey, from);
  }
  return new ConsoleMailer();
}

/** Lazy proxy — reads env vars on every send so new keys are picked up. */
export const defaultMailer: Mailer = {
  sendMagicLink: (email) => createMailer().sendMagicLink(email),
};
