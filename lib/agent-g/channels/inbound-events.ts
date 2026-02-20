import { createServiceRoleClient } from '@/lib/supabase/server';

type InboundEvent = {
  channel: 'telegram';
  type: 'telegram_update';
  chatId: string | null;
  userId: string | null;
  username: string | null;
  messageId: number | null;
  date: number | null;
  text: string | null;
  payload: Record<string, unknown>;
};

const fallbackEvents: InboundEvent[] = [];

export async function storeInboundTelegramEvent(event: InboundEvent): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from('agent_g_channel_events').insert({
      user_id: null,
      type: event.type,
      payload: {
        channel: event.channel,
        chat_id: event.chatId,
        user_id: event.userId,
        username: event.username,
        message_id: event.messageId,
        date: event.date,
        text: event.text,
        update: event.payload,
      },
    });
    return;
  } catch {
    fallbackEvents.unshift(event);
    if (fallbackEvents.length > 100) {
      fallbackEvents.splice(100);
    }
  }
}

export function getFallbackTelegramEvents(limit = 20): InboundEvent[] {
  return fallbackEvents.slice(0, Math.max(1, limit));
}
