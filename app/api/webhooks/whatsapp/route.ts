import crypto from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { handleInbound } from '@/lib/agent-g/channels/handleInbound';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RateEntry = { count: number; windowStart: number };

const webhookRateWindowMs = 60_000;
const webhookRateMax = 120;
const maxPayloadBytes = 256_000;
const inboundRateMap = new Map<string, RateEntry>();

function normalize(value: string | null | undefined): string {
  return String(value || '').trim();
}

function resolveClientIp(request: Request): string {
  const forwarded = normalize(request.headers.get('x-forwarded-for'));
  if (forwarded) {
    return normalize(forwarded.split(',')[0]);
  }
  return normalize(request.headers.get('x-real-ip')) || 'unknown';
}

function isRateLimited(clientIp: string): boolean {
  const now = Date.now();
  const existing = inboundRateMap.get(clientIp);

  if (!existing || now - existing.windowStart >= webhookRateWindowMs) {
    inboundRateMap.set(clientIp, { count: 1, windowStart: now });
    return false;
  }

  existing.count += 1;
  return existing.count > webhookRateMax;
}

function safeLog(event: string, payload: Record<string, unknown>): void {
  console.info('[WhatsApp.Webhook]', {
    event,
    ...payload,
  });
}

function parseMessageSummary(payload: Record<string, unknown>): Array<{ from: string; text: string; id: string }> {
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

function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = normalize(process.env.WHATSAPP_APP_SECRET);
  if (!appSecret) {
    return true;
  }

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const incoming = signatureHeader.slice('sha256='.length);
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  if (incoming.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(expected));
}

async function processIncomingPayload(
  payload: Record<string, unknown>,
  requestId: string,
  origin: string
): Promise<void> {
  const hasSupabaseServiceRole = Boolean(normalize(process.env.SUPABASE_SERVICE_ROLE_KEY));
  const hasSupabaseUrl = Boolean(normalize(process.env.SUPABASE_URL) || normalize(process.env.NEXT_PUBLIC_SUPABASE_URL));
  if (!hasSupabaseServiceRole || !hasSupabaseUrl) {
    safeLog('processor_skipped_unconfigured', {
      request_id: requestId,
      has_supabase_service_role: hasSupabaseServiceRole,
      has_supabase_url: hasSupabaseUrl,
    });
    return;
  }

  const supabase = createServiceRoleClient();
  const messages = parseMessageSummary(payload);

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

export async function GET(req: Request): Promise<Response> {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === expected) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const clientIp = resolveClientIp(req);

  if (isRateLimited(clientIp)) {
    safeLog('rate_limited', { request_id: requestId, client_ip: clientIp });
    return Response.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const contentLength = Number(req.headers.get('content-length') || '0');
  if (contentLength > maxPayloadBytes) {
    safeLog('payload_too_large', {
      request_id: requestId,
      content_length: contentLength,
      client_ip: clientIp,
    });
    return Response.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, 'utf8') > maxPayloadBytes) {
    return Response.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  }

  const signature = req.headers.get('x-hub-signature-256');
  if (!verifyMetaSignature(rawBody, signature)) {
    safeLog('invalid_signature', { request_id: requestId, client_ip: clientIp });
    return new Response('Forbidden', { status: 403 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (rawBody ? JSON.parse(rawBody) : {}) as Record<string, unknown>;
  } catch {
    safeLog('invalid_json', { request_id: requestId, client_ip: clientIp });
    return Response.json({ ok: true, ignored: true, reason: 'invalid_json' }, { status: 200 });
  }

  const url = new URL(req.url);
  queueMicrotask(() => {
    void processIncomingPayload(payload, requestId, url.origin).catch((error) => {
      console.error('[WhatsApp.Webhook] process_failed', {
        request_id: requestId,
        message: error instanceof Error ? error.message : 'unknown',
      });
    });
  });

  safeLog('accepted', {
    request_id: requestId,
    client_ip: clientIp,
    object: normalize(String(payload.object || '')) || null,
    received_at: new Date().toISOString(),
  });

  return Response.json({ ok: true, request_id: requestId }, { status: 200 });
}
