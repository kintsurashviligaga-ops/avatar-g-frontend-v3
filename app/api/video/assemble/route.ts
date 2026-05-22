/**
 * POST /api/video/assemble — final video composition dispatcher.
 *
 * Receives the compiled composition (≤5 segment URLs + per-segment + global
 * RenderSettings + master audio handles) and bridges the heavy stitch to an
 * external GPU FFmpeg worker (RunPod) over a private webhook — serverless
 * functions cannot run CUDA FFmpeg themselves.
 *
 * Guarantees:
 *   - Idempotency: a payload hash is claimed in Redis for 60s so a
 *     double-click cannot launch two render jobs (fails-open w/o Redis).
 *   - Saga: reserve credits → dispatch → commit; any failure releases the
 *     credit lock and best-effort purges the partial render.
 *   - Honest degradation: 503 when the GPU node env is unprovisioned.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { runSaga, type SagaStep } from '@/lib/orchestrator/saga';
import {
  lockTokens, commitTokenLock, releaseTokenLock, type TokenLock,
  claimIdempotencyKey, hashPayload,
} from '@/lib/orchestrator/idempotency';
import { readRunPodConfig, dispatchRunPod, type RunPodManifest } from '@/lib/orchestrator/runpod-adapter';
import { deductCredits, refundCredits } from '@/lib/orchestrator/ledger';
import { reSignIfInternal } from '@/lib/orchestrator/storage-adapter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const ASSEMBLE_COST = 20; // credits to stitch a composition

interface SegmentInput {
  url?: string;
  durationSec?: number;
  cameraMotion?: string | null;
  render?: Record<string, string | number | boolean>;
}
interface AssembleBody {
  segments?: SegmentInput[];
  voiceoverUrl?: string | null;
  musicUrl?: string | null;
  sfxUrl?: string | null;
  globalRender?: Record<string, string | number | boolean>;
}

export async function POST(req: NextRequest) {
  let body: AssembleBody;
  try {
    body = (await req.json()) as AssembleBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const segments = (body.segments ?? []).filter((s): s is Required<Pick<SegmentInput, 'url'>> & SegmentInput =>
    typeof s.url === 'string' && s.url.length > 0);
  if (segments.length < 2) {
    return NextResponse.json({ error: 'at least 2 ready segments required' }, { status: 400 });
  }

  const { user } = await authedClientFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Idempotency — block duplicate submissions of the same composition.
  const idemKey = await hashPayload({ u: user.id, segs: segments.map(s => s.url), v: body.voiceoverUrl, m: body.musicUrl });
  const fresh = await claimIdempotencyKey(user.id, `assemble:${idemKey}`, 60);
  if (!fresh) {
    return NextResponse.json({ error: 'duplicate_request', message: 'This composition is already being assembled.' }, { status: 409 });
  }

  // GPU node gate — honest 503 when unprovisioned.
  const cfg = readRunPodConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: 'render_node_unprovisioned', message: 'GPU render node (RUNPOD_RENDER_WEBHOOK_URL + RUNPOD_RENDER_WEBHOOK_TOKEN) is not configured.' },
      { status: 503 },
    );
  }

  // Media-flow sanitization (Task 3): re-sign any internal Supabase Storage
  // object so only 15-minute signed URLs cross to the render node — no
  // permanent bucket URL escapes. External provider links pass through.
  const signedSegments = await Promise.all(
    segments.map(async s => ({
      url: await reSignIfInternal(s.url),
      durationSec: s.durationSec ?? 6,
      cameraMotion: s.cameraMotion ?? null,
      render: s.render ?? {},
    })),
  );
  const manifest: RunPodManifest = {
    segments: signedSegments,
    voiceoverUrl: body.voiceoverUrl ? await reSignIfInternal(body.voiceoverUrl) : null,
    musicUrl: body.musicUrl ? await reSignIfInternal(body.musicUrl) : null,
    sfxUrl: body.sfxUrl ? await reSignIfInternal(body.sfxUrl) : null,
    globalRender: body.globalRender ?? {},
    pipelineId: '',
    callbackUrl: new URL('/api/video/assemble/callback', req.url).toString(),
  };

  // Saga: reserve credits (Redis lock + durable ledger debit) → dispatch →
  // commit. Failure releases the lock AND refunds the durable debit, and
  // best-effort purges the partial render.
  const steps: SagaStep[] = [
    {
      name: 'reserve-credits',
      run: async (ctx) => {
        const lock = await lockTokens(user.id, ASSEMBLE_COST, 900);
        ctx.bag.lock = lock;
        const debit = await deductCredits(user.id, ASSEMBLE_COST, `assemble:${ctx.sagaId}`);
        ctx.bag.debited = debit.ok;
        // Fail-fast on a real rejection so we never dispatch a paid render
        // the user can't afford or that the DB couldn't record. 'skipped'
        // (RPC not provisioned) is the only non-fatal miss.
        if (!debit.ok && debit.reason === 'insufficient') throw new Error('insufficient credits');
        if (!debit.ok && debit.reason === 'error') throw new Error('credit ledger unavailable');
        return lock;
      },
      compensate: async (_r, ctx) => {
        const lock = ctx.bag.lock as TokenLock | null | undefined;
        if (lock) await releaseTokenLock(lock);
        if (ctx.bag.debited) await refundCredits(user.id, ASSEMBLE_COST, `assemble-rollback:${ctx.sagaId}`);
      },
    },
    {
      name: 'dispatch-runpod',
      run: async (ctx) => {
        const res = await dispatchRunPod(cfg, { ...manifest, pipelineId: ctx.sagaId }, { signal: ctx.signal });
        ctx.bag.tempUrl = res.url;
        return res.url;
      },
      compensate: async (_r, ctx) => {
        const tempUrl = ctx.bag.tempUrl;
        const purge = process.env.RUNPOD_PURGE_WEBHOOK_URL;
        if (typeof tempUrl === 'string' && purge) {
          try {
            await fetch(purge, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
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
      { error: 'assembly_failed', failedStep: saga.failedStep, message: saga.error, compensated: saga.compensatedSteps },
      { status: 502 },
    );
  }

  return NextResponse.json({ url: resultUrl, sagaId: saga.sagaId });
}
