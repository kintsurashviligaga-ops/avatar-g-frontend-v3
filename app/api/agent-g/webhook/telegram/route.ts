import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { storeInboundTelegramEvent } from '@/lib/agent-g/channels/inbound-events';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) {
      return apiError(new Error('Missing TELEGRAM_WEBHOOK_SECRET'), 500, 'Server configuration error');
    }

    const querySecret = request.nextUrl.searchParams.get('secret');
    if (querySecret !== secret) {
      return apiError(new Error('Unauthorized'), 401, 'Invalid webhook secret');
    }

    const headerSecret = request.headers.get('x-telegram-bot-api-secret-token');
    if (headerSecret !== null && headerSecret !== secret) {
      return apiError(new Error('Unauthorized'), 401, 'Invalid webhook header secret');
    }

    const update = await request.json().catch(() => ({} as Record<string, unknown>));
    const maybeMessage = (update as { message?: Record<string, unknown>; edited_message?: Record<string, unknown> });
    const message = maybeMessage.message || maybeMessage.edited_message || {};
    const chat = (message.chat as Record<string, unknown> | undefined) || {};
    const from = (message.from as Record<string, unknown> | undefined) || {};

    const chatId = chat.id ? String(chat.id) : null;
    const userId = from.id ? String(from.id) : null;
    const username = typeof from.username === 'string' ? from.username : null;
    const text = typeof message.text === 'string' ? message.text : null;
    const messageId = typeof message.message_id === 'number' ? message.message_id : null;
    const date = typeof message.date === 'number' ? message.date : null;

    await storeInboundTelegramEvent({
      channel: 'telegram',
      type: 'telegram_update',
      chatId,
      userId,
      username,
      text,
      messageId,
      date,
      payload: update,
    });

    return apiSuccess({
      ok: true,
      received: true,
      chatId,
      userId,
      username,
      messageId,
      date,
      text,
      update_id: (update as { update_id?: number }).update_id ?? null,
    });
  } catch (error) {
    return apiError(error, 500, 'Telegram webhook failed');
  }
}
