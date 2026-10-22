/**
 * /api/video/lipsync — the talking photo and the film lip-sync pass (HeyGen, Replicate SadTalker / sync).
 *
 * POST is refused before any TTS, charge or provider call: none of those engines is Google (MASTER TASK v3.1,
 * lib/providers/mediaPolicy). GET stays open, so a job started before this change still polls to its result, and a
 * reserved job's terminal failure still refunds its reservation exactly once.
 */
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';
import { NextRequest, NextResponse } from 'next/server';
import { lipsyncFetch, lipsyncStatus } from '@/lib/ai/lipsync';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { deductCredits, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';
import { chargeForPolledId } from '@/lib/billing/avatarCharge';
import { failJob, recordCompletedFilm } from '@/lib/orchestrator/jobs';
import { reportError } from '@/lib/observability/report-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // the GET re-hosts a finished render (up to 80 MB)

/**
 * GET — without ?id: names-only readiness probe. With ?id=<predictionId>: poll that
 * lip-sync job ONCE → { done, url } when finished (re-hosted to Supabase), or
 * { done:false } while still rendering. This short-request polling is what makes the
 * ~150s SadTalker render survive mobile networks (a single long fetch gets dropped).
 */
export async function GET(req: NextRequest) {
  // HeyGen has no Google engine (MASTER TASK v3.1): its paid self-test is refused, and the readiness probe the film
  // calls before its lip-sync stage answers "unavailable" at once, so the film skips that stage with its usual line.
  if (req.nextUrl.searchParams.get('selftest') === 'heygen') return refuseOutsideEngine(req);
  if (req.nextUrl.searchParams.get('health') === 'heygen') return NextResponse.json({ ok: false, reason: 'google_only' });
  const polledId = req.nextUrl.searchParams.get('id');
  if (!polledId) return NextResponse.json(lipsyncStatus());
  // A job started by the current POST carries its charge token inside the id (lib/billing/avatarCharge). `id` is
  // the bare provider job; `charge` is non-null only for an authentic token bound to exactly this job.
  const { jobId: id, charge } = chargeForPolledId(polledId, 'lipsync');
  // Terminal failure of a RESERVED job → give the reservation back, THEN close the durable row (so the settle cron,
  // which only reads live rows, retries a refund that did not land). Net-capped by the ledger and idempotent
  // (`${ref}:refund`), so repeated polls — and the cron — refund once. Resolves TRUE only when credits went back.
  const refundReserved = async (reason: string): Promise<boolean> => {
    if (!charge) return false;
    const r = await refundDebitByRef(charge.u, charge.r, creditCostFor('avatar')).catch(() => null);
    if (r?.ok || r?.reason === 'skipped') await failJob(`lipsync:${id}`, reason).catch(() => undefined);
    return !!r?.ok;
  };

  const { status, url, error } = await lipsyncFetch(id);
  if (status === 'succeeded' && url) {
    // Re-host the talking video to a stable Supabase URL (the provider URL expires ~1h).
    let hosted = url;
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 45_000); // route has 300s headroom; fewer fail-opens to the expiring URL
      const r = await fetch(url, { signal: ac.signal }).finally(() => clearTimeout(to));
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.byteLength && buf.byteLength <= 80 * 1024 * 1024) {
          const path = `lipsync/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
          const signed = await uploadAndSign('renders', path, buf.toString('base64'), 'video/mp4', 604_800);
          if (signed) hosted = signed;
        }
      }
      // ⚠️ A FAIL-OPEN HERE IS NOT FREE, AND IT WAS SILENT. Keeping the provider URL means the row that
      // gets filed carries an EXTERNAL url, which the Library's re-signer cannot resolve
      // (parseSupabaseObjectUrl returns null for a non-Supabase host) — so it is skipped on read and the
      // card is dead the moment the provider link expires. Delivering the short-lived URL is still the
      // right call over failing a render the user paid for, but it must be observable: a rising count
      // here is exactly the signal that Library entries are quietly rotting.
    } catch (e) {
      reportError(e, { route: 'video.lipsync', step: 'rehost' });
      /* fail-open — keep the provider URL */
    }
    // BILLING FIX — avatar/lip-sync billing was DEFERRED to "its own pipeline" and never wired, so
    // avatar generation was FREE. Charge once on poll-SUCCESS, idempotent per jobId (repeated polls
    // reuse the same ref → deduct_credits dedupes → one charge). Authed only; best-effort.
    // ⚠️ A RESERVED job (token present) was paid at POST — deducting here too would bill it twice. The legacy
    // deduct below only covers ids with no token: jobs started before the reservation shipped.
    try {
      const { user: sessionUser } = charge ? { user: null } : await authedClientFromRequest(req);
      const payerId = charge?.u ?? sessionUser?.id ?? null;
      if (payerId) {
        if (!charge) {
          await deductCredits(payerId, creditCostFor('avatar'), `avatar:lipsync:${id}:${payerId}`)
            .catch(() => { /* best-effort — the asset is already delivered */ });
        }
        // AND FILE IT IN THE LIBRARY. Nothing in the lip-sync path ever wrote a generation_jobs row, so
        // a user was CHARGED for the render, watched it, and lost it permanently on refresh — the
        // Lip-Sync Studio has no save control at all, and only the browser Download link (which they had
        // to notice and click inside the session) preserved anything. Charging for work the product then
        // throws away is the worst version of this bug, which is why it sits next to the deduct.
        // The id is deterministic per provider job, so repeated polls upsert ONE row.
        await recordCompletedFilm({
          id: `lipsync:${id}`,
          userId: payerId,
          url: hosted,
          orientation: 'vertical',
          subtype: 'lipsync',
        }).catch(() => { /* best-effort — never fail a delivered asset over its bookkeeping */ });
      }
    } catch { /* fail-open */ }
    return NextResponse.json({ done: true, url: hosted });
  }
  if (status === 'failed' || status === 'canceled') {
    const refunded = await refundReserved(error || 'render failed');
    // ⚠️ `error` STAYS THE PROVIDER'S RAW TEXT HERE, DELIBERATELY: it is MACHINE INPUT, not copy. The avatar composer
    // reads it to tell SadTalker's known transient crash ('ANTIALIAS', CUDA/OOM — lib/avatar/renderAttempts) from a
    // real failure and retries only the former; a sanitised code would silently end every such retry. No client
    // renders it verbatim (OmniStudio ignores it, LipsyncStudio/MotionControlPanel map it through their own copy).
    return NextResponse.json({ done: true, url: null, error, refunded });
  }
  // ⚠️ A TERMINAL STATUS WITH NO URL USED TO FALL THROUGH TO `{done:false}` FOREVER. `lipsyncFetch`
  // populates `url` only when the provider both SUCCEEDED and yielded a resolvable output — Replicate
  // via extractUrl(pred.output), HeyGen via `d.video_url ?? null`. So a job that genuinely completed but
  // whose output could not be resolved (an empty HeyGen video_url, an output shape extractUrl does not
  // match) missed the `succeeded && url` branch above AND the failed/canceled branch, and answered
  // "still working" on every poll from then on.
  //
  // Nothing ever ended it: LipsyncStudio polls 120×5s and OmniStudio 70×6s across 3 attempts (~21
  // minutes) before giving up with "try different files" — blaming the user's input for a render that
  // completed and was paid for. This is the identical dead end that /api/v2/model3d/status documents and
  // fixed ("TERMINAL WITHOUT A MESH IS A FAILURE, NOT 'STILL WORKING'"); it was never applied here.
  if (status === 'succeeded') {
    const refunded = await refundReserved('the provider finished without a usable video file');
    return NextResponse.json({ done: true, url: null, error: 'provider_unavailable', refunded });
  }
  return NextResponse.json({ done: false });
}

/**
 * POST — used to start a lip-sync job (ElevenLabs voice, then HeyGen or SadTalker). None of those render engines is
 * Google, so every start is refused before any TTS, charge, upload or provider call, whatever MEDIA_GOOGLE_ONLY says
 * (MASTER TASK v3.1, lib/providers/mediaPolicy).
 */
export async function POST(req: NextRequest) {
  return refuseOutsideEngine(req);
}
