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
 *   - Honest degradation: when no GPU worker (RunPod) is provisioned the stitch
 *     falls back to the bundled on-node CPU FFmpeg assembler — never a 503.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { runSaga, type SagaStep } from '@/lib/orchestrator/saga';
import {
  lockTokens, commitTokenLock, releaseTokenLock, type TokenLock,
  claimIdempotencyKey, releaseIdempotencyKey, hashPayload,
} from '@/lib/orchestrator/idempotency';
import { readRunPodConfig, dispatchRunPod, type RunPodManifest } from '@/lib/orchestrator/runpod-adapter';
import { deductCredits, refundCredits } from '@/lib/orchestrator/ledger';
import { consumeFreeFilm, restoreFreeFilm } from '@/lib/billing/wallet-ledger';
import { reSignIfInternal } from '@/lib/orchestrator/storage-adapter';
import { assembleWithFfmpeg } from '@/lib/orchestrator/ffmpeg-assembly';
import { recordFilmAssembling, recordFilmMaster, recordFilmFailed } from '@/lib/chat/filmStatusStore';
import { generateMusic } from '@/lib/ai/replicate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // CPU FFmpeg stitch of a 30s master needs headroom (Pro)

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
  /** PHASE 47 §1 — the film's unified status-tracker id. When present, the
   *  finished master is stamped onto the storage-backed record so any client /
   *  reload can recover it via GET /api/video/status/[tokenId]. */
  filmTokenId?: string | null;
  /** PHASE 55 §2 — the film brief, used to compose a cohesive fallback score
   *  on Replicate MusicGen when the upstream Udio track is missing. */
  scorePrompt?: string | null;
}

