import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type TelegramWebhookInfoResponse = {
  ok?: boolean;
  description?: string;
  result?: {
    url?: string;
    has_custom_certificate?: boolean;
    pending_update_count?: number;
    max_connections?: number;
    ip_address?: string;
    last_error_date?: number;
    last_error_message?: string;
    last_synchronization_error_date?: number;
    allowed_updates?: string[];
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

export async function GET() {
  try {
    const token = normalize(process.env.TELEGRAM_BOT_TOKEN);
    if (!token) {
      return json({ status: 'error', error: 'TELEGRAM_BOT_TOKEN missing in env' }, 500);
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      method: 'GET',
      cache: 'no-store',
    });

    const payload = (await response.json().catch((_error) => null)) as TelegramWebhookInfoResponse | null;
    if (!response.ok || !payload?.ok) {
      return json(
        {
          status: 'error',
          error: 'Telegram getWebhookInfo request failed',
          code: 'TELEGRAM_API_ERROR',
          http_status: response.status,
          telegram_ok: Boolean(payload?.ok),
        },
        502
      );
    }

    const result = payload?.result || {};
    const webhookUrl = result.url || null;
    const lastError = result.last_error_message || null;

    return json({
      status: 'success',
      data: {
        configured: Boolean(payload?.ok),
        webhookUrl,
        lastError,
        telegram_ok: Boolean(payload?.ok),
        http_ok: response.ok,
        webhook: {
          url: webhookUrl,
          pending_update_count: result.pending_update_count ?? 0,
          has_custom_certificate: result.has_custom_certificate ?? null,
          max_connections: result.max_connections ?? null,
          ip_address: result.ip_address || null,
          allowed_updates: result.allowed_updates || [],
        },
      },
    });
  } catch (_error) {
    return json({ status: 'error', error: 'Failed to fetch Telegram webhook status' }, 500);
  }
}
