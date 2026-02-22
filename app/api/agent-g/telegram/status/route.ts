import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type TelegramWebhookInfoResponse = {
  ok?: boolean;
  description?: string;
  result?: {
    url?: string;
    pending_update_count?: number;
    last_error_message?: string;
  };
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

export async function GET(req: Request) {
  const expectedAdminKey = normalize(process.env.ADMIN_KEY);
  if (expectedAdminKey) {
    const url = new URL(req.url);
    const providedHeader = normalize(req.headers.get('x-admin-key'));
    const providedQuery = normalize(url.searchParams.get('key'));
    const provided = providedHeader || providedQuery;

    if (!provided) {
      return json({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (provided !== expectedAdminKey) {
      return json({ ok: false, error: 'Forbidden' }, 403);
    }
  }

  const token = normalize(process.env.TELEGRAM_BOT_TOKEN);
  const secret = normalize(process.env.TELEGRAM_WEBHOOK_SECRET);

  if (!token || !secret) {
    return json({
      ok: true,
      configured: false,
      webhookUrl: null,
      lastError: !token ? 'TELEGRAM_BOT_TOKEN missing' : 'TELEGRAM_WEBHOOK_SECRET missing',
      telegram_ok: false,
      http_ok: false,
      pending_update_count: null,
    });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      method: 'GET',
      cache: 'no-store',
    });

    const payload = (await response.json().catch((_error) => null)) as TelegramWebhookInfoResponse | null;
    const result = payload?.result;

    return json({
      ok: true,
      configured: Boolean(response.ok && payload?.ok && result?.url),
      webhookUrl: result?.url || null,
      lastError: result?.last_error_message || null,
      telegram_ok: Boolean(payload?.ok),
      http_ok: response.ok,
      pending_update_count: result?.pending_update_count ?? null,
    });
  } catch (error) {
    return json({
      ok: true,
      configured: false,
      webhookUrl: null,
      lastError: error instanceof Error ? error.message : 'Failed to fetch webhook status',
      telegram_ok: false,
      http_ok: false,
      pending_update_count: null,
    });
  }
}
