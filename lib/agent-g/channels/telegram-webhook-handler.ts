import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { storeInboundTelegramEvent } from '@/lib/agent-g/channels/inbound-events';

function normalizeSecret(value: string | null | undefined): string {
  return (value || '').trim();
}

export async function handleTelegramWebhook(request: NextRequest): Promise<NextResponse> {
  try {
    const configuredSecret = normalizeSecret(process.env.TELEGRAM_WEBHOOK_SECRET);
    if (!configuredSecret) {
      return apiError(new Error('Missing TELEGRAM_WEBHOOK_SECRET'), 500, 'Server configuration error');
    }

    const headerSecret = normalizeSecret(request.headers.get('x-telegram-bot-api-secret-token'));
    const headerProvided = headerSecret.length > 0;
    const headerValid = headerProvided && headerSecret === configuredSecret;

    if (!headerValid) {
      console.warn('[telegram/webhook] unauthorized request', {
        validation: 'failed',
        source: headerProvided ? 'header' : 'none',
      });
      return apiError(new Error('Unauthorized'), 401, 'Invalid webhook secret');
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
      validated_by: 'header',
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
