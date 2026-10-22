import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';
import { NextRequest, NextResponse } from 'next/server';
import { guardGeneration, insufficientCreditsMessage } from '@/lib/api/generationGuard';
import { deductCredits } from '@/lib/orchestrator/ledger';
import { ledgerUnavailableBody } from '@/lib/api/billingCopy';
import { creditCostFor } from '@/lib/credits/pricing';
import { recordCompletedFilm } from '@/lib/orchestrator/jobs';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

/**
 * Re-host a finished HeyGen render onto our own storage.
 *
 * FAIL-OPEN: any miss returns the provider URL, because a short-lived link still plays right now and a
 * hard failure here would break a delivery the user has already been charged for. The size floor
 * rejects an error page served with a 200; the ceiling keeps a runaway download out of the lambda.
 * Mirrors rehostPresenterVideo in app/api/heygen/presenter/route.ts.
 */
async function rehostAvatarVideo(providerUrl: string): Promise<string> {
  try {
    const r = await fetch(providerUrl, { signal: AbortSignal.timeout(45_000) });
    if (!r.ok) return providerUrl;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength < 1024 || buf.byteLength > 80 * 1024 * 1024) return providerUrl;
    const path = `avatar/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    return (await uploadAndSign('renders', path, buf.toString('base64'), 'video/mp4', 604_800)) || providerUrl;
  } catch {
    return providerUrl;
  }
}


export const dynamic = 'force-dynamic';
// The GET re-hosts a finished render (up to 80 MB).
export const maxDuration = 300;

const HEYGEN_BASE = 'https://api.heygen.com';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * All HeyGen provider fetches share a request timeout so one stalled call can't pin the 300s lambda —
 * the /v2/avatars list is documented (presenter route) as unusably slow (>40s). On timeout the caller's
 * existing try/catch / !res.ok path fires → the same 502/fallback already produced. Additive.
 */
const HEYGEN_TIMEOUT_MS = 30_000;
async function heygenFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(HEYGEN_TIMEOUT_MS) });
}

// ─── Route handler ────────────────────────────────────────────────────────────
// POST used to start a HeyGen avatar video. HeyGen has no Google engine, so every start is refused with 503 google_only
// before any charge or provider call, whatever MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1, lib/providers/mediaPolicy).
// GET ?videoId= stays open, so a video started before this change still finishes.

export async function POST(req: NextRequest) {
  return refuseOutsideEngine(req);
}

// GET ?videoId=xxx — lightweight status check, called by client every 5 s
export async function GET(req: NextRequest) {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'HEYGEN_API_KEY not configured' }, { status: 500 });

  // FINANCIAL SHIELD — auth-only (a poll starts no new compute, so it is NOT balance-gated).
  const guard = await guardGeneration(req, 'avatar', { gate: false });
  if (!guard.ok) return guard.response;

  const videoId = req.nextUrl.searchParams.get('videoId');
  if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 });

  try {
    const res = await heygenFetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
      headers: { 'X-Api-Key': apiKey },
    });
    if (!res.ok) throw new Error(`HeyGen status ${res.status}`);

    const data = await res.json() as {
      data?: { status?: string; video_url?: string; thumbnail_url?: string; duration?: number; error?: string };
    };
    const d = data.data ?? {};

    // Charge on COMPLETION (never at dispatch → a failed render is never billed). deduct_credits is
    // ref-idempotent on `avatar:<videoId>`, so the client polling every 5s after completion charges
    // exactly ONCE. Best-effort: the asset is already produced, so a ledger hiccup never fails the poll,
    // and deduct_credits rejects overdraw (the balance can never go negative).
    // ⚠️ CHARGED, THEN HANDED BACK A URL THAT DIES WITHIN THE HOUR. This route billed the user and
    // returned HeyGen's RAW provider URL — no re-host, no generation_jobs row. HeyGen's links expire in
    // roughly an hour, so the user paid for a video that was unreachable by the time they came back to
    // it, and the Library never knew it existed. The presenter route already re-hosts for exactly this
    // reason; this one was simply never given the same treatment.
    let delivered: string | null = d.video_url ?? null;
    if (d.status === 'completed' && d.video_url) {
      // ⚠️ THE VIDEO IS HANDED OVER ONLY ONCE ITS CHARGE LANDED. This was `void deductCredits(...).catch(() => {})`
      // beside a delivery that happened regardless — so a deduct that failed (parallel POSTs that all passed one stale
      // balance read, or a ledger error) was a FREE avatar video, and a frozen lambda could drop the `void` charge
      // outright. Awaited now, before the re-host: a short balance withholds the video (402 — the next poll after a
      // top-up delivers it, same idempotent ref), a ledger failure 503s; `skipped` (no ledger RPC) still delivers.
      const debit = await deductCredits(guard.userId, creditCostFor('avatar'), `avatar:${videoId}`);
      if (!debit.ok && debit.reason === 'insufficient') {
        return NextResponse.json({ status: 'payment_required', url: null, error: 'insufficient_credits', message: insufficientCreditsMessage(guard.locale) }, { status: 402 });
      }
      if (!debit.ok && debit.reason === 'error') {
        return NextResponse.json({ status: 'processing', url: null, ...ledgerUnavailableBody(guard.locale) }, { status: 503 });
      }
      delivered = await rehostAvatarVideo(d.video_url);
      // Deterministic id per videoId, so the client's repeated polls UPSERT ONE row.
      // service_type stays 'film' — the DB CHECK allows only film|avatar|interior|image|music|voice,
      // so the descriptive label rides in `subtype`.
      await recordCompletedFilm({
        id: `heygen:${videoId}`,
        userId: guard.userId,
        url: delivered,
        subtype: 'avatar',
      }).catch(() => { /* filing is best-effort; the asset is already delivered */ });
    }

    return NextResponse.json({
      status:       d.status    ?? 'processing',
      url:          delivered,
      thumbnail:    d.thumbnail_url ?? null,
      duration:     d.duration  ?? null,
      error:        d.error     ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Status check failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
