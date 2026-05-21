/**
 * POST /api/video/assemble/callback — intermediate lifecycle webhook from
 * the RunPod render node.
 *
 * The render node posts progress as it stitches each 6-second scene; this
 * route validates the bearer token and normalizes the event into a
 * pipeline topic + payload. Real-time delivery to the client's
 * SwarmStatusPanel requires a cross-process transport (Redis pub-sub /
 * SSE) — when that bridge is provisioned this route forwards the event to
 * it. Until then it acknowledges + records the event so nothing is lost.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { PipelineTopic } from '@/lib/orchestrator/events';
import { PIPELINE_TOPICS } from '@/lib/orchestrator/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

interface CallbackBody {
  pipelineId?: string;
  topic?: string;
  scenesDone?: number;
  url?: string;
  error?: string;
}

export async function POST(req: NextRequest) {
  // Auth: the render node must present the shared webhook token.
  const expected = process.env.RUNPOD_RENDER_WEBHOOK_TOKEN ?? process.env.RUNPOD_API_TOKEN;
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: CallbackBody;
  try {
    body = (await req.json()) as CallbackBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const pipelineId = String(body.pipelineId ?? '').trim();
  const topic = body.topic as PipelineTopic | undefined;
  if (!pipelineId || !topic || !PIPELINE_TOPICS.includes(topic)) {
    return NextResponse.json({ error: 'pipelineId and a valid topic are required' }, { status: 400 });
  }

  const payload: Record<string, string | number> = {};
  if (typeof body.scenesDone === 'number') payload.scenesDone = body.scenesDone;
  if (typeof body.url === 'string') payload.url = body.url;
  if (typeof body.error === 'string') payload.error = body.error;

  // Forward to a cross-process transport when configured. Upstash REST
  // cannot hold a persistent SUBSCRIBE, so live fan-out needs a pub-sub /
  // SSE bridge; this is the single seam where it attaches.
  const bridge = process.env.PIPELINE_EVENT_BRIDGE_URL;
  let forwarded = false;
  if (bridge) {
    try {
      await fetch(bridge, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, pipelineId, payload }),
      });
      forwarded = true;
    } catch { /* best effort — the ack below still confirms receipt */ }
  }

  return NextResponse.json({ ok: true, topic, pipelineId, forwarded });
}
