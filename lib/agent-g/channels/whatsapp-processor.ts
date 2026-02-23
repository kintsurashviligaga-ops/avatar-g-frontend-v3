import { createServiceRoleClient } from '@/lib/supabase/server';
import { handleInbound } from '@/lib/agent-g/channels/handleInbound';

function normalize(value: string | null | undefined): string {
  return String(value || '').trim();
}

export function parseWhatsAppMessageSummary(payload: Record<string, unknown>): Array<{ from: string; text: string; id: string }> {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const messages: Array<{ from: string; text: string; id: string }> = [];

  for (const entry of entries) {
    const changes = Array.isArray((entry as Record<string, unknown>).changes)
      ? ((entry as Record<string, unknown>).changes as Array<Record<string, unknown>>)
      : [];

    for (const change of changes) {
      const value = ((change || {}) as Record<string, unknown>).value as Record<string, unknown> | undefined;
      const inbound = Array.isArray(value?.messages)
        ? (value?.messages as Array<Record<string, unknown>>)
        : [];

      for (const message of inbound) {
        const from = normalize(String(message.from || ''));
        const id = normalize(String(message.id || ''));
        const textNode = (message.text || {}) as Record<string, unknown>;
        const text = normalize(String(textNode.body || ''));

        if (!from || !text) {
          continue;
        }

        messages.push({ from, text, id });
      }
    }
  }

  return messages;
}

export async function processWhatsAppPayload(
  payload: Record<string, unknown>,
  requestId: string,
  origin: string
): Promise<void> {
  const hasSupabaseServiceRole = Boolean(normalize(process.env.SUPABASE_SERVICE_ROLE_KEY));
  const hasSupabaseUrl = Boolean(normalize(process.env.SUPABASE_URL) || normalize(process.env.NEXT_PUBLIC_SUPABASE_URL));
  if (!hasSupabaseServiceRole || !hasSupabaseUrl) {
    console.info('[WhatsApp.Webhook]', {
      event: 'processor_skipped_unconfigured',
      request_id: requestId,
      has_supabase_service_role: hasSupabaseServiceRole,
      has_supabase_url: hasSupabaseUrl,
    });
    return;
  }

  const supabase = createServiceRoleClient();
  const messages = parseWhatsAppMessageSummary(payload);

  await supabase.from('agent_g_channel_events').insert({
    type: 'whatsapp_event',
    payload: {
      request_id: requestId,
      object: normalize(String(payload.object || '')) || null,
      message_count: messages.length,
      message_ids: messages.map((message) => message.id).filter(Boolean),
      received_at: new Date().toISOString(),
    },
  });

  for (const message of messages) {
    const handled = await handleInbound({
      channel: 'whatsapp',
      externalId: message.from,
      text: message.text,
      origin,
    });

    await supabase.from('agent_g_channel_events').insert({
      user_id: handled.userId || null,
      type: 'whatsapp_event',
      payload: {
        request_id: requestId,
        direction: 'simulated_outgoing',
        to: message.from,
        in_reply_to: message.id || null,
        reply_count: handled.replyMessages.length,
        task_id: handled.taskId || null,
      },
    });
  }
}
