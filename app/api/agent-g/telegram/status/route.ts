import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const providedSecret = request.nextUrl.searchParams.get('secret');
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (webhookSecret && providedSecret && providedSecret !== webhookSecret) {
      return apiError(new Error('Unauthorized'), 401, 'Invalid status secret');
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return apiSuccess({
        ok: true,
        route: 'agent-g-telegram-status',
        configured: false,
        telegram_ok: false,
        http_ok: false,
        webhook: null,
        last_error: {
          date: null,
          message: 'Missing TELEGRAM_BOT_TOKEN',
          sync_date: null,
        },
      });
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      method: 'GET',
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => null) as {
      ok?: boolean;
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
    } | null;

    const result = payload?.result || {};

    return apiSuccess({
      ok: true,
      route: 'agent-g-telegram-status',
      configured: true,
      telegram_ok: Boolean(payload?.ok),
      http_ok: response.ok,
      webhook: {
        url: result.url || null,
        has_custom_certificate: result.has_custom_certificate ?? null,
        pending_update_count: result.pending_update_count ?? 0,
        max_connections: result.max_connections ?? null,
        ip_address: result.ip_address || null,
        allowed_updates: result.allowed_updates || [],
      },
      last_error: {
        date: result.last_error_date ?? null,
        message: result.last_error_message || null,
        sync_date: result.last_synchronization_error_date ?? null,
      },
      raw: payload,
    });
  } catch (error) {
    return apiError(error, 500, 'Failed to fetch Telegram webhook status');
  }
}
