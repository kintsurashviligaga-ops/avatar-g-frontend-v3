import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';
import { NextRequest, NextResponse } from 'next/server';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { deductCredits, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { failJob, recordCompletedFilm } from '@/lib/orchestrator/jobs';
import { classifyProviderError } from '@/lib/api/providerError';
import { creditCostFor } from '@/lib/credits/pricing';
import { chargeForPolledId } from '@/lib/billing/avatarCharge';

/**
 * /api/heygen/presenter — "Presenter mode": a HeyGen presenter face speaking a script in the cloned Georgian voice.
 *
 * HeyGen has no Google engine (MASTER TASK v3.1), so both start phases (Phase A: the TTS line; Phase B: the
 * talking_photo submit) are refused before any TTS, charge, upload or provider call. GET ?id=<videoId> stays open, so a
 * presenter started before this change still polls to its re-hosted result, and a reserved render's terminal failure
 * still refunds its reservation exactly once.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120; // headroom for the final-poll re-host (fetch + Supabase upload)

const HEYGEN_BASE = 'https://api.heygen.com';

/** Re-host a finished HeyGen presenter video to a stable 7-day Supabase URL. HeyGen's
 *  result URL expires (~1h) → blank player on revisit (the same issue the photo lip-sync
 *  path already re-hosts to avoid). Fail-open: any miss returns the raw provider URL. */
async function rehostPresenterVideo(providerUrl: string): Promise<string> {
  try {
    const r = await fetch(providerUrl, { signal: AbortSignal.timeout(45_000) });
    if (!r.ok) return providerUrl;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength < 1024 || buf.byteLength > 80 * 1024 * 1024) return providerUrl;
    const path = `presenter/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    return (await uploadAndSign('renders', path, buf.toString('base64'), 'video/mp4', 604_800)) || providerUrl;
  } catch {
    return providerUrl;
  }
}

/** Both start phases: refused before any charge, upload or provider call, whatever MEDIA_GOOGLE_ONLY says. */
export async function POST(req: NextRequest) {
  return refuseOutsideEngine(req);
}

/**
 * Refund a RESERVED presenter whose HeyGen render ended without a video, then close its durable row — in that order,
 * so a refund that did not land leaves the row live for the settle cron to retry. TRUE only when credits went back.
 */
async function refundReserved(charge: { u: string; r: string } | null, videoId: string, reason: string): Promise<boolean> {
  if (!charge) return false;
  const r = await refundDebitByRef(charge.u, charge.r, creditCostFor('avatar')).catch(() => null);
  if (r?.ok || r?.reason === 'skipped') await failJob(`presenter:${videoId}`, reason).catch(() => undefined);
  return !!r?.ok;
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return NextResponse.json({ done: true, error: 'HeyGen not configured' }, { status: 503 });
  const polledId = new URL(req.url).searchParams.get('id');
  if (!polledId) return NextResponse.json({ done: true, error: 'id required' }, { status: 400 });
  // A presenter started by the current POST carries its charge token inside the id (lib/billing/avatarCharge):
  // `id` is the bare HeyGen videoId, `charge` is non-null only for an authentic token bound to exactly this video.
  const { jobId: id, charge } = chargeForPolledId(polledId, 'presenter');
  try {
    // 10s timeout so a stalled HeyGen status call fails fast (→ {done:false}, client
    // re-polls on its next tick) instead of holding the function until maxDuration.
    const st = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(id)}`, { headers: { 'X-Api-Key': apiKey }, signal: AbortSignal.timeout(10_000) });
    if (!st.ok) return NextResponse.json({ done: false });
    const sj = (await st.json()) as { data?: { status?: string; video_url?: string; error?: unknown } };
    const status = sj.data?.status;
    if (status === 'completed' && sj.data?.video_url) {
      // Re-host so the player URL survives past HeyGen's ~1h expiry.
      const hosted = await rehostPresenterVideo(sj.data.video_url);
      // BILLING FIX — presenter mode produced a talking video for FREE (same avatar leak class).
      // Charge once on completion, idempotent per videoId; authed only; best-effort.
      // ⚠️ A RESERVED video (token present) was paid at POST — deducting here too would bill it twice. The legacy
      // deduct only covers ids with no token: presenters started before the reservation shipped.
      try {
        const { user: sessionUser } = charge ? { user: null } : await authedClientFromRequest(req);
        const payerId = charge?.u ?? sessionUser?.id ?? null;
        if (payerId) {
          if (!charge) {
            await deductCredits(payerId, creditCostFor('avatar'), `avatar:presenter:${id}:${payerId}`)
              .catch(() => { /* best-effort — the asset is already delivered */ });
          }
          // ⚠️ CHARGED, DELIVERED, AND THEN LOST. This route re-hosts the video and takes the credit,
          // but never wrote a generation_jobs row — so the Library never saw it and the only reference
          // was the URL sitting in the client's React state. Close the tab and the thing the user just
          // paid for was gone, with a signed URL that expires anyway.
          // The id is deterministic per HeyGen videoId, so the client's repeated 6s polls UPSERT ONE row
          // rather than filing a duplicate on every tick.
          // ⚠️ service_type stays 'film': generation_jobs carries a DB CHECK limited to
          // film|avatar|interior|image|music|voice, so 'presenter' would be REJECTED and the asset
          // silently lost again. The distinguishing label rides in `subtype`, which is what it is for.
          await recordCompletedFilm({
            id: `presenter:${id}`,
            userId: payerId,
            url: hosted,
            orientation: 'vertical',
            subtype: 'presenter',
          }).catch(() => { /* the asset is delivered; filing is best-effort */ });
        }
      } catch { /* fail-open */ }
      return NextResponse.json({ done: true, url: hosted });
    }
    if (status === 'failed') {
      // Guard against a missing/non-string error — JSON.stringify(undefined) is `undefined`
      // and .slice() on it throws, which would mask the failure as "still processing".
      const e = sj.data?.error;
      const reason = e ? (typeof e === 'string' ? e : JSON.stringify(e)) : 'render failed';
      // Terminal failure of a RESERVED render → give the reservation back. HeyGen's own verdict for the video the
      // signed token is bound to — never a client claim — and net-capped + idempotent, so repeated polls refund once.
      const refunded = await refundReserved(charge, id, reason);
      // HeyGen's own words stay server-side; the client maps the code and says "refunded" only when it was.
      return NextResponse.json({ done: true, error: classifyProviderError(reason), refunded });
    }
    // ⚠️ COMPLETED WITHOUT A FILE IS A FAILURE, NOT "STILL WORKING". It missed the `completed && video_url` branch
    // above and used to fall through to `{done:false}` on every poll: the reservation was never refunded, and after
    // ~9 min the client gave up on a render that had in fact ended. Same rule as the lip-sync GET's `succeeded`
    // without a url.
    if (status === 'completed') {
      const refunded = await refundReserved(charge, id, 'the provider finished without a usable video file');
      return NextResponse.json({ done: true, error: 'provider_unavailable', refunded });
    }
    return NextResponse.json({ done: false });
  } catch {
    return NextResponse.json({ done: false });
  }
}
