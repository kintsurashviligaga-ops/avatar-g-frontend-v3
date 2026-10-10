/**
 * POST /api/motion-control — animate a character photo with Kling (Replicate).
 * Body: { characterImageUrl (data-url or https), motionPrompt, duration?, aspectRatio? }. Image-to-video only:
 *         Replicate has no video-to-video Kling, and a `referenceVideoUrl` is ignored (see `method` below).
 *
 * ASYNC: Kling v2.1-master takes 3-7 min — a blocking wait 504s on Vercel (the
 * "Generate motion → HTTP 504" report). This route now only SUBMITS the job and
 * returns { jobId } in ~2s; the client polls GET /api/motion-control/status?id=…,
 * which finalizes (re-host + optional music) once Kling succeeds.
 */
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import sharp from 'sharp';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { klingSubmit, klingConfigured, KLING_MODELS } from '@/lib/ai/klingClient';
import { promptToEnglish } from '@/lib/ai/promptToEnglish';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { ownsUploadObject, resolveCallerMedia } from '@/lib/security/callerMedia';
import { createJob } from '@/lib/orchestrator/jobs';
import { hasSufficientBalance, deductCredits, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';
import { settleParams } from '@/lib/orchestrator/unpolledSettle';
import { motionChargeRef, motionChargeSigningReady, signMotionCharge, withMotionCharge } from '@/lib/services/motion/chargeToken';
import { billingLocale, ledgerUnavailableBody } from '@/lib/api/billingCopy';
import { classifyProviderError } from '@/lib/api/providerError';
import { reportError } from '@/lib/observability/report-error';
import { randomUUID } from 'node:crypto';
import { fetchPublicBytes } from '@/lib/web/publicFetch';

// A Motion Control render is a single short (5-10s) Kling i2v clip — priced as one paid video op, the
// same tier as a remix. The reservation is taken BEFORE the submit under a fresh server ref; the jobId handed back
// carries a signed charge token naming that ref (lib/services/motion/chargeToken), which /status reads to refund a
// failed render through the ledger.
const MOTION_COST = creditCostFor('remix');
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // submit-only — returns fast; the wait happens via /status polling

/**
 * Bake EXIF orientation into the START photo's pixels before Kling sees it. iPhone
 * photos store sideways pixels + an EXIF "rotate" tag; Kling's image loader reads raw
 * pixels and IGNORES EXIF → the generated video is born sideways (and carries no video
 * rotation flag, so the downstream -vf autorotate can't recover it). sharp's `.rotate()`
 * (no args) auto-applies the EXIF orientation and strips the tag → an upright frame.
 * Accepts data:/https/bare-storage-path. Fail-open → returns the original on any miss.
 */
async function normalizeStartImage(src: string, userId: string): Promise<string> {
  try {
    let buf: Buffer | null = null;
    if (src.startsWith('data:')) {
      const b64 = src.includes(',') ? src.split(',')[1] ?? '' : '';
      if (b64) buf = Buffer.from(b64, 'base64');
    } else if (/^https?:\/\//i.test(src)) {
      // A caller-chosen address: public only, every redirect re-checked, an image, at most 20 MB (lib/web/publicFetch).
      // It used to be a bare fetch — any URL, any size, redirects followed — and the result was re-hosted for the caller.
      const r = await fetchPublicBytes(src, { maxBytes: 20 * 1024 * 1024, accept: /^image\//, timeoutMs: 20_000 });
      if (r.ok) buf = r.bytes;
    } else {
      // A bare storage path: signed only for the caller who owns it (the POST refuses anyone else's first).
      const own = await resolveCallerMedia(src, userId, 3600);
      if (own.ok && own.own) { const r = await fetch(own.url, { signal: AbortSignal.timeout(20_000) }); if (r.ok) buf = Buffer.from(await r.arrayBuffer()); }
    }
    if (!buf?.byteLength) return src;
    const fixed = await sharp(buf).rotate().jpeg({ quality: 92 }).toBuffer();
    const path = `motion-control/${userId}/start-${Date.now()}.jpg`;
    return (await uploadBufferAndSign('renders', path, fixed, 'image/jpeg', 86_400)) || src;
  } catch {
    return src; // fail-open — Kling still gets the original photo
  }
}

export async function POST(req: Request) {
  // MEDIA_GOOGLE_ONLY (lib/providers/mediaPolicy): this entry reaches an outside engine, so the switch refuses it here,
  // before any charge. Off (the default) → no-op.
  const outside = refuseOutsideEngine(req);
  if (outside) return outside;
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const rl = await checkRateLimit(req as NextRequest, RATE_LIMITS.EXPENSIVE); if (rl) return rl; // paid Kling submit
  if (!klingConfigured()) return NextResponse.json({ error: 'video engine not configured' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as {
    characterImageUrl?: string; motionPrompt?: string;
    duration?: number; aspectRatio?: string; qualityMode?: string;
  } | null;
  const characterImageUrl = body?.characterImageUrl?.trim();
  const motionPrompt = body?.motionPrompt?.trim();
  if (!characterImageUrl || !motionPrompt) {
    return NextResponse.json({ error: 'characterImageUrl + motionPrompt required' }, { status: 400 });
  }
  // A bare storage path is read with the service role below, and the result comes back to the caller: it must be
  // their own upload (lib/security/callerMedia), never another account's photo.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(characterImageUrl) && !ownsUploadObject(characterImageUrl.replace(/^\/+/, ''), user.id)) {
    return NextResponse.json({ error: 'media_not_yours' }, { status: 403 });
  }
  // Billing gate — Motion Control was a REVENUE LEAK: it fired a paid Kling render with no charge. Gate
  // on balance up front (fail-open on read miss; the post-submit deduct is the real backstop) so a broke
  // user can't submit a paid render for free, then reserve the credits once the job is accepted below.
  if (!(await hasSufficientBalance(user.id, MOTION_COST))) {
    return NextResponse.json({ error: 'insufficient_credits', needed: MOTION_COST }, { status: 402 });
  }

  const duration: 5 | 10 = body?.duration === 10 ? 10 : 5;
  const aspectRatio = (['9:16', '16:9', '1:1'].includes(String(body?.aspectRatio)) ? body!.aspectRatio : '9:16') as '9:16' | '16:9' | '1:1';
  // ⚠️ ALWAYS PHOTO + DESCRIPTION. A `referenceVideoUrl` used to turn the reply into method 'v2v' while Kling rendered the
  // same image-to-video (Replicate's Kling has no video-to-video model): the user was told their video's motion was
  // copied when it was never read. It is ignored, and the reply and the job row say what actually ran.
  const method = 'i2v' as const;
  // Speed/quality → Kling model. fast = v1.6-pro (~3 min), quality = v2.1-master
  // (~12 min, best-looking). klingSubmit auto-adds cfg_scale for the v1.6 model.
  const modelName = body?.qualityMode === 'quality' ? KLING_MODELS.V21_MASTER : KLING_MODELS.V16_PRO;

  // Compose hint matching the chosen format. Kling ignores aspect_ratio with a
  // start_image (we post-fit via center-crop), but steering the SHOT to the target
  // framing keeps the subject upright + fully in-frame so the crop doesn't clip it.
  // Aspect-aware on purpose — a hardcoded "vertical/portrait" would mislabel 16:9/1:1.
  const ORIENT_HINT: Record<'9:16' | '16:9' | '1:1', string> = {
    '9:16': 'vertical portrait composition, subject upright and centered, full body in frame',
    '16:9': 'wide horizontal cinematic composition, subject centered and fully in frame',
    '1:1': 'square composition, subject centered and fully in frame',
  };
  // ⚠️ THIS FIELD ASKS FOR GEORGIAN BY NAME. The panel's placeholder is literally
  // "მოძრაობის აღწერა… (ქართულად ან ინგლისურად)" (MotionControlPanel.tsx), and the text went
  // straight to Kling, which is trained overwhelmingly on English. The render always came back
  // — a plausible animation of the photo — so the failure was invisible: the user described one
  // motion and got whatever the model's priors produced.
  //
  // Safe to translate: this is a DESCRIPTION of the motion to generate. Nothing spoken or burned
  // on screen passes through here — the panel's "AI will speak it" line is a separate field that
  // goes to /api/video/lipsync as TTS copy and never touches this prompt.
  //
  // FAIL-OPEN: Latin-script input returns immediately with no network call, and any error,
  // missing key or timeout returns the original text. The job row below deliberately keeps the
  // user's OWN words (motionPrompt), so the Library shows them what they actually typed.
  const framedPrompt = `${await promptToEnglish(motionPrompt, 'video')}, ${ORIENT_HINT[aspectRatio]}`;

  // Bake the photo's EXIF orientation into its pixels BEFORE Kling (iPhone photos are
  // sideways pixels + a rotate tag Kling ignores). Fail-open → original photo.
  const startImage = await normalizeStartImage(characterImageUrl, user.id);

  // ── RESERVE BEFORE THE SUBMIT. ─────────────────────────────────────────────────────────────────────────────────
  // ⚠️ THIS ROUTE SUBMITTED FIRST AND CHARGED AFTER, BEST-EFFORT ("fail-open on a reserve miss → the render still
  // runs"). The balance gate above is a READ, so a parallel burst passed one stale balance and every request
  // rendered while only the first charge fit (deduct_credits refuses an overdraw): N−1 free Kling renders. A ledger
  // error rendered free too. The atomic deduct is now the gate, taken last — after the free prep work, right before
  // the paid call — so a killed lambda strands as little as possible: insufficient → 402, a ledger failure → 503
  // (nothing charged, nothing rendered), `skipped` (no ledger RPC at all) → uncharged, as everywhere else.
  // The ref is a fresh server UUID; the signing key is checked FIRST so a charge can never be taken that /status
  // could not authorise a refund for.
  if (!motionChargeSigningReady()) {
    return NextResponse.json(ledgerUnavailableBody(billingLocale(req)), { status: 503 });
  }
  const chargeRef = motionChargeRef(user.id, randomUUID());
  const debit = await deductCredits(user.id, MOTION_COST, chargeRef);
  if (!debit.ok && debit.reason === 'insufficient') {
    return NextResponse.json({ error: 'insufficient_credits', needed: MOTION_COST }, { status: 402 });
  }
  if (!debit.ok && debit.reason === 'error') {
    return NextResponse.json(ledgerUnavailableBody(billingLocale(req)), { status: 503 });
  }
  const charged = debit.ok;

  let jobId: string;
  try {
    jobId = await klingSubmit({
      imageUrl: startImage,
      prompt: framedPrompt,
      duration,
      aspectRatio,
      modelName,
    });
  } catch (e: unknown) {
    // Nothing was submitted, so nothing will ever render for this reservation — give it back (ledger-capped, once).
    const r = charged ? await refundDebitByRef(user.id, chargeRef, MOTION_COST).catch(() => null) : null;
    if (charged && !r?.ok) reportError(new Error('motion refund did not land'), { route: 'motion-control', ref: chargeRef });
    // ⚠️ NEVER THE PROVIDER'S OWN WORDS: this answered `error: e.message` — Replicate's raw response, verbatim.
    console.error('[motion-control] submit failed:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: classifyProviderError(e), refunded: !!r?.ok }, { status: 502 });
  }

  // TRACK 1 + SETTLEMENT — the durable row (service_type stays a CHECK-allowed 'film'; the label rides in
  // params.subtype). ⚠️ IT USED TO BE FIRE-AND-FORGET (`void createJob(...)`), and a serverless function may be frozen
  // the moment it responds — a dropped insert left /status no row to authorise a refund with and the cron nothing to
  // settle. It is awaited now, born `processing`, and carries `_settle` (not `_reserve`): the cron asks Kling for the
  // verdict before refunding anything, so an unpolled render that SUCCEEDED is delivered to the Library, never
  // refunded on age alone. Only a charge that actually landed is recorded — otherwise there is nothing to refund.
  const created = await createJob({
    id: `motion:${jobId}`, userId: user.id, serviceType: 'film', status: 'processing',
    params: {
      subtype: 'motion', method, prompt: motionPrompt.slice(0, 200), aspect: aspectRatio,
      ...(charged ? settleParams({ kind: 'motion', job: jobId, ref: chargeRef, credits: MOTION_COST }) : {}),
    },
  });
  if (!created && charged) reportError(new Error('motion job row not filed — an unpolled failure cannot be settled'), { route: 'motion-control', ref: chargeRef, jobId });

  // The charge token rides INSIDE the jobId the client polls verbatim, so /status learns the ref without a DB read.
  const token = charged ? signMotionCharge({ u: user.id, r: chargeRef, j: jobId }) : null;
  return NextResponse.json({ success: true, jobId: token ? withMotionCharge(jobId, token) : jobId, method });
}
