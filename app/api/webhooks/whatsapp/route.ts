import crypto from 'node:crypto';
import { parseWhatsAppMessageSummary } from '@/lib/agent-g/channels/whatsapp-processor';
import { enqueueQueueItem } from '@/lib/platform/queues';
import { hashIdempotencyKey, markIdempotentDuplicate } from '@/lib/platform/idempotency';
import { recordRouteMetric } from '@/lib/platform/request-metrics';

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


export async function GET(req: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === expected) {
    const response = new Response(challenge, { status: 200 });
    response.headers.set('x-request-id', requestId);
    recordRouteMetric({
      request_id: requestId,
      route: '/api/webhooks/whatsapp',
      method: 'GET',
      status: 200,
      duration_ms: Date.now() - startedAt,
      at: Date.now(),
    });
    return response;
  }

  const response = new Response("Forbidden", { status: 403 });
  response.headers.set('x-request-id', requestId);
  recordRouteMetric({
    request_id: requestId,
    route: '/api/webhooks/whatsapp',
    method: 'GET',
    status: 403,
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
  const messages = parseWhatsAppMessageSummary(payload);
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

  await enqueueQueueItem('webhooks_ingest', {
    source: 'whatsapp',
    request_id: requestId,
    origin: url.origin,
    idempotency_key: idempotencyKey,
    payload,
  });

  safeLog('accepted', {
    request_id: requestId,
    client_ip: clientIp,
    idempotency_key: idempotencyKey,
    object: normalize(String(payload.object || '')) || null,
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
