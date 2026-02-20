import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const incoming = request.headers.get('x-telegram-bot-api-secret-token');

    if (secret && incoming !== secret) {
      return apiError(new Error('Forbidden'), 403, 'Access denied');
    }

    const body = await request.json().catch(() => ({}));

    return apiSuccess({
      channel: 'telegram',
      received: true,
      webhook_ready: Boolean(secret),
      update_id: body?.update_id ?? null,
    });
  } catch (error) {
    return apiError(error, 500, 'Telegram webhook failed');
  }
}