export async function POST(req: NextRequest) {
  let body: AssembleBody;
  try {
    body = (await req.json()) as AssembleBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  // PHASE 52 TASK 4 — defend the stitch order against the two failure modes that
  // produce "missing chunk indices": (a) a clip whose URL never resolved (kept a
  // placeholder) and (b) the same sub-clip submitted twice, which would double a
  // chunk and shift every index after it. We keep the caller's order, drop
  // url-less entries, and de-duplicate by URL so the timeline is contiguous.
  const seenUrls = new Set<string>();
  const segments = (body.segments ?? []).filter((s): s is Required<Pick<SegmentInput, 'url'>> & SegmentInput => {
    if (typeof s.url !== 'string' || s.url.length === 0) return false;
    if (seenUrls.has(s.url)) return false;
    seenUrls.add(s.url);
    return true;
  });
  if (segments.length < 2) {
    return NextResponse.json({ error: 'at least 2 ready segments required' }, { status: 400 });
  }

  const { user } = await authedClientFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // PHASE 47 §1 — flip the unified tracker to 'assembling' so a polling client
  // (or a reload) sees the editor working, not a stalled 'ready'. Fail-open.
  const filmTokenId = typeof body.filmTokenId === 'string' && body.filmTokenId.trim() ? body.filmTokenId.trim() : null;
  if (filmTokenId) await recordFilmAssembling(filmTokenId);

  // Idempotency — block duplicate submissions of the same composition.
  const idemKey = await hashPayload({ u: user.id, segs: segments.map(s => s.url), v: body.voiceoverUrl, m: body.musicUrl });
  const fresh = await claimIdempotencyKey(user.id, `assemble:${idemKey}`, 60);
  if (!fresh) {
    return NextResponse.json({ error: 'duplicate_request', message: 'This composition is already being assembled.' }, { status: 409 });
  }

  // Render-path selection: GPU RunPod worker when provisioned, otherwise the
  // bundled CPU FFmpeg assembler (Option B). Either way the request completes —
  // no 503. (RunPod is the quality upgrade: GPU encode + 60fps interpolation.)
  const cfg = readRunPodConfig();

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
  // PHASE 55 §2 — Cochlear score fallback. When the upstream Udio score failed
  // under credit exhaustion the client sends no musicUrl, and the stitched 30s
  // master would play completely silent. Synthesize a cohesive cinematic score
  // on the funded Replicate MusicGen module and overlay it across the whole
  // timeline so the film is never mute. Best-effort: a fallback miss degrades
  // gracefully to silent — it never fails the stitch.
  let resolvedMusicUrl = body.musicUrl ? await reSignIfInternal(body.musicUrl) : null;
  let scoreFallback: 'udio->musicgen' | null = null;
  if (!resolvedMusicUrl && process.env.REPLICATE_API_TOKEN) {
    // Match the score length to the assembled timeline so MusicGen returns a
    // track that spans every compiled clip rather than looping a short stub.
    const totalSec = Math.min(
      30,
      Math.max(8, Math.round(signedSegments.reduce((sum, s) => sum + (Number(s.durationSec) || 6), 0))),
    );
    const brief =
      typeof body.scorePrompt === 'string' && body.scorePrompt.trim()
        ? body.scorePrompt.trim()
        : 'emotional orchestral instrumental, cohesive cinematic film score';
    try {
      const score = await generateMusic(`${brief}, ${totalSec}-second continuous film score, instrumental`, totalSec);
      resolvedMusicUrl = score.audioUrl;
      scoreFallback = 'udio->musicgen';
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[assemble] MusicGen score fallback failed (film stays silent):', err instanceof Error ? err.message : err);
    }
  }

  const manifest: RunPodManifest = {
    segments: signedSegments,
    voiceoverUrl: body.voiceoverUrl ? await reSignIfInternal(body.voiceoverUrl) : null,
    musicUrl: resolvedMusicUrl,
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

        // FOUNDER PROMO — the user's FIRST 30-second film is free. consume_free_film
        // atomically burns the one free slot: >= 0 means it was granted (waive the
        // charge entirely), while -1 (none left) or null (RPC/migration absent)
        // fall through to the normal paid debit. This is FAIL-SAFE by construction:
        // we only ever skip the charge when the DB POSITIVELY confirms and decrements
        // a free slot — a missing migration can never become an infinite free loop.
        const freeFilm = await consumeFreeFilm(user.id);
        if (typeof freeFilm === 'number' && freeFilm >= 0) {
          ctx.bag.freeFilm = true;
          return lock;
        }

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
        // Hand the free slot back when a render that consumed it fails, so a
        // broken render never silently burns the user's one free film. Only ONE
        // of these branches runs — a free render never also debited credits.
        if (ctx.bag.freeFilm) await restoreFreeFilm(user.id);
        else if (ctx.bag.debited) await refundCredits(user.id, ASSEMBLE_COST, `assemble-rollback:${ctx.sagaId}`);
      },
    },
    {
      name: 'dispatch',
      run: async (ctx) => {
        // GPU worker when configured; else stitch on this node with CPU FFmpeg.
        const res = cfg
          ? await dispatchRunPod(cfg, { ...manifest, pipelineId: ctx.sagaId }, { signal: ctx.signal })
          : await assembleWithFfmpeg({ ...manifest, pipelineId: ctx.sagaId });
        ctx.bag.tempUrl = res.url;
        return res.url;
      },
      compensate: async (_r, ctx) => {
        // Only the RunPod path leaves a remote temp render to purge.
        const tempUrl = ctx.bag.tempUrl;
        const purge = process.env.RUNPOD_PURGE_WEBHOOK_URL;
        if (cfg && typeof tempUrl === 'string' && purge) {
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
    // PHASE 52 TASK 4 — free the idempotency reservation the instant the job
    // fails so the user can retry immediately instead of waiting out the 60s
    // double-click window on a render they already paid (and got refunded) for.
    await releaseIdempotencyKey(user.id, `assemble:${idemKey}`);
    // PHASE 47 §1 — record the terminal failure so the tracker stops claiming
    // 'assembling' forever; the client's amber fallback already covers the UX.
    if (filmTokenId) await recordFilmFailed(filmTokenId, String(saga.error || 'assembly failed'));
    return NextResponse.json(
      { error: 'assembly_failed', failedStep: saga.failedStep, message: saga.error, compensated: saga.compensatedSteps },
      { status: 502 },
    );
  }

  // PHASE 47 §1 — stamp the finished hosted master onto the unified tracker so a
  // reload / second device can recover the playable 30s film without re-rendering.
  if (filmTokenId && resultUrl) await recordFilmMaster(filmTokenId, resultUrl);

  return NextResponse.json({ url: resultUrl, sagaId: saga.sagaId, filmTokenId, scoreFallback, freeFilm: Boolean(bag.freeFilm) });
}
