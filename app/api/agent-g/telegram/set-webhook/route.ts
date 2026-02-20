import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';

/**
 * Request contract:
 * - Methods: GET, POST
 * - Required query params: `secret` (or provide secret via header/body)
 * - Required headers: `x-telegram-setup-secret` (preferred for one-deploy compatibility)
 *   Legacy header accepted for one deploy: `x-admin-setup-key`
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normalizeSecret(value: string | null | undefined): string {
  return (value || '').trim();
}

async function handleSetWebhook(request: NextRequest, secretFromBody?: string | null) {
  try {
    const querySecret = normalizeSecret(request.nextUrl.searchParams.get('secret'));
    const preferredHeaderSecret = normalizeSecret(request.headers.get('x-telegram-setup-secret'));
    const legacyHeaderSecret = normalizeSecret(request.headers.get('x-admin-setup-key'));
    const bodySecret = normalizeSecret(secretFromBody);

    const providedSecret =
      (preferredHeaderSecret || null) ||
      (legacyHeaderSecret || null) ||
      (querySecret || null) ||
      (bodySecret || null) ||
      null;

    const setupSecret = normalizeSecret(process.env.TELEGRAM_SETUP_SECRET);
    if (!setupSecret) {
      return apiError(new Error('Missing TELEGRAM_SETUP_SECRET'), 500, 'Server configuration error');
    }

    const matched = Boolean(providedSecret) && providedSecret === setupSecret;
    const secretSource = preferredHeaderSecret
      ? 'x-telegram-setup-secret'
      : legacyHeaderSecret
        ? 'x-admin-setup-key'
        : querySecret
          ? 'query:secret'
          : bodySecret
            ? 'body:secret'
            : 'none';

    console.info('[telegram/set-webhook] setup auth check', {
      source: secretSource,
      matched,
    });

    if (!matched) {
      return apiError(new Error('Unauthorized'), 401, 'Invalid setup secret');
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return apiError(new Error('Missing TELEGRAM_BOT_TOKEN'), 500, 'Server configuration error');
    }

    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return apiError(new Error('Missing TELEGRAM_WEBHOOK_SECRET'), 500, 'Server configuration error');
    }

    const webhookUrl = 'https://www.myavatar.ge/api/agent-g/telegram/webhook';
    const body: Record<string, unknown> = {
      url: webhookUrl,
      secret_token: webhookSecret,
    };

    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => null);

    return apiSuccess({
      ok: response.ok,
      webhook_url: webhookUrl,
      used_secret_header: true,
      telegram: payload,
    });
  } catch (error) {
    return apiError(error, 500, 'Failed to set Telegram webhook');
  }
}

export async function GET(request: NextRequest) {
  return handleSetWebhook(request);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as { secret?: string }));
  return handleSetWebhook(request, typeof body.secret === 'string' ? body.secret : null);
}
