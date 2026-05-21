/**
 * POST /api/video/assemble — final video composition dispatcher.
 *
 * Receives the compiled composition (≤5 segment URLs + per-segment + global
 * RenderSettings + master audio handles) and bridges the heavy stitch to an
 * external GPU FFmpeg worker (RunPod/Lambda) over a private webhook —
 * serverless functions cannot run CUDA FFmpeg themselves.
 *
 * The whole dispatch is wrapped in a Saga so a RunPod outage rolls back
 * cleanly: the user's reserved credits are released and any partial temp
 * storage is purged, leaving no dead state.
 *
 * Honest degradation: with no RUNPOD_RENDER_WEBHOOK_URL configured the
 * route returns 503 (not a fake success) — the contract is ready the
 * moment the GPU node is provisioned.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { runSaga, type SagaStep } from '@/lib/orchestrator/saga';
import { lockTokens, commitTokenLock, releaseTokenLock, type TokenLock } from '@/lib/orchestrator/idempotency';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const ASSEMBLE_COST = 20; // credits to stitch a composition

interface SegmentInput {
  url?: string;
  durationSec?: number;
  cameraMotion?: string | null;
  render?: Record<string, string | number>;
}
interface AssembleBody {
  segments?: SegmentInput[];
  voiceoverUrl?: string | null;
  musicUrl?: string | null;
  globalRender?: Record<string, string | number>;
}

export async function POST(req: NextRequest) {
  let body: AssembleBody;
  try {
    body = (await req.json()) as AssembleBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const segments = (body.segments ?? []).filter(s => typeof s.url === 'string' && s.url.length > 0);
  if (segments.length < 2) {
    return NextResponse.json({ error: 'at least 2 ready segments required' }, { status: 400 });
  }

  // Identify the user (cookie or Bearer) for credit accounting.
  const { user } = await authedClientFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const webhookUrl = process.env.RUNPOD_RENDER_WEBHOOK_URL;
  const webhookToken = process.env.RUNPOD_API_TOKEN;
  if (!webhookUrl || !webhookToken) {
    return NextResponse.json(
      { error: 'render_node_unprovisioned', message: 'GPU render node (RUNPOD_RENDER_WEBHOOK_URL / RUNPOD_API_TOKEN) is not configured.' },
      { status: 503 },
    );
  }

  // Saga: reserve credits → dispatch to RunPod → commit. State is threaded
  // through ctx.bag so every step (and its compensator) reads a single
  // source of truth; any failure rolls back (release credits + purge temp).
  const steps: SagaStep[] = [
    {
      name: 'reserve-credits',
      run: async (ctx) => {
        const lock = await lockTokens(user.id, ASSEMBLE_COST, 900);
        ctx.bag.lock = lock;
        return lock;
      },
      compensate: async (_r, ctx) => {
        const lock = ctx.bag.lock as TokenLock | null | undefined;
        if (lock) await releaseTokenLock(lock);
      },
    },
    {
      name: 'dispatch-runpod',
      run: async (ctx) => {
        const payload = {
          segments: segments.map(s => ({
            url: s.url,
            durationSec: s.durationSec ?? 6,
            cameraMotion: s.cameraMotion ?? null,
            render: s.render ?? {},
          })),
          voiceoverUrl: body.voiceoverUrl ?? null,
          musicUrl: body.musicUrl ?? null,
          globalRender: body.globalRender ?? {},
          pipelineId: ctx.sagaId,
        };
        // Exponential-backoff retry (max 3) on transient 5xx / network errors.
        let lastErr: unknown = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const r = await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${webhookToken}` },
              body: JSON.stringify({ input: payload }),
              signal: ctx.signal,
            });
            if (r.ok) {
              const data = (await r.json()) as { output?: { url?: string }; url?: string };
              const url = data.output?.url ?? data.url;
              if (!url) throw new Error('render node returned no url');
              ctx.bag.tempUrl = url;
              return url;
            }
            if (r.status < 500 && r.status !== 429) throw new Error(`render node ${r.status}`);
            lastErr = new Error(`render node ${r.status}`);
          } catch (e) {
            lastErr = e;
            if ((e as Error)?.name === 'AbortError') throw e;
          }
          if (attempt < 3) await new Promise(res => setTimeout(res, Math.min(8000, 700 * 2 ** (attempt - 1))));
        }
        throw lastErr instanceof Error ? lastErr : new Error('render node unreachable');
      },
      compensate: async (_r, ctx) => {
        // Best-effort purge of the partial render so no orphaned asset lingers.
        const tempUrl = ctx.bag.tempUrl;
        const purge = process.env.RUNPOD_PURGE_WEBHOOK_URL;
        if (typeof tempUrl === 'string' && purge) {
          try {
            await fetch(purge, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${webhookToken}` },
              body: JSON.stringify({ url: tempUrl }),
            });
          } catch { /* best effort */ }
        }
      },
    },
    {
      name: 'commit',
      run: async (ctx) => {
        const lock = ctx.bag.lock as TokenLock | null | undefined;
        if (lock) await commitTokenLock(lock);
        return null;
      },
    },
  ];

  const bag: Record<string, unknown> = {};
  const saga = await runSaga(steps, { signal: req.signal, bag });
  const resultUrl = typeof bag.tempUrl === 'string' ? bag.tempUrl : null;

  if (!saga.ok) {
    return NextResponse.json(
      {
        error: 'assembly_failed',
        failedStep: saga.failedStep,
        message: saga.error,
        compensated: saga.compensatedSteps,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ url: resultUrl, sagaId: saga.sagaId });
}
