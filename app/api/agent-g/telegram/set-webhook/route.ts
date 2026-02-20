import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { resolveSiteUrl } from '@/lib/url/site-url';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handleSetWebhook(request: NextRequest, secretFromBody?: string | null) {
  try {
    const providedSecret = secretFromBody || request.nextUrl.searchParams.get('secret');
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return apiError(new Error('Missing TELEGRAM_WEBHOOK_SECRET'), 500, 'Server configuration error');
    }

    if (providedSecret !== webhookSecret) {
      return apiError(new Error('Unauthorized'), 401, 'Invalid setup secret');
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return apiError(new Error('Missing TELEGRAM_BOT_TOKEN'), 500, 'Server configuration error');
    }

    const baseUrl = resolveSiteUrl(request);
    const webhookUrl = `${baseUrl}/api/agent-g/webhook/telegram?secret=${encodeURIComponent(webhookSecret)}`;
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
