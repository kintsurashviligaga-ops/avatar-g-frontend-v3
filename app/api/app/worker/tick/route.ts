import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { dequeueQueueItems, enqueueQueueItem, getQueueSnapshot } from '@/lib/platform/queues';
import { processWhatsAppPayload } from '@/lib/agent-g/channels/whatsapp-processor';
import { processTelegramUpdateInBackground } from '@/lib/agent-g/channels/telegram-webhook-handler';
import { recordRouteMetric } from '@/lib/platform/request-metrics';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  let statusCode = 200;

  const internalToken = request.headers.get('x-internal-worker-token');
  if (!process.env.WORKER_INTERNAL_TOKEN || internalToken !== process.env.WORKER_INTERNAL_TOKEN) {
    statusCode = 403;
    const response = NextResponse.json({ error: 'Forbidden', request_id: requestId }, { status: 403 });
    response.headers.set('x-request-id', requestId);
    recordRouteMetric({
      request_id: requestId,
      route: '/api/app/worker/tick',
      method: 'POST',
      status: statusCode,
      duration_ms: Date.now() - startedAt,
      at: Date.now(),
    });
    return response;
  }

  const supabase = createServiceRoleClient();
  const staleThreshold = new Date(Date.now() - 1000 * 60 * 10).toISOString();

  const { data: staleJobs, error: staleError } = await supabase
    .from('service_jobs')
    .select('id, attempt_count, max_attempts')
    .eq('status', 'processing')
    .lt('heartbeat_at', staleThreshold)
    .limit(100);

  if (staleError) {
    statusCode = 500;
    const response = NextResponse.json({ error: staleError.message, request_id: requestId }, { status: 500 });
    response.headers.set('x-request-id', requestId);
    recordRouteMetric({
      request_id: requestId,
      route: '/api/app/worker/tick',
      method: 'POST',
      status: statusCode,
      duration_ms: Date.now() - startedAt,
      at: Date.now(),
    });
    return response;
  }

  let recycled = 0;
  let deadLettered = 0;
  let webhooksDispatched = 0;
  let processingExecuted = 0;
  let billingProcessed = 0;

  for (const job of staleJobs ?? []) {
    const isDeadLetter = (job.attempt_count ?? 0) >= (job.max_attempts ?? 3);

    const { error } = await supabase
      .from('service_jobs')
      .update(
        isDeadLetter
          ? {
              status: 'failed',
              progress: 100,
              error_message: 'Moved to dead-letter after max retries',
              heartbeat_at: new Date().toISOString(),
            }
          : {
              status: 'queued',
              progress: 0,
              error_message: 'Recovered from stale processing heartbeat',
              heartbeat_at: new Date().toISOString(),
            }
      )
      .eq('id', job.id);

    if (!error) {
      if (isDeadLetter) deadLettered += 1;
      else recycled += 1;
    }
  }

  const webhookEvents = await dequeueQueueItems<Record<string, unknown>>('webhooks_ingest', 50);
  for (const event of webhookEvents) {
    await enqueueQueueItem('processing_jobs', {
      source: event.payload?.source,
      request_id: event.payload?.request_id,
      origin: event.payload?.origin,
      idempotency_key: event.payload?.idempotency_key,
      payload: event.payload?.payload,
      update: event.payload?.update,
      started_at: event.payload?.started_at,
      enqueued_from: 'webhooks_ingest',
    });
    webhooksDispatched += 1;
  }

  const processingJobs = await dequeueQueueItems<Record<string, unknown>>('processing_jobs', 25);
  for (const job of processingJobs) {
    const source = String(job.payload?.source || '');
    try {
      if (source === 'whatsapp') {
        const payload = (job.payload?.payload || {}) as Record<string, unknown>;
        const requestIdPayload = String(job.payload?.request_id || job.id);
        const origin = String(job.payload?.origin || '');
        await processWhatsAppPayload(payload, requestIdPayload, origin);
        processingExecuted += 1;
      } else if (source === 'telegram') {
        const update = (job.payload?.update || {}) as Parameters<typeof processTelegramUpdateInBackground>[0]['update'];
        const requestIdPayload = String(job.payload?.request_id || job.id);
        const startedAtPayload = Number(job.payload?.started_at || Date.now());
        await processTelegramUpdateInBackground({
          update,
          requestId: requestIdPayload,
          startedAt: Number.isFinite(startedAtPayload) ? startedAtPayload : Date.now(),
        });
        processingExecuted += 1;
      }
    } catch (error) {
      console.error('[Worker.Tick] processing job failed', {
        source,
        queue_item_id: job.id,
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  const billingEvents = await dequeueQueueItems<Record<string, unknown>>('billing_events', 25);
  for (const event of billingEvents) {
    billingProcessed += 1;
    console.info('[Worker.Tick] billing_event_processed', {
      queue_item_id: event.id,
      request_id: event.payload?.request_id ?? null,
    });
  }

  const queues = await getQueueSnapshot();

  const response = NextResponse.json({
    ok: true,
    request_id: requestId,
    scanned: staleJobs?.length ?? 0,
    recycled,
    dead_lettered: deadLettered,
    queue_processing: {
      webhooks_dispatched: webhooksDispatched,
      processing_executed: processingExecuted,
      billing_processed: billingProcessed,
    },
    queues,
  });
  response.headers.set('x-request-id', requestId);

  recordRouteMetric({
    request_id: requestId,
    route: '/api/app/worker/tick',
    method: 'POST',
    status: statusCode,
    duration_ms: Date.now() - startedAt,
    at: Date.now(),
  });

  return response;
}