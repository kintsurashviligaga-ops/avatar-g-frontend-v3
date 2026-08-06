/**
 * POST /api/motion-control — animate a character photo with Kling (Replicate).
 * Body: { characterImageUrl (data-url or https), referenceVideoUrl?, motionPrompt,
 *         duration?, aspectRatio? }. With a reference video it requests V2V (which
 *         currently degrades to motion-prompt I2V — Replicate has no true V2V Kling).
 *
 * ASYNC: Kling v2.1-master takes 3-7 min — a blocking wait 504s on Vercel (the
 * "Generate motion → HTTP 504" report). This route now only SUBMITS the job and
 * returns { jobId } in ~2s; the client polls GET /api/motion-control/status?id=…,
 * which finalizes (re-host + optional music) once Kling succeeds.
 */
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import sharp from 'sharp';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { klingSubmit, klingConfigured, KLING_MODELS } from '@/lib/ai/klingClient';
import { promptToEnglish } from '@/lib/ai/promptToEnglish';
import { uploadBufferAndSign, createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { createJob, updateJobStage } from '@/lib/orchestrator/jobs';
import { hasSufficientBalance, deductCredits } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';

// A Motion Control render is a single short (5-10s) Kling i2v clip — priced as one paid video op, the
// same tier as a remix. Flat so the async /status refund can reverse the exact amount without re-deriving
// the quality mode (which /status doesn't receive). The reserve ref `motion:charge:<jobId>` is derivable
// from the prediction id in /status, which refunds `${ref}:refund` on a failed render.
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
      const r = await fetch(src, { signal: AbortSignal.timeout(20_000) });
      if (r.ok) buf = Buffer.from(await r.arrayBuffer());
    } else {
      const signed = await createSignedAssetUrl(process.env.UPLOAD_BUCKET || 'uploads', src, 3600);
      if (signed) { const r = await fetch(signed, { signal: AbortSignal.timeout(20_000) }); if (r.ok) buf = Buffer.from(await r.arrayBuffer()); }
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
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const rl = await checkRateLimit(req as NextRequest, RATE_LIMITS.EXPENSIVE); if (rl) return rl; // paid Kling submit
  if (!klingConfigured()) return NextResponse.json({ error: 'video engine not configured' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as {
    characterImageUrl?: string; referenceVideoUrl?: string; motionPrompt?: string;
    duration?: number; aspectRatio?: string; qualityMode?: string;
  } | null;
  const characterImageUrl = body?.characterImageUrl?.trim();
  const motionPrompt = body?.motionPrompt?.trim();
  if (!characterImageUrl || !motionPrompt) {
    return NextResponse.json({ error: 'characterImageUrl + motionPrompt required' }, { status: 400 });
  }
  // Billing gate — Motion Control was a REVENUE LEAK: it fired a paid Kling render with no charge. Gate
  // on balance up front (fail-open on read miss; the post-submit deduct is the real backstop) so a broke
  // user can't submit a paid render for free, then reserve the credits once the job is accepted below.
  if (!(await hasSufficientBalance(user.id, MOTION_COST))) {
    return NextResponse.json({ error: 'insufficient_credits', needed: MOTION_COST }, { status: 402 });
  }

  const duration: 5 | 10 = body?.duration === 10 ? 10 : 5;
  const aspectRatio = (['9:16', '16:9', '1:1'].includes(String(body?.aspectRatio)) ? body!.aspectRatio : '9:16') as '9:16' | '16:9' | '1:1';
  const referenceVideoUrl = body?.referenceVideoUrl?.trim();
  const method: 'v2v' | 'i2v' = referenceVideoUrl ? 'v2v' : 'i2v';
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

  try {
    const jobId = await klingSubmit({
      imageUrl: startImage,
      prompt: framedPrompt,
      duration,
      aspectRatio,
      modelName,
      ...(referenceVideoUrl ? { videoUrl: referenceVideoUrl } : {}),
    });
    // Reserve the credits now that the paid render is accepted — idempotent by ref, so a client retry of
    // an already-submitted jobId can't double-charge. /status refunds `motion:charge:<jobId>:refund` if the
    // render fails. Fail-open on a reserve miss (rare balance race past the gate) → the render still runs.
    const chargeRef = `motion:charge:${jobId}`;
    const debit = await deductCredits(user.id, MOTION_COST, chargeRef).catch(() => null);
    // TRACK 1 — motion was invisible to telemetry (wrote no generation_jobs row). File a row
    // (service_type stays a CHECK-allowed 'film'; the real label rides in params.subtype) so the render is
    // measured, the reliability dashboard shows a "motion" service, and the drainer can reap it if abandoned.
    // Fire-and-forget + fail-open — never blocks the fast submit response. The /status route finalizes it.
    //
    // ⚠️ THE ROW SAID "the drainer can reap it if abandoned" AND THE DRAINER COULD NOT SEE IT — TWICE OVER.
    // The only refund for motion lives in /status, which runs solely because the CLIENT polled; close the
    // tab on a failing render and the charge stranded forever. The drainer exists precisely for that, but
    // (a) it refunds from `params._reserve`, which this row never carried, and (b) isReapable() only
    // considers rows in `processing`, while createJob files them as `pending` and nothing here moved it on.
    // Both are fixed below, so an abandoned motion render is now reaped and credited back.
    //
    // ⚠️ `_reserve` IS STAMPED ONLY IF THE DEBIT ACTUALLY LANDED. Stamping it unconditionally would let the
    // drainer refund a render that was never charged — minting credits out of a failed reserve.
    // The ref is shared with /status and refundCredits is idempotent on it, so a user who polls AND a
    // drainer that later reaps produce exactly one refund between them.
    const reserve = debit?.ok ? { _reserve: { ref: chargeRef, credits: MOTION_COST } } : {};
    void createJob({
      id: `motion:${jobId}`, userId: user.id, serviceType: 'film',
      params: { subtype: 'motion', method, prompt: motionPrompt.slice(0, 200), ...reserve },
    }).then(() => {
      // Move it to `processing` — the only status the drainer will look at. Chained after createJob so
      // the patch cannot race the insert.
      void updateJobStage(`motion:${jobId}`, 'rendering', 5);
    });
    return NextResponse.json({ success: true, jobId, method });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
