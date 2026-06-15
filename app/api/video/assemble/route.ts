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
import { isAdminUser } from '@/lib/chat/filmComposite';
import { consumeFreeFilm, restoreFreeFilm } from '@/lib/billing/wallet-ledger';
import { reSignIfInternal } from '@/lib/orchestrator/storage-adapter';
import { assembleWithFfmpeg } from '@/lib/orchestrator/ffmpeg-assembly';
import { type QaReport } from '@/lib/orchestrator/masterQa';
import { recordFilmAssembling, recordFilmMaster, recordFilmFailed } from '@/lib/chat/filmStatusStore';
import { recordCompletedFilm } from '@/lib/orchestrator/jobs';
import { generateMusic } from '@/lib/ai/replicate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // CPU FFmpeg stitch of a 30s master needs headroom (Pro)

const ASSEMBLE_COST = 20; // credits to stitch a composition

// Atomic dispatch deadline. A render that stalls mid-stitch (a clip URL that
// never resolves, a render-node stream that hangs at ~38%) must NOT be allowed
// to pin the function until the platform hard-kills it at maxDuration — a hard
// kill skips the saga rollback entirely, stranding the user's reserved free
// slot / debited GEL with nothing to give it back. We give dispatch a deadline
// strictly below maxDuration (300s) so the timeout fires *inside* the function:
// it aborts the in-flight work and throws, which trips the saga compensate that
// releases the lock and hands the slot/credits back instantly. Override with
// ASSEMBLE_DISPATCH_TIMEOUT_MS; clamped to a sane [30s, 290s] window.
const DISPATCH_TIMEOUT_MS = (() => {
  const raw = Number(process.env.ASSEMBLE_DISPATCH_TIMEOUT_MS);
  const fallback = 270_000; // 30s headroom under maxDuration for compensate + response
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(290_000, Math.max(30_000, Math.round(raw)));
})();

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
  /** Music OFF → skip score generation entirely (voice-only film). */
  noMusic?: boolean;
  sfxUrl?: string | null;
  globalRender?: Record<string, string | number | boolean>;
  /** 'vertical' → 9:16 (1080×1920) master for TikTok/Reels/Shorts; else 16:9. */
  orientation?: string;
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

  // Anonymous trial renders are allowed. The expensive part — rendering the 5
  // clips — already runs for anonymous callers (dispatch is open), so gating ONLY
  // the cheap final stitch left users with rendered-but-unusable clips and the
  // "could not host the final master" dead-end. Anonymous renders skip the credit
  // / free-film saga entirely (there is no wallet to charge); the full billing
  // saga still runs unchanged for signed-in users.
  const { user } = await authedClientFromRequest(req);
  const uid = user?.id ?? null;

  // PHASE 47 §1 — flip the unified tracker to 'assembling' so a polling client
  // (or a reload) sees the editor working, not a stalled 'ready'. Fail-open.
  const filmTokenId = typeof body.filmTokenId === 'string' && body.filmTokenId.trim() ? body.filmTokenId.trim() : null;
  if (filmTokenId) await recordFilmAssembling(filmTokenId);

  // Idempotency — block duplicate submissions of the same composition. Anonymous
  // callers key off the film token (or a constant) since there is no user id.
  const idemOwner = uid ?? `anon:${filmTokenId ?? 'session'}`;
  const idemKey = await hashPayload({ u: idemOwner, segs: segments.map(s => s.url), v: body.voiceoverUrl, m: body.musicUrl });
  const fresh = await claimIdempotencyKey(idemOwner, `assemble:${idemKey}`, 60);
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
  if (!resolvedMusicUrl && !body.noMusic && process.env.REPLICATE_API_TOKEN) {
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
      // BUDGET GUARD — MusicGen runs synchronously BEFORE the saga dispatch, so an
      // unbounded cold-boot could eat the function's maxDuration (300s) and leave no
      // headroom for the CPU stitch, hard-killing the request and stranding the
      // reserved credits. Cap the score at 120s: long enough for a warm/cold render,
      // short enough to leave the stitch its full window. A timeout degrades to a
      // silent film (never a failed render).
      const SCORE_BUDGET_MS = 120_000;
      const score = await Promise.race([
        generateMusic(`${brief}, ${totalSec}-second continuous film score, instrumental`, totalSec),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('musicgen score timed out')), SCORE_BUDGET_MS)),
      ]);
      resolvedMusicUrl = score.audioUrl;
      scoreFallback = 'udio->musicgen';
      // eslint-disable-next-line no-console
      console.log('[assemble] MusicGen score ready:', resolvedMusicUrl ? 'yes' : 'no');
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
    globalRender: {
      // A film hard-cuts between scenes so the stitched master is EXACTLY
      // N·clipSec (5·6 = 30s) — no xfade (N−1)s shortfall, no pad-freeze tail.
      // This is the honest "exactly 30 seconds" fix and the beat-synced grammar a
      // music video wants. An explicit caller transition still wins (spread after).
      ...(filmTokenId ? { transition: 'cut' } : {}),
      ...(body.globalRender ?? {}),
      ...(body.orientation ? { orientation: String(body.orientation) } : {}),
    },
    pipelineId: '',
    callbackUrl: new URL('/api/video/assemble/callback', req.url).toString(),
  };

  // Saga: reserve credits (Redis lock + durable ledger debit) → dispatch →
  // commit. Failure releases the lock AND refunds the durable debit, and
  // best-effort purges the partial render.
  // Founder/admin renders run on the platform's own provider budget, so the
  // personal credit charge is skipped (their wallet may legitimately be 0 while
  // the platform LTX balance funds the real render). Billed exactly like anon.
  const skipBilling = uid === null ? true : await isAdminUser(uid);

  const steps: SagaStep[] = [
    {
      name: 'reserve-credits',
      run: async (ctx) => {
        if (skipBilling) {
          // Anonymous trial OR founder/admin — nothing to reserve, no charge.
          ctx.bag.freeFilm = true;
          return null;
        }
        if (uid === null) return null; // unreachable past skipBilling — narrows uid to string
        const lock = await lockTokens(uid, ASSEMBLE_COST, 900);
        ctx.bag.lock = lock;

        // FOUNDER PROMO — the user's FIRST 30-second film is free. consume_free_film
        // atomically burns the one free slot: >= 0 means it was granted (waive the
        // charge entirely), while -1 (none left) or null (RPC/migration absent)
        // fall through to the normal paid debit. This is FAIL-SAFE by construction:
        // we only ever skip the charge when the DB POSITIVELY confirms and decrements
        // a free slot — a missing migration can never become an infinite free loop.
        const freeFilm = await consumeFreeFilm(uid);
        if (typeof freeFilm === 'number' && freeFilm >= 0) {
          ctx.bag.freeFilm = true;
          return lock;
        }

        const debit = await deductCredits(uid, ASSEMBLE_COST, `assemble:${ctx.sagaId}`);
        ctx.bag.debited = debit.ok;
        // Fail-fast on a real rejection so we never dispatch a paid render
        // the user can't afford or that the DB couldn't record. 'skipped'
        // (RPC not provisioned) is the only non-fatal miss.
        if (!debit.ok && debit.reason === 'insufficient') throw new Error('insufficient credits');
        if (!debit.ok && debit.reason === 'error') throw new Error('credit ledger unavailable');
        return lock;
      },
      compensate: async (_r, ctx) => {
        if (skipBilling || uid === null) return; // anon / founder reserved nothing to roll back
        const lock = ctx.bag.lock as TokenLock | null | undefined;
        if (lock) await releaseTokenLock(lock);
        // Hand the free slot back when a render that consumed it fails, so a
        // broken render never silently burns the user's one free film. Only ONE
        // of these branches runs — a free render never also debited credits.
        if (ctx.bag.freeFilm) await restoreFreeFilm(uid);
        else if (ctx.bag.debited) await refundCredits(uid, ASSEMBLE_COST, `assemble-rollback:${ctx.sagaId}`);
      },
    },
    {
      name: 'dispatch',
      run: async (ctx) => {
        // ATOMIC DISPATCH DEADLINE — race the stitch against a hard timer. We
        // chain a local AbortController off the request signal (Stop button /
        // disconnect) AND the deadline, so whichever trips first cancels the
        // in-flight render: the RunPod fetch and the CPU FFmpeg downloads/exec
        // both honor this signal. On timeout we reject, which fails the saga and
        // runs reserve-credits' compensate — the user's free slot / GEL is
        // returned instantly instead of being stranded by a silent hang.
        const ac = new AbortController();
        const abort = () => ac.abort();
        if (ctx.signal) {
          if (ctx.signal.aborted) ac.abort();
          else ctx.signal.addEventListener('abort', abort, { once: true });
        }
        let timer: ReturnType<typeof setTimeout> | null = null;
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            ac.abort();
            reject(new Error(`dispatch stalled — aborted after ${DISPATCH_TIMEOUT_MS}ms`));
          }, DISPATCH_TIMEOUT_MS);
        });
        try {
          // GPU worker when configured; else stitch on this node with CPU FFmpeg.
          const work = cfg
            ? dispatchRunPod(cfg, { ...manifest, pipelineId: ctx.sagaId }, { signal: ac.signal })
            : assembleWithFfmpeg({ ...manifest, pipelineId: ctx.sagaId }, ac.signal);
          const res = await Promise.race([work, deadline]);
          ctx.bag.tempUrl = res.url;
          // Supervisor QA verdict (CPU path only; RunPod path returns no qa).
          ctx.bag.qa = (res as { qa?: QaReport }).qa ?? null;
          return res.url;
        } finally {
          if (timer) clearTimeout(timer);
          if (ctx.signal) ctx.signal.removeEventListener('abort', abort);
        }
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
    await releaseIdempotencyKey(idemOwner, `assemble:${idemKey}`);
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
  // The Supervisor QA verdict rides along so the recovered film carries its grade.
  const qa = (bag.qa as QaReport | null | undefined) ?? null;
  const qaSummary = qa ? { pass: qa.pass, score: qa.score, grade: qa.grade, issues: qa.issues.map((i) => i.code) } : null;
  if (filmTokenId && resultUrl) await recordFilmMaster(filmTokenId, resultUrl, qaSummary);

  // Task 2 — persist the finished film into the user's durable per-user Library
  // (generation_jobs). The studio renders through orchestrate→assemble, not the
  // produce routes, so without this the film would never appear in History. Only
  // for signed-in users (anonymous trials have no account to file it under).
  // Best-effort + fail-open: keyed by the film token so a re-stamp upserts.
  if (uid && resultUrl) {
    await recordCompletedFilm({
      id: filmTokenId || saga.sagaId,
      userId: uid,
      url: resultUrl,
      prompt: typeof body.scorePrompt === 'string' ? body.scorePrompt : null,
      orientation: body.orientation ? String(body.orientation) : 'landscape',
      result: { url: resultUrl, qa: qaSummary, kind: 'film' },
    });
  }

  return NextResponse.json({ url: resultUrl, qa, sagaId: saga.sagaId, filmTokenId, scoreFallback, freeFilm: Boolean(bag.freeFilm) });
}
