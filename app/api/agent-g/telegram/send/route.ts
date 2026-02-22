import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normalize(value: string | null | undefined): string {
  return (value || '').trim();
}

const schema = z.object({
  chat_id: z.string().min(1),
  text: z.string().min(1).max(4000),
  parse_mode: z.enum(['Markdown', 'HTML']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const adminKey = normalize(process.env.ADMIN_KEY);
    if (!adminKey) return apiError(new Error('ADMIN_KEY not configured'), 500, 'Server not configured');

    const adminId = normalize(process.env.ADMIN_ID);

    const providedHeaderKey = normalize(request.headers.get('x-admin-key'));
    const providedQueryKey = normalize(request.nextUrl.searchParams.get('key'));
    const providedKey = providedHeaderKey || providedQueryKey;

    const providedAdminId = normalize(request.headers.get('x-admin-id') || request.nextUrl.searchParams.get('admin_id'));

    if (!providedKey) {
      return apiError(new Error('Unauthorized'), 401, 'Admin key required');
    }

    if (providedKey !== adminKey) {
      return apiError(new Error('Forbidden'), 403, 'Invalid admin key');
    }

    if (adminId && providedAdminId !== adminId) {
      return apiError(new Error('Forbidden'), 403, 'Invalid admin id');
    }

    const payload = schema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid send payload');

    const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (!token) return apiError(new Error('TELEGRAM_BOT_TOKEN missing'), 500, 'Token missing');

    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: payload.data.chat_id,
        text: payload.data.text,
        parse_mode: payload.data.parse_mode,
      }),
      cache: 'no-store',
    });

    const telegramPayload = await telegramResponse.json().catch((_error) => null);

    console.info('[Telegram Send Debug] telegram_send_status', {
      request_id: requestId,
      chat_id: payload.data.chat_id,
      telegram_send_status: telegramResponse.status,
      ok: Boolean((telegramPayload as { ok?: boolean } | null)?.ok),
    });

    if (!telegramResponse.ok || !(telegramPayload as { ok?: boolean } | null)?.ok) {
      return apiError(new Error('Telegram API error'), 502, 'Failed to send Telegram message');
    }

    return apiSuccess({
      ok: true,
      chat_id: payload.data.chat_id,
      status: telegramResponse.status,
      result: telegramPayload,
    });
  } catch (error) {
    return apiError(error, 500, 'Telegram send failed');
  }
}
