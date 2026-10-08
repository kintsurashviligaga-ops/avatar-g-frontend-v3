import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { georgianVoiceId } from '@/lib/audio/georgian-voice';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { deductCredits, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { createJob, failJob, recordCompletedFilm } from '@/lib/orchestrator/jobs';
import { settleParams } from '@/lib/orchestrator/unpolledSettle';
import { classifyProviderError } from '@/lib/api/providerError';
import { reportError } from '@/lib/observability/report-error';
import { creditCostFor } from '@/lib/credits/pricing';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { PRESENTER_DEFAULT_FACE_URL, audioFingerprint, avatarChargeRef, avatarChargeSigningReady, chargeForPolledId, holdReleasableFor, signAvatarCharge, verifyAvatarCharge, withChargeToken } from '@/lib/billing/avatarCharge';
import { randomUUID } from 'crypto';
import { fetchPublicBytes } from '@/lib/web/publicFetch';

/**
 * /api/heygen/presenter — "Presenter mode"
 * ========================================
 * A consistent HeyGen presenter speaks a script in the user's CLONED GEORGIAN VOICE.
 * We synthesize the line with our cloned eleven_v3 voice first, host it, then drive
 * a DEFAULT presenter face through HeyGen's fast `talking_photo` path with
 * `voice.type:'audio'` so the lips track native Georgian.
 *
 * WHY talking_photo (not a stock `avatar`): HeyGen's /v2/avatars list is unusably
 * slow on our account (>40s — it was the root of the original gateway 504s). The
 * talking_photo upload host (/v1/talking_photo) is fast and is the same proven path
 * the photo-driven lip-sync uses, so the presenter rides a default bundled face.
 *
 * TWO-PHASE START + POLL (mobile-safe, neither request nears the gateway limit):
 *   POST { text, orientation? }   → { success, phase:'synthesized', audioUrl }  (Phase A: TTS only, ~4s)
 *   POST { audioUrl, faceUrl? }   → { success, videoId, audioUrl }              (Phase B: talking_photo submit)
 *   GET  ?id=<videoId>            → { done, url, error }                         (quick poll)
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120; // headroom for the final-poll re-host (fetch + Supabase upload)

const HEYGEN_BASE = 'https://api.heygen.com';
/** Bundled default presenter portrait — pin to the CANONICAL public domain, never
 *  req.nextUrl.origin (on Vercel that can be the auth-protected *.vercel.app
 *  deployment host, which 401s the self-fetch). Overridable via env. */
const DEFAULT_FACE_URL = process.env.PRESENTER_FACE_URL || PRESENTER_DEFAULT_FACE_URL;

// SECURITY (audit HIGH — cross-tenant leak): the presenter face is a DEDICATED, non-user photo,
// NEVER an arbitrary account photo. HeyGen's talking_photo.list is shared across ALL users of
// this account, so reusing data[0] could serve another user's uploaded selfie as the "default
// presenter". We resolve a PINNED env photo, else a cached default-face upload, else upload the
// canonical placeholder — we NEVER enumerate the shared account's photos. Cached per warm instance.
let cachedTalkingPhotoId: string | null = null;

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

type ReserveOutcome = { ok: true; ref: string | null } | { ok: false; res: NextResponse };

/**
 * Reserve the avatar price under a fresh server ref before any paid work. Signed-in only (anonymous reaches here
 * only on a FILM_ALLOW_ANONYMOUS demo, which stays unbilled → ref null). Anything but a clean debit refuses:
 * ⚠️ the read-only hasSufficientBalance gate this replaces failed OPEN on a ledger error (its own try/catch AND the
 * helper's internal `return true`), so a DB blip was a free render, and parallel POSTs all passed one stale balance.
 */
async function reservePresenter(userId: string | null, kind: 'presenter' | 'presenter-tts'): Promise<ReserveOutcome> {
  if (!userId) return { ok: true, ref: null };
  if (!avatarChargeSigningReady()) {
    return { ok: false, res: NextResponse.json({ success: false, error: 'ledger_unavailable', code: 'ledger_unavailable' }, { status: 503 }) };
  }
  const ref = avatarChargeRef(kind, userId, randomUUID());
  const debit = await deductCredits(userId, creditCostFor('avatar'), ref);
  if (debit.ok) return { ok: true, ref };
  if (debit.reason === 'insufficient') {
    return { ok: false, res: NextResponse.json({ success: false, error: 'insufficient_credits', code: 'insufficient_credits', topUpNeeded: true }, { status: 402 }) };
  }
  return { ok: false, res: NextResponse.json({ success: false, error: 'ledger_unavailable', code: 'ledger_unavailable' }, { status: 503 }) };
}

export async function POST(req: NextRequest) {
  // Two POSTs per generation (synthesize + submit), so use the AI tier (10/min)
  // rather than EXPENSIVE (5/min) which a couple of generations would exhaust.
  const rl = await checkRateLimit(req, RATE_LIMITS.AI);
  if (rl) return rl;
  // ⚠️ SIGNED-IN ONLY (lib/auth/generationGate), before the body is read and before any TTS or HeyGen call. The old
  // balance gate applied to a signed-in caller only, so a direct anonymous POST got the cloned-voice
  // TTS and a HeyGen render on the platform's keys for free. FILM_ALLOW_ANONYMOUS=1 re-opens it for a demo.
  const { user } = await authedClientFromRequest(req);
  if (mustSignInToGenerate(user?.id)) {
    return NextResponse.json({ code: 'auth_required', ...signInToGenerateBody() }, { status: 401 });
  }
  const userId = user?.id ?? null;
  // The HeyGen key gates PHASE B ONLY. Phase A is pure ElevenLabs TTS and is the INPUT to the
  // SadTalker fallback tier — gating it here killed the very fallback that exists to cover a
  // missing HeyGen key, leaving presenter mode with ZERO working tiers. Gate moved to Phase B.
  const apiKey = process.env.HEYGEN_API_KEY?.trim();

  const body = (await req.json().catch(() => ({}))) as { text?: string; audioUrl?: string; faceUrl?: string; orientation?: 'landscape' | 'vertical' | 'square'; gender?: 'female' | 'male'; chargeToken?: unknown };
  const cost = creditCostFor('avatar');

  // ── PHASE A — synthesize the line in the CLONED Georgian voice → public mp3 url.
  // TTS only (no HeyGen calls here), so it stays ~4s — comfortably under 60s.
  if (!body.audioUrl) {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 });
    // HOLD the price before the TTS. The hold token handed back lets the NEXT phase (HeyGen submit, or the
    // SadTalker fallback on /api/video/lipsync) release it as it reserves its own render — so one presenter costs
    // one avatar price, and a TTS whose render is never started stays paid for.
    const hold = await reservePresenter(userId, 'presenter-tts');
    if (!hold.ok) return hold.res;
    // Honour the caller's Female/Male choice via the cloned-voice map; falls back to
    // the female clone when unspecified.
    const gender = body.gender === 'male' ? 'male' : 'female';
    const audioUrl = await textToHostedSpeech(text.slice(0, 1500), georgianVoiceId(gender)).catch(() => null);
    if (!audioUrl) {
      if (userId && hold.ref) await refundDebitByRef(userId, hold.ref, cost).catch(() => null);
      return NextResponse.json({ success: false, error: 'voice synthesis failed (no cloned-voice audio)' }, { status: 502 });
    }
    // The hold is bound to THIS audio (lib/billing/avatarCharge holdReleasableFor): only a render of exactly this
    // file, on the presenter face, may release it — never one the caller can make fail on purpose.
    const chargeToken = userId && hold.ref ? signAvatarCharge({ k: 'presenter-hold', u: userId, r: hold.ref, j: null, a: audioFingerprint(audioUrl) }) : null;
    // heygenReady tells the client whether Phase B is even worth attempting; when false it
    // goes straight to the SadTalker tier with this same audioUrl.
    return NextResponse.json({ success: true, phase: 'synthesized', audioUrl, heygenReady: !!apiKey, voiceProvider: 'elevenlabs:cloned-ka', ...(chargeToken ? { chargeToken } : {}) });
  }

  // ── PHASE B — drive the default presenter face with the hosted audio via HeyGen's
  // talking_photo path (upload + submit, both internally timeout-bounded → fast).
  // THIS is where the HeyGen key is actually required. A 503 here is non-fatal: the client
  // still has the Phase A audio and falls through to the Replicate SadTalker presenter.
  if (!apiKey) return NextResponse.json({ success: false, error: 'HeyGen not configured', code: 'heygen_not_configured' }, { status: 503 });
  const audioUrl = body.audioUrl;
  const faceUrl = body.faceUrl && /^https?:\/\//.test(body.faceUrl) ? body.faceUrl : DEFAULT_FACE_URL;

  // Release Phase A's hold, then reserve THIS render. Release-then-reserve (never "adopt"): a hold token replayed
  // N times releases once — refundDebitByRef is net-capped by the ledger — while every HeyGen render still reserves
  // its own price. Releasing first also means a user whose balance covers exactly one presenter is not refused.
  // ⚠️ Only toward the render the hold paid the voice for: Phase A's own audio on the default face. A different
  // `audioUrl` (or a custom face) is a render the caller can make fail — its refund would hand the TTS out free.
  const holdToken = verifyAvatarCharge(body.chargeToken, 'presenter-hold');
  if (userId && holdReleasableFor(holdToken, userId, { audioUrl, faceUrl })) await refundDebitByRef(userId, holdToken.r, cost).catch(() => null);
  const reserve = await reservePresenter(userId, 'presenter');
  if (!reserve.ok) return reserve.res;
  const chargeRef = reserve.ref;
  // Every exit below without a videoId means HeyGen rendered nothing for this reservation → give it back.
  const fail = async (payload: Record<string, unknown>, status: number): Promise<NextResponse> => {
    if (userId && chargeRef) await refundDebitByRef(userId, chargeRef, cost).catch(() => null);
    return NextResponse.json(payload, { status });
  };

  try {
    // Resolve a talking_photo_id SCOPED to a dedicated presenter face — never an arbitrary
    // shared-account photo (audit HIGH cross-tenant leak):
    //   1) PRESENTER_TALKING_PHOTO_ID env — a dedicated pinned presenter photo (the real fix)
    //   2) cached default-face upload from this warm instance
    //   3) upload the canonical DEFAULT_FACE_URL placeholder (or the caller's OWN faceUrl) — never
    //      another user's photo. We do NOT enumerate the shared account's talking_photo.list.
    const pinnedPhotoId = process.env.PRESENTER_TALKING_PHOTO_ID?.trim() || null;
    // ⚠️ The warm-instance cache holds the DEFAULT face only. It used to cache whatever was uploaded — a caller's own
    // faceUrl included — so the next caller on that instance was rendered with someone else's face.
    const customFace = faceUrl !== DEFAULT_FACE_URL;
    let talkingPhotoId = pinnedPhotoId || (customFace ? null : cachedTalkingPhotoId);
    if (!talkingPhotoId) {
      // A caller's faceUrl is a caller-chosen address: public only, redirects re-checked, an image, capped
      // (lib/web/publicFetch). The error names no status — it used to echo the target's HTTP status, a port scanner.
      let faceBytes: Uint8Array<ArrayBuffer> | null = null;
      let faceMime = 'image/jpeg';
      if (customFace) {
        const face = await fetchPublicBytes(faceUrl, { maxBytes: 10 * 1024 * 1024, accept: /^image\//, timeoutMs: 15_000 });
        if (face.ok) { faceBytes = new Uint8Array(face.bytes.byteLength); faceBytes.set(face.bytes); faceMime = face.contentType; }
      } else {
        const faceRes = await fetch(faceUrl, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
        if (faceRes?.ok) { faceMime = faceRes.headers.get('content-type') || faceMime; faceBytes = new Uint8Array(await faceRes.arrayBuffer()); }
      }
      if (!faceBytes?.byteLength) return fail({ success: false, error: 'presenter face unreachable' }, 502);
      const tpRes = await fetch('https://upload.heygen.com/v1/talking_photo', {
        method: 'POST', headers: { 'X-Api-Key': apiKey, 'Content-Type': faceMime }, body: faceBytes, signal: AbortSignal.timeout(30_000),
      }).catch(() => null);
      const tpText = tpRes ? await tpRes.text().catch(() => '') : '';
      if (!tpRes || !tpRes.ok) return fail({ success: false, error: `HeyGen talking_photo ${tpRes?.status ?? 'timeout'}`, detail: tpText.slice(0, 300) }, 502);
      try { talkingPhotoId = JSON.parse(tpText)?.data?.talking_photo_id ?? null; } catch { talkingPhotoId = null; }
    }
    if (!talkingPhotoId) return fail({ success: false, error: 'no dedicated presenter photo available — set PRESENTER_TALKING_PHOTO_ID' }, 502);
    // Cache ONLY a self-provisioned default-face upload; a pinned env id is already stable.
    if (!pinnedPhotoId && !customFace) cachedTalkingPhotoId = talkingPhotoId;

    // 2) Generate the audio-driven video. Capture HeyGen's actual reply.
    const dimension = body.orientation === 'vertical'
      ? { width: 720, height: 1280 }
      : body.orientation === 'square'
        ? { width: 720, height: 720 }
        : { width: 1280, height: 720 };
    const genRes = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
      method: 'POST', headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_inputs: [{ character: { type: 'talking_photo', talking_photo_id: talkingPhotoId, talking_photo_style: body.orientation === 'square' ? 'square' : 'normal' }, voice: { type: 'audio', audio_url: audioUrl } }], dimension }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    const genText = genRes ? await genRes.text().catch(() => '') : '';
    if (!genRes || !genRes.ok) return fail({ success: false, error: `HeyGen generate ${genRes?.status ?? 'timeout'}`, detail: genText.slice(0, 300) }, 502);
    const videoId = (() => { try { const j = JSON.parse(genText); return j?.data?.video_id ?? j?.video_id ?? null; } catch { return null; } })();
    if (!videoId || typeof videoId !== 'string') return fail({ success: false, error: 'HeyGen generate: no video_id', detail: genText.slice(0, 300) }, 502);

    // The charge token rides INSIDE videoId (lib/billing/avatarCharge): the client polls `?id=<videoId>` verbatim,
    // so the GET learns the job is paid without any client change — and never deducts it a second time.
    if (!userId || !chargeRef) return NextResponse.json({ success: true, videoId, audioUrl, voiceProvider: 'elevenlabs:cloned-ka' });
    const chargeToken = signAvatarCharge({ k: 'presenter', u: userId, r: chargeRef, j: videoId });
    if (!chargeToken) {
      // Unreachable while signing was ready at reserve time; if it ever happens, the bare id is charged by the
      // GET's legacy deduct, so the reservation must go back or the render is billed twice.
      if (chargeRef) await refundDebitByRef(userId, chargeRef, cost).catch(() => null);
      return NextResponse.json({ success: true, videoId, audioUrl, voiceProvider: 'elevenlabs:cloned-ka' });
    }
    // ⚠️ THE REFUND (AND THE LIBRARY FILING) USED TO LIVE ONLY IN THE BROWSER'S POLL: close the tab mid-render and a
    // failed presenter kept its reservation forever. The durable row — the id the GET's success write uses — carries
    // `_settle`, so the cron asks HeyGen for the verdict and delivers or refunds (same ref, idempotent with the GET).
    const filed = await createJob({
      id: `presenter:${videoId}`, userId, serviceType: 'film', status: 'processing',
      params: { subtype: 'presenter', ...settleParams({ kind: 'presenter', job: `heygen:${videoId}`, ref: chargeRef, credits: cost }) },
    });
    if (!filed) reportError(new Error('presenter settle row not filed'), { route: 'heygen.presenter', ref: chargeRef });
    return NextResponse.json({ success: true, videoId: withChargeToken(videoId, chargeToken), chargeToken, audioUrl, voiceProvider: 'elevenlabs:cloned-ka' });
  } catch {
    return fail({ success: false, error: 'presenter start failed' }, 500);
  }
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
