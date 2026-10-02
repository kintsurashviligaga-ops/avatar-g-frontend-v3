import { handleInbound } from '@/lib/agent-g/channels/handleInbound';
import { markWhatsAppRead, sendWhatsAppText, whatsappConfig } from '@/lib/agent-g/channels/whatsapp-client';
import { maskNumber } from '@/lib/agent-g/channels/whatsapp-text';

function normalize(value: string | null | undefined): string {
  return String(value || '').trim();
}

export interface WhatsAppInbound {
  from: string;
  /** The text, a tapped button's title, or '' for media. */
  text: string;
  id: string;
  kind: 'text' | 'media';
  profileName?: string;
  /** Unix seconds, as Meta sends it. */
  timestamp?: number;
}

/** Message types with no text Agent G reads yet — answered with "send text", never ignored silently. */
const MEDIA_TYPES = new Set(['image', 'audio', 'voice', 'video', 'document', 'sticker', 'location', 'contacts']);

/**
 * The user messages in a Cloud API webhook payload. Delivery/read STATUS callbacks (`value.statuses`) carry no
 * messages and yield nothing; reactions, unsupported and system messages are skipped.
 */
export function parseWhatsAppMessageSummary(payload: Record<string, unknown>): WhatsAppInbound[] {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const messages: WhatsAppInbound[] = [];

  for (const entry of entries) {
    const changes = Array.isArray((entry as Record<string, unknown>).changes)
      ? ((entry as Record<string, unknown>).changes as Array<Record<string, unknown>>)
      : [];

    for (const change of changes) {
      const value = ((change || {}) as Record<string, unknown>).value as Record<string, unknown> | undefined;
      const inbound = Array.isArray(value?.messages)
        ? (value?.messages as Array<Record<string, unknown>>)
        : [];
      const contacts = Array.isArray(value?.contacts) ? (value?.contacts as Array<Record<string, unknown>>) : [];

      for (const message of inbound) {
        const from = normalize(String(message.from || ''));
        const id = normalize(String(message.id || ''));
        const type = normalize(String(message.type || 'text'));
        if (!from) continue;

        let text = '';
        if (type === 'text') text = normalize(String(((message.text || {}) as Record<string, unknown>).body || ''));
        else if (type === 'button') text = normalize(String(((message.button || {}) as Record<string, unknown>).text || ''));
        else if (type === 'interactive') {
          const it = (message.interactive || {}) as Record<string, Record<string, unknown> | undefined>;
          text = normalize(String(it.button_reply?.title || it.list_reply?.title || ''));
        }

        const kind: WhatsAppInbound['kind'] = text ? 'text' : MEDIA_TYPES.has(type) ? 'media' : 'text';
        if (kind === 'text' && !text) continue; // reaction, unsupported, system, an empty body

        const contact = contacts.find((c) => normalize(String(c.wa_id || '')) === from);
        const profileName = normalize(String(((contact?.profile || {}) as Record<string, unknown>).name || '')) || undefined;
        const ts = Number(message.timestamp);

        messages.push({ from, text, id, kind, profileName, timestamp: Number.isFinite(ts) ? ts : undefined });
      }
    }
  }

  return messages;
}

/** A message older than this is not answered (Meta redelivers after an outage; the free-form window is 24 h). */
const STALE_AFTER_S = 23 * 3600;

/**
 * Answer every user message in one webhook payload: read receipt + typing, Agent G's decision (handleInbound), then
 * the reply through the Cloud API. Never throws for one bad message — the next one is still answered.
 */
export async function processWhatsAppPayload(
  payload: Record<string, unknown>,
  requestId: string,
  origin: string
): Promise<void> {
  const hasSupabaseServiceRole = Boolean(normalize(process.env.SUPABASE_SERVICE_ROLE_KEY));
  const hasSupabaseUrl = Boolean(normalize(process.env.SUPABASE_URL) || normalize(process.env.NEXT_PUBLIC_SUPABASE_URL));
  const cfg = whatsappConfig();
  if (!hasSupabaseServiceRole || !hasSupabaseUrl || !cfg) {
    console.info('[WhatsApp.Webhook]', {
      event: 'processor_skipped_unconfigured',
      request_id: requestId,
      has_supabase_service_role: hasSupabaseServiceRole,
      has_supabase_url: hasSupabaseUrl,
      has_send_credentials: Boolean(cfg),
    });
    return;
  }

  const nowS = Date.now() / 1000;
  for (const message of parseWhatsAppMessageSummary(payload)) {
    if (message.timestamp && nowS - message.timestamp > STALE_AFTER_S) continue;
    try {
      const receipt = markWhatsAppRead(message.id, cfg);
      const handled = await handleInbound({
        channel: 'whatsapp',
        externalId: message.from,
        text: message.text,
        kind: message.kind,
        messageId: message.id,
        profileName: message.profileName,
        origin,
      });
      await receipt;

      let sent = 0;
      for (const reply of handled.replyMessages) {
        const res = await sendWhatsAppText(message.from, reply, cfg);
        if (!res.ok) break;
        sent += 1;
      }

      console.info('[WhatsApp.Webhook]', {
        event: 'answered',
        request_id: requestId,
        to: maskNumber(message.from),
        outcome: handled.outcome,
        replies: handled.replyMessages.length,
        sent,
      });
    } catch (error) {
      console.error('[WhatsApp.Webhook]', {
        event: 'message_failed',
        request_id: requestId,
        to: maskNumber(message.from),
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
