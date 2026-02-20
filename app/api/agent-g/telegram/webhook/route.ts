import { NextRequest, NextResponse } from 'next/server';
import { storeInboundTelegramEvent } from '@/lib/agent-g/channels/inbound-events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type TelegramMessage = {
  message_id?: number;
  date?: number;
  text?: string;
  chat?: { id?: number | string };
  from?: { id?: number | string; username?: string };
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
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

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = normalize(process.env.TELEGRAM_WEBHOOK_SECRET);
    if (!webhookSecret) {
      return json({ status: 'error', error: 'TELEGRAM_WEBHOOK_SECRET missing in env' }, 500);
    }

    const headerSecret = normalize(request.headers.get('x-telegram-bot-api-secret-token'));
    if (!headerSecret || headerSecret !== webhookSecret) {
      return json({ status: 'error', error: 'Invalid webhook secret', code: 'UNAUTHORIZED' }, 401);
    }

    const update = (await request.json().catch((_error) => null)) as TelegramUpdate | null;
    if (!update || typeof update !== 'object') {
      return json({ status: 'error', error: 'Invalid Telegram payload', code: 'BAD_REQUEST' }, 400);
    }

    const message = update.message || update.edited_message || {};
    const chat = message.chat || {};
    const from = message.from || {};

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

    return json({
      status: 'success',
      data: {
        ok: true,
        received: true,
        update_id: update.update_id ?? null,
      },
    });
  } catch (_error) {
    return json({ status: 'error', error: 'Telegram webhook failed' }, 500);
  }
}