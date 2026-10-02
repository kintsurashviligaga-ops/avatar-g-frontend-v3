/**
 * lib/agent-g/channels/whatsapp-client.ts — the WhatsApp Cloud API (Meta Graph) calls Agent G makes: send a text, send
 * an approved template, mark a message read, and look up the business number for the wa.me link.
 *
 * Every call answers a result and NEVER throws: a failed send is logged (status + Meta's error code, never the token or
 * the message body) and the caller moves on — a reply or an alert must not take a webhook or a generation flow down.
 */
import { chunkForWhatsApp } from './whatsapp-text';

/** The Graph API version the owner's WhatsApp app is set up on (Meta's API Setup page: graph.facebook.com/v25.0/…). */
export const GRAPH_VERSION_DEFAULT = 'v25.0';

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
  graphVersion: string;
}

const first = (...values: Array<string | undefined>): string => {
  for (const v of values) {
    const t = (v ?? '').trim();
    if (t) return t;
  }
  return '';
};

/**
 * The sending credentials, or null. WHATSAPP_ACCESS_TOKEN is the documented name; the aliases are the names Meta's own
 * setup screens and common guides use, accepted so a token saved under one of them is not silently ignored.
 */
export function whatsappConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig | null {
  const token = first(env.WHATSAPP_ACCESS_TOKEN, env.WHATSAPP_TOKEN, env.WHATSAPP_API_TOKEN, env.META_WHATSAPP_TOKEN, env.WHATSAPP_CLOUD_API_TOKEN);
  const phoneNumberId = first(env.WHATSAPP_PHONE_NUMBER_ID, env.WHATSAPP_PHONE_ID, env.META_WHATSAPP_PHONE_NUMBER_ID);
  if (!token || !phoneNumberId) return null;
  const v = first(env.WHATSAPP_GRAPH_VERSION);
  return { token, phoneNumberId, graphVersion: /^v\d+\.\d+$/.test(v) ? v : GRAPH_VERSION_DEFAULT };
}

export interface SendResult {
  ok: boolean;
  status: number | null;
  /** Meta's numeric error code (e.g. 131047 = outside the 24 h window, 190 = bad token). */
  errorCode: number | null;
  messageIds: string[];
}

const TIMEOUT_MS = 10_000;

async function graphPost(cfg: WhatsAppConfig, body: Record<string, unknown>): Promise<SendResult> {
  try {
    const res = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { code?: number };
    };
    const ids = (json.messages ?? []).map((m) => String(m.id ?? '')).filter(Boolean);
    const errorCode = typeof json.error?.code === 'number' ? json.error.code : null;
    if (!res.ok) console.warn('[WhatsApp.Send] refused', { status: res.status, error_code: errorCode });
    return { ok: res.ok, status: res.status, errorCode, messageIds: ids };
  } catch (error) {
    console.warn('[WhatsApp.Send] failed', { message: error instanceof Error ? error.name : 'unknown' });
    return { ok: false, status: null, errorCode: null, messageIds: [] };
  }
}

/** A free-form text (only valid inside the 24 h customer-service window). Long text goes as several messages. */
export async function sendWhatsAppText(to: string, text: string, cfg = whatsappConfig()): Promise<SendResult> {
  if (!cfg) return { ok: false, status: null, errorCode: null, messageIds: [] };
  const parts = chunkForWhatsApp(text);
  const ids: string[] = [];
  let last: SendResult = { ok: false, status: null, errorCode: null, messageIds: [] };
  for (const body of parts) {
    last = await graphPost(cfg, { recipient_type: 'individual', to, type: 'text', text: { body, preview_url: true } });
    if (!last.ok) return { ...last, messageIds: ids };
    ids.push(...last.messageIds);
  }
  return { ...last, messageIds: ids };
}

/**
 * An approved message template — the only thing WhatsApp delivers outside the 24 h window. `params` fill the body's
 * {{1}}, {{2}}… in order; each is trimmed and capped (Meta refuses newlines/tabs and long runs of spaces in a param).
 */
export async function sendWhatsAppTemplate(
  to: string,
  template: { name: string; language: string },
  params: string[],
  cfg = whatsappConfig(),
): Promise<SendResult> {
  if (!cfg) return { ok: false, status: null, errorCode: null, messageIds: [] };
  const clean = params.map((p) => p.replace(/[\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 900) || '-');
  return graphPost(cfg, {
    to,
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language },
      // No parameters → no `components` at all: exactly Meta's own sample (`hello_world`, en_US).
      ...(clean.length ? { components: [{ type: 'body', parameters: clean.map((text) => ({ type: 'text', text })) }] } : {}),
    },
  });
}

/**
 * Blue ticks + "typing…" while the answer is written. The typing indicator is newer than the read receipt; when Meta
 * refuses the combined call, the plain read receipt is sent instead. Best-effort either way.
 */
export async function markWhatsAppRead(messageId: string, cfg = whatsappConfig()): Promise<void> {
  if (!cfg || !messageId) return;
  const withTyping = await graphPost(cfg, { status: 'read', message_id: messageId, typing_indicator: { type: 'text' } });
  if (!withTyping.ok) await graphPost(cfg, { status: 'read', message_id: messageId });
}

let numberCache: { value: string | null; at: number } | null = null;

/**
 * The business number in international digits, for a https://wa.me/<number> link: WHATSAPP_BUSINESS_NUMBER when set,
 * else asked from Graph once an hour. Null when neither answers.
 */
export async function businessNumber(cfg = whatsappConfig(), env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const configured = (env.WHATSAPP_BUSINESS_NUMBER ?? env.WHATSAPP_DISPLAY_NUMBER ?? '').replace(/\D/g, '');
  if (configured.length >= 8) return configured;
  if (!cfg) return null;
  if (numberCache && Date.now() - numberCache.at < 60 * 60_000) return numberCache.value;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}?fields=display_phone_number`,
      { headers: { Authorization: `Bearer ${cfg.token}` }, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    const json = (await res.json().catch(() => ({}))) as { display_phone_number?: string };
    const digits = String(json.display_phone_number ?? '').replace(/\D/g, '');
    numberCache = { value: res.ok && digits.length >= 8 ? digits : null, at: Date.now() };
  } catch {
    numberCache = { value: null, at: Date.now() };
  }
  return numberCache.value;
}

/** Test seam. */
export function __resetWhatsAppClientCache(): void {
  numberCache = null;
}
