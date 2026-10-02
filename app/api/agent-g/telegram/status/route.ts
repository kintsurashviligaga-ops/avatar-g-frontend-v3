import { NextResponse } from 'next/server';
import { adminKeyHeaderMatches } from '@/lib/security/opsAccess';
import { isAdmin } from '@/lib/auth/adminGuard';

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
  // ⚠️ FAIL CLOSED, HEADER ONLY. With ADMIN_KEY unset this used to skip the check entirely and show anyone the bot's
  // webhook URL and last delivery error; it also took the key as `?key=` (a URL lands in logs). Now: the `x-admin-key`
  // header (constant-time) or a signed-in admin — and an unset ADMIN_KEY matches nothing.
  if (!adminKeyHeaderMatches(req) && !(await isAdmin().catch(() => false))) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
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
