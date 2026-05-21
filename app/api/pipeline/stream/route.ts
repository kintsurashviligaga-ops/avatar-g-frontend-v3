/**
 * /api/pipeline/stream — cross-device pipeline event bridge.
 *
 *   GET  ?pipelineId=…  → opens a Server-Sent Events stream; every bridge
 *                         event for that pipeline is pushed as a `data:`
 *                         chunk. A 15s heartbeat comment keeps the
 *                         connection warm through proxies.
 *   POST                → the PIPELINE_EVENT_BRIDGE_URL target. The RunPod
 *                         assemble callback forwards normalized lifecycle
 *                         events here; they fan out to GET subscribers.
 *
 * Single-instance fan-out via the in-memory sse-hub (swap to Redis pub/sub
 * for multi-instance — same publish/subscribe shape).
 */

import { NextRequest, NextResponse } from 'next/server';
import { subscribe, publish, type BridgeEvent } from '@/lib/orchestrator/sse-hub';
import { PIPELINE_TOPICS, type PipelineTopic } from '@/lib/orchestrator/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const pipelineId = req.nextUrl.searchParams.get('pipelineId');
  if (!pipelineId) {
    return NextResponse.json({ error: 'pipelineId query param required' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try { controller.enqueue(encoder.encode(chunk)); } catch { /* closed */ }
      };
      // Initial comment opens the stream immediately.
      send(`: connected ${pipelineId}\n\n`);
      send(`event: ready\ndata: ${JSON.stringify({ pipelineId })}\n\n`);

      unsubscribe = subscribe(pipelineId, (event: BridgeEvent) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      });

      heartbeat = setInterval(() => send(`: ping\n\n`), 15_000);

      // Clean up when the client disconnects.
      req.signal.addEventListener('abort', () => {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

interface PublishBody {
  topic?: string;
  pipelineId?: string;
  payload?: Record<string, string | number | boolean | null>;
}

export async function POST(req: NextRequest) {
  let body: PublishBody;
  try {
    body = (await req.json()) as PublishBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const topic = body.topic as PipelineTopic | undefined;
  const pipelineId = String(body.pipelineId ?? '').trim();
  if (!pipelineId || !topic || !PIPELINE_TOPICS.includes(topic)) {
    return NextResponse.json({ error: 'pipelineId and a valid topic required' }, { status: 400 });
  }
  const delivered = publish({ topic, pipelineId, payload: body.payload ?? {} });
  return NextResponse.json({ ok: true, delivered });
}
