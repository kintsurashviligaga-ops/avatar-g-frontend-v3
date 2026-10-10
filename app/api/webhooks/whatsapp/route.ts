import crypto from 'node:crypto';
import { parseWhatsAppMessageSummary, processWhatsAppPayload } from '@/lib/agent-g/channels/whatsapp-processor';
import { enqueueQueueItem } from '@/lib/platform/queues';
import { runAfterResponse } from '@/lib/platform/afterResponse';
import { hashIdempotencyKey, markIdempotentDuplicate } from '@/lib/platform/idempotency';
import { recordRouteMetric } from '@/lib/platform/request-metrics';
import { hasCallsField, parseCallEvents } from '@/lib/calls/whatsapp/events';
import { handleCallEvents } from '@/lib/calls/whatsapp/callService';
import { liveCallDeps } from '@/lib/calls/whatsapp/liveDeps';

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

function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = normalize(process.env.WHATSAPP_APP_SECRET);
  // ⚠️ FAIL CLOSED. This returned `true` when WHATSAPP_APP_SECRET was unset, so every unsigned POST was accepted as a
  // Meta delivery, queued, and drained by the worker tick into an LLM reply on the platform keys. Meta signs every
  // delivery with the app secret; without one configured nothing can be verified, so nothing is accepted.
  if (!appSecret) {
    return false;
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


/**
 * The verify token as configured: WHATSAPP_VERIFY_TOKEN (or the names Meta's guides use), with what a paste into the
 * Vercel form commonly adds — surrounding quotes, a trailing newline, stray spaces — taken off. Meta's "Verify and
 * save" sends the token exactly as typed in its own form; a strict `===` against a value carrying an invisible
 * newline failed the handshake while both sides "looked" identical.
 */
function normalizeVerifyToken(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/^(["'`])([\s\S]*)\1$/, '$2')
    .replace(/\s+/g, '');
}

function configuredVerifyToken(env: NodeJS.ProcessEnv = process.env): string {
  for (const v of [env.WHATSAPP_VERIFY_TOKEN, env.WHATSAPP_WEBHOOK_VERIFY_TOKEN, env.META_VERIFY_TOKEN, env.META_WEBHOOK_VERIFY_TOKEN]) {
    const t = normalizeVerifyToken(v);
    if (t) return t;
  }
  return '';
}

function verifyTokenMatches(received: string, expected: string): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Meta's webhook verification: GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=… → 200 with the challenge
 * as plain text when the token matches, else 403. A mismatch is logged with LENGTHS only (never a token), so the
 * owner can tell "not configured" from "configured but different" in the Vercel logs.
 */
export async function GET(req: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const expected = configuredVerifyToken();
  const url = new URL(req.url);
  const mode = normalize(url.searchParams.get('hub.mode'));
  const token = normalizeVerifyToken(url.searchParams.get('hub.verify_token'));
  const challenge = url.searchParams.get('hub.challenge') ?? '';

  const ok = mode === 'subscribe' && verifyTokenMatches(token, expected) && challenge.length > 0 && challenge.length <= 512;
  if (!ok) {
    safeLog('verify_refused', {
      request_id: requestId,
      mode: mode.slice(0, 20) || null,
      token_configured: expected.length > 0,
      expected_length: expected.length,
      received_length: token.length,
      has_challenge: challenge.length > 0,
    });
  }
  const response = ok
    ? new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
    : new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  response.headers.set('x-request-id', requestId);
  recordRouteMetric({
    request_id: requestId,
    route: '/api/webhooks/whatsapp',
    method: 'GET',
    status: ok ? 200 : 403,
    duration_ms: Date.now() - startedAt,
    at: Date.now(),
  });
  return response;
}

export async function POST(req: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const clientIp = resolveClientIp(req);

  if (isRateLimited(clientIp)) {
    safeLog('rate_limited', { request_id: requestId, client_ip: clientIp });
    const response = Response.json({ ok: false, error: 'rate_limited', request_id: requestId }, { status: 429 });
    response.headers.set('x-request-id', requestId);
    recordRouteMetric({
      request_id: requestId,
      route: '/api/webhooks/whatsapp',
      method: 'POST',
      status: 429,
      duration_ms: Date.now() - startedAt,
      at: Date.now(),
    });
    return response;
  }

  const contentLength = Number(req.headers.get('content-length') || '0');
  if (contentLength > maxPayloadBytes) {
    safeLog('payload_too_large', {
      request_id: requestId,
      content_length: contentLength,
      client_ip: clientIp,
    });
    const response = Response.json({ ok: false, error: 'payload_too_large', request_id: requestId }, { status: 413 });
    response.headers.set('x-request-id', requestId);
    recordRouteMetric({
      request_id: requestId,
      route: '/api/webhooks/whatsapp',
      method: 'POST',
      status: 413,
      duration_ms: Date.now() - startedAt,
      at: Date.now(),
    });
    return response;
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, 'utf8') > maxPayloadBytes) {
    const response = Response.json({ ok: false, error: 'payload_too_large', request_id: requestId }, { status: 413 });
    response.headers.set('x-request-id', requestId);
    recordRouteMetric({
      request_id: requestId,
      route: '/api/webhooks/whatsapp',
      method: 'POST',
      status: 413,
      duration_ms: Date.now() - startedAt,
      at: Date.now(),
    });
    return response;
  }

  const signature = req.headers.get('x-hub-signature-256');
  if (!verifyMetaSignature(rawBody, signature)) {
    safeLog('invalid_signature', { request_id: requestId, client_ip: clientIp });
    const response = new Response('Forbidden', { status: 403 });
    response.headers.set('x-request-id', requestId);
    recordRouteMetric({
      request_id: requestId,
      route: '/api/webhooks/whatsapp',
      method: 'POST',
      status: 403,
      duration_ms: Date.now() - startedAt,
      at: Date.now(),
    });
    return response;
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (rawBody ? JSON.parse(rawBody) : {}) as Record<string, unknown>;
  } catch {
    safeLog('invalid_json', { request_id: requestId, client_ip: clientIp });
    const response = Response.json({ ok: true, ignored: true, reason: 'invalid_json', request_id: requestId }, { status: 200 });
    response.headers.set('x-request-id', requestId);
    recordRouteMetric({
      request_id: requestId,
      route: '/api/webhooks/whatsapp',
      method: 'POST',
      status: 200,
      duration_ms: Date.now() - startedAt,
      at: Date.now(),
    });
    return response;
  }

  const url = new URL(req.url);

  // WhatsApp Calling (`calls` field): handled on their own path with a per-event dedupe (lib/calls/whatsapp), never by
  // the message pipeline's idempotency key below — a calls payload has no message ids, and two different calls would
  // share its raw-body fallback. A call must be answered within Meta's 30–60 s, so it is handled right after the 200,
  // or inline when the platform has no after-response hook. While WHATSAPP_CALLING_ENABLED is off every call is
  // declined at once (no ringing into silence).
  let callEvents = 0;
  if (hasCallsField(payload)) {
    const events = parseCallEvents(payload);
    callEvents = events.length;
    if (events.length) {
      const work = async () => {
        const out = await handleCallEvents(liveCallDeps(url.origin), events);
        console.warn('[WhatsApp.Calls] handled', { request_id: requestId, outcomes: out.map((o) => o.outcome) });
      };
      if (!runAfterResponse(work, 'WhatsApp.Calls')) await work().catch(() => undefined);
    }
  }

  const messages = parseWhatsAppMessageSummary(payload);
  if (callEvents > 0 && messages.length === 0) {
    const response = Response.json({ ok: true, request_id: requestId }, { status: 200 });
    response.headers.set('x-request-id', requestId);
    recordRouteMetric({ request_id: requestId, route: '/api/webhooks/whatsapp', method: 'POST', status: 200, duration_ms: Date.now() - startedAt, at: Date.now() });
    return response;
  }
  const messageFingerprint = messages
    .map((message) => message.id)
    .filter(Boolean)
    .sort()
    .join(',');
  const idempotencyKey = hashIdempotencyKey(
    `whatsapp:${messageFingerprint || `${normalize(String(payload.object || 'unknown'))}:${rawBody.slice(0, 200)}`}`
  );
  const isFirstSeen = await markIdempotentDuplicate(idempotencyKey, 60 * 60 * 24);
  if (!isFirstSeen) {
    safeLog('duplicate_ignored', {
      request_id: requestId,
      idempotency_key: idempotencyKey,
      message_count: messages.length,
    });
    const response = Response.json({ ok: true, duplicate: true, request_id: requestId }, { status: 200 });
    response.headers.set('x-request-id', requestId);
    recordRouteMetric({
      request_id: requestId,
      route: '/api/webhooks/whatsapp',
      method: 'POST',
      status: 200,
      duration_ms: Date.now() - startedAt,
      at: Date.now(),
    });
    return response;
  }

  const queueItem = {
    source: 'whatsapp',
    request_id: requestId,
    origin: url.origin,
    idempotency_key: idempotencyKey,
    payload,
  };
  // Answer NOW, after the 200 (Vercel's waitUntil): the person sees a reply in seconds instead of whenever a cron
  // drains a queue. Off Vercel — or if the answer fails before it was sent — the delivery goes to the queue the worker
  // tick drains, as before. Status-only callbacks (delivered/read) carry no messages and need neither.
  let mode: 'inline' | 'queued' | 'none' = 'none';
  if (messages.length > 0) {
    const inline = runAfterResponse(async () => {
      try {
        await processWhatsAppPayload(payload, requestId, url.origin);
      } catch {
        await enqueueQueueItem('webhooks_ingest', queueItem);
      }
    }, 'WhatsApp.Webhook');
    if (!inline) await enqueueQueueItem('webhooks_ingest', queueItem);
    mode = inline ? 'inline' : 'queued';
  }

  safeLog('accepted', {
    request_id: requestId,
    client_ip: clientIp,
    idempotency_key: idempotencyKey,
    object: normalize(String(payload.object || '')) || null,
    message_count: messages.length,
    mode,
    received_at: new Date().toISOString(),
  });

  const response = Response.json({ ok: true, request_id: requestId }, { status: 200 });
  response.headers.set('x-request-id', requestId);
  recordRouteMetric({
    request_id: requestId,
    route: '/api/webhooks/whatsapp',
    method: 'POST',
    status: 200,
    duration_ms: Date.now() - startedAt,
    at: Date.now(),
  });
  return response;
}
