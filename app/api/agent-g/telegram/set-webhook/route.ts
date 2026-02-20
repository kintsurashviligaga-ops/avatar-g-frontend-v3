import { NextRequest, NextResponse } from 'next/server';

/**
 * Setup checklist (required env):
 * - TELEGRAM_BOT_TOKEN: used by /api/agent-g/telegram/set-webhook and /api/agent-g/telegram/status
 * - TELEGRAM_SETUP_SECRET: used only by /api/agent-g/telegram/set-webhook auth
 * - TELEGRAM_WEBHOOK_SECRET: sent to Telegram as `secret_token`, validated by /api/agent-g/telegram/webhook
 * - SITE_URL: base domain for webhook URL generation
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type TelegramSetWebhookResponse = {
  ok?: boolean;
  description?: string;
  result?: boolean;
};

function normalize(value: string | null | undefined): string {
  return (value || '').trim();
}

function json(payload: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

function resolveSiteUrl(): string | null {
  const raw = normalize(process.env.SITE_URL);
  if (!raw) return null;

  try {
    const parsed = new URL(raw.replace(/\/$/, ''));
    if (parsed.hostname === 'myavatar.ge') {
      parsed.hostname = 'www.myavatar.ge';
    }
    return parsed.toString().replace(/\/$/, '');
  } catch (_error) {
    return null;
  }
}

async function handleSetWebhook(request: NextRequest, bodySecret?: string): Promise<NextResponse> {
  const setupSecret = normalize(process.env.TELEGRAM_SETUP_SECRET);
  if (!setupSecret) {
    return json({ status: 'error', error: 'TELEGRAM_SETUP_SECRET missing in env' }, 500);
  }

  const fromHeader = normalize(request.headers.get('x-setup-secret'));
  const fromQuery = normalize(request.nextUrl.searchParams.get('secret'));
  const fromBody = normalize(bodySecret);

  const providedSecret = fromHeader || fromQuery || fromBody;

  if (!providedSecret) {
    return json(
      {
        status: 'error',
        error: 'Setup secret required',
        how: 'Use ?secret= or header x-setup-secret',
      },
      401
    );
  }

  const matched = providedSecret === setupSecret;

  if (!matched) {
    return json({ status: 'error', error: 'Invalid setup secret', code: 'UNAUTHORIZED' }, 401);
  }

  const token = normalize(process.env.TELEGRAM_BOT_TOKEN);
  if (!token) {
    return json({ status: 'error', error: 'TELEGRAM_BOT_TOKEN missing in env' }, 500);
  }

  const webhookSecret = normalize(process.env.TELEGRAM_WEBHOOK_SECRET);
  if (!webhookSecret) {
    return json({ status: 'error', error: 'TELEGRAM_WEBHOOK_SECRET missing in env' }, 500);
  }

  const siteUrl = resolveSiteUrl();
  if (!siteUrl) {
    return json({ status: 'error', error: 'SITE_URL missing in env' }, 500);
  }

  const webhookUrl = `${siteUrl}/api/agent-g/telegram/webhook`;

  try {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret,
      }),
      cache: 'no-store',
    });

    const telegramPayload = (await telegramResponse.json().catch((_error) => null)) as TelegramSetWebhookResponse | null;
    if (!telegramResponse.ok || !telegramPayload?.ok) {
      return json(
        {
          status: 'error',
          error: 'Failed to set Telegram webhook',
          code: 'TELEGRAM_API_ERROR',
          http_status: telegramResponse.status,
        },
        502
      );
    }

    return json({
      status: 'success',
      data: {
        webhook_url: webhookUrl,
        configured: true,
      },
    });
  } catch (_error) {
    return json({ status: 'error', error: 'Failed to set Telegram webhook' }, 502);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleSetWebhook(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch((_error) => ({} as { secret?: string }));
  const bodySecret = typeof body.secret === 'string' ? body.secret : '';
  return handleSetWebhook(request, bodySecret);
}
