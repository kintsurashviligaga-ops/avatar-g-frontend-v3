/**
 * POST /api/video/clip — the video service's ONE clip, the way Gemini makes a video (GG, 2026-10-25 16:10Z;
 * lib/video/directClip): the user's prompt and photos go to Google Veo as they are, and one 4, 6 or 8 s clip comes back —
 * or, at 10 s, to Gemini Omni Flash on Vertex (GG's card 16:51Z; lib/video/omniClip), which takes one photo as its first
 * frame. No storyboard, no director, no narrator, no music bed: a single photo is the first frame, two or three are Veo's
 * reference images, and the engine's own sound follows the prompt. The client polls the same status route as the VFX
 * scene and the avatar: GET /api/genjutsu/status?id=<jobId> (refunds a failed render by its signed charge token).
 *
 * ⚠️ A GEORGIAN LINE IS SAID BY THE CHARACTER, IN THEIR OWN VOICE, ON OMNI — AT EVERY LENGTH (GG 2026-10-26 10:44Z: three
 * people in one narrator's voice; card 10:55Z „Omni ამ ფასებით"). Veo cannot say Georgian, and the one Cloud TTS voice this
 * route used to lay over its mouth spoke for everyone. So a clip whose words a character says in Georgian is Omni's
 * (`::o4` … `::o10`), priced by the price book's Omni row for its length and resolution, and nothing is dubbed. The card
 * reads the prompt first (lib/video/clipPrompt promptSpeaksGeorgian) and shows Omni's price; when this route's reader
 * finds a Georgian line the card missed, the new price is refused free (409 price_changed + speech: 'ka') and the card
 * asks again. A speaking clip takes one photo (Omni's first frame): two or three are refused free, and so are words
 * that do not fit the clip (clipSpeechFits) — never a rushed or cut line that was paid for.
 *
 * THE ORDER IS THE SAFETY, as in /api/avatar/veo: sign-in → service switch → parse (free) → rate → one start at a time
 * → price check → balance → read the prompt → the engine it needs (and its price, checked again) → the tier is open →
 * the words fit → daily slot → durable row with `_reserve` → RESERVE → submit once → refund on any miss. The price is the
 * composer's own quote for the length, tier and engine (lib/video/directClip).
 */
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { billingLocale, ledgerUnavailableBody } from '@/lib/api/billingCopy';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { composeOmniJobId, composeVeoJobId, genjutsuChargeReady, genjutsuChargeRef, genjutsuJobId, signGenjutsuCharge, withGenjutsuCharge } from '@/lib/genjutsu/chargeToken';
import { GENJUTSU_RATE, claimDailySlot, fail, releaseDailySlot } from '@/lib/genjutsu/serverCommon';
import { submitScene } from '@/lib/genjutsu/veoScene';
import { reportError } from '@/lib/observability/report-error';
import { claimIdempotencyKey, hashPayload, releaseIdempotencyKey } from '@/lib/orchestrator/idempotency';
import { createJob, failJob } from '@/lib/orchestrator/jobs';
import { deductCredits, hasSufficientBalance, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { readJson } from '@/lib/studio/http';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { veoModelProblem } from '@/lib/veo/engine';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';
import { CLIP_SPEECH_MAX_CHARS, asksForSubtitles, clipNegativePrompt, clipSpeechFits, composeClipPrompt, speaksGeorgian, spokenText } from '@/lib/video/clipPrompt';
import { readClipPrompt } from '@/lib/video/clipSpeech';
import { DIRECT_CLIP_BODY_MAX_BYTES, directClipCredits, directClipEngine, directClipResolution, parseDirectClipRequest, type DirectClipRequest, type DirectClipSpeech } from '@/lib/video/directClip';
import { submitOmniClip } from '@/lib/video/omniClip';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const ROUTE = '/api/video/clip';

/** The same request twice at once (a double tap) is one clip, not two. */
async function claimInflight(userId: string, r: DirectClipRequest): Promise<(() => Promise<void>) | null> {
  const sig = await hashPayload({ t: r.prompt, a: r.aspect, s: r.seconds, q: r.tier, res: r.resolution, p: r.photos.map((x) => x.base64.length + ':' + x.base64.slice(-32)) });
  const key = `video-clip:${sig}`;
  if (!(await claimIdempotencyKey(userId, key, 120))) return null;
  return async () => { await releaseIdempotencyKey(userId, key).catch(() => undefined); };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const locale = billingLocale(req);

  let userId: string | null = null;
  try {
    userId = (await authedClientFromRequest(req)).user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId || mustSignInToGenerate(userId)) return NextResponse.json(signInToGenerateBody(locale), { status: 401 });
  // Admin service switch (lib/server/serviceSwitches): a switched-off tool is refused here, before any charge.
  const serviceOff = await serviceOffResponse('video');
  if (serviceOff) return serviceOff;

  // Its photos ride in the body: read up to their ceiling, never the 64 KB default (which refused every photo).
  const parsed = parseDirectClipRequest(await readJson(req, DIRECT_CLIP_BODY_MAX_BYTES));
  if (!parsed.ok) return fail(400, 'invalid_request', { issues: [{ path: parsed.field, code: parsed.code }] });
  const r = parsed.value;

  const limited = await checkRateLimitByKey(userId, GENJUTSU_RATE);
  if (limited) return limited;

  const release = await claimInflight(userId, r);
  if (!release) return fail(409, 'duplicate_request');
  try {
    return await startClip(userId, r, locale);
  } finally {
    await release();
  }
}

/** The engine, resolution and price of a clip, for what it is known to say. */
function pricedFor(r: DirectClipRequest, speech: DirectClipSpeech) {
  const resolution = directClipResolution(r.seconds, r.picked, speech);
  return {
    engine: directClipEngine(r.seconds, speech), resolution,
    credits: directClipCredits({ seconds: r.seconds, tier: r.tier, photos: r.photos.length, resolution, speech }),
  };
}

async function startClip(userId: string, r: DirectClipRequest, locale: ReturnType<typeof billingLocale>): Promise<NextResponse> {
  // What the card priced: Veo, or Omni when it read a Georgian line (or at 10 s).
  let priced = pricedFor(r, r.speech);
  if (r.expectedCredits !== null && r.expectedCredits !== priced.credits) return fail(409, 'price_changed', { credits: priced.credits });
  if (!genjutsuChargeReady()) return NextResponse.json(ledgerUnavailableBody(locale), { status: 503 });
  if (!(await hasSufficientBalance(userId, priced.credits))) return fail(402, 'insufficient_credits', { needed: priced.credits });

  // The prompt as the user wrote it, in English for the engine, with the words its characters say kept verbatim.
  const reading = await readClipPrompt(r.prompt);
  // A Georgian line the card did not see is Omni's too: its price is said and asked for again, nothing taken.
  const speech: DirectClipSpeech = r.speech === 'ka' || speaksGeorgian(reading.lines) ? 'ka' : null;
  // Omni takes one photo, as the first frame; two or three are Veo's references, which cannot say the Georgian line.
  if (speech === 'ka' && r.photos.length >= 2) return fail(422, 'speech_one_photo', { photos: r.photos.length });
  if (speech !== r.speech) {
    priced = pricedFor(r, speech);
    if (r.expectedCredits !== null && r.expectedCredits !== priced.credits) {
      return fail(409, 'price_changed', { credits: priced.credits, speech, engine: 'Gemini Omni Flash', resolution: priced.resolution, seconds: r.seconds });
    }
    if (!(await hasSufficientBalance(userId, priced.credits))) return fail(402, 'insufficient_credits', { needed: priced.credits });
  }
  const { engine, resolution, credits } = priced;
  // A Veo tier this deployment cannot render (its model or location refused, GET /api/video/engine says the same) is
  // refused here, before the slot and the charge: never a debit that is refunded a second later.
  if (engine === 'veo' && veoModelProblem(r.tier) !== null) return fail(503, 'tier_unavailable', { tier: r.tier, refunded: false });
  // Words longer than the clip are rushed or cut by the engine, never refused by it: measured here, before anything is taken.
  if (spokenText(reading.lines).length > CLIP_SPEECH_MAX_CHARS) return fail(422, 'speech_too_long', { maxSeconds: r.seconds });
  const fit = clipSpeechFits(reading.lines, r.seconds, reading.speakers);
  if (!fit.fits) return fail(422, 'speech_too_long', { seconds: fit.seconds, maxSeconds: r.seconds });

  const uuid = randomUUID();
  if (!(await claimDailySlot())) return fail(429, 'rate_limited', { scope: 'daily' });

  const ref = genjutsuChargeRef(userId, uuid);
  const rowId = genjutsuJobId(uuid);
  const createdMs = Date.now();
  const photoMode = r.photos.length === 0 ? 'none' : r.photos.length === 1 ? 'frame' : 'refs';

  const filed = await createJob({
    id: rowId, userId, serviceType: 'film', status: 'processing',
    params: {
      subtype: 'video', op: 'clip', engine, prompt: r.prompt.slice(0, 200), aspect: r.aspect, seconds: r.seconds, tier: r.tier,
      resolution, photos: r.photos.length, ...(speech ? { speech } : {}), _reserve: { ref, credits },
    },
  });
  if (!filed) reportError(new Error('video clip job row not filed'), { route: ROUTE, ref });

  const debit = await deductCredits(userId, credits, ref);
  if (!debit.ok) {
    await failJob(rowId, debit.reason === 'insufficient' ? 'insufficient credits' : 'ledger unavailable');
    await releaseDailySlot();
    return debit.reason === 'insufficient'
      ? fail(402, 'insufficient_credits', { needed: credits })
      : NextResponse.json(ledgerUnavailableBody(locale), { status: 503 });
  }
  const refund = async (why: string): Promise<boolean> => {
    const back = await refundDebitByRef(userId, ref, credits).catch(() => null);
    if (!back?.ok) reportError(new Error('video clip refund did not land'), { route: ROUTE, ref, why });
    await failJob(rowId, why);
    return !!back?.ok;
  };

  const photos = r.photos.map((p) => ({ kind: 'bytes' as const, base64: p.base64, mimeType: p.mimeType }));
  const sub = engine === 'omni'
    ? await submitOmniClip({
      prompt: composeClipPrompt({ reading, photos: photoMode, engine: 'omni', subtitles: asksForSubtitles(r.prompt) }),
      aspect: r.aspect, resolution, seconds: r.seconds, userId,
      ...(r.photos[0] ? { firstFrame: r.photos[0] } : {}),
    }).then((o) => (o.ok ? { ok: true as const, operation: o.id, aspect: r.aspect } : o))
    : await submitScene({
      prompt: composeClipPrompt({ reading, photos: photoMode }),
      aspect: r.aspect, quality: 'fast', tier: r.tier, durationSec: r.seconds, userId, sessionId: `clip-${uuid}`,
      negativePrompt: clipNegativePrompt(r.prompt),
      referenceUrls: [],
      // One photo is the first frame, cropped to fill the frame (Veo's default letterboxes a photo of another shape).
      ...(photoMode === 'frame' ? { startImage: photos[0]!, resizeMode: 'crop' as const } : {}),
      ...(photoMode === 'refs' ? { referenceImages: photos } : {}),
    });
  if (!sub.ok) {
    const refunded = await refund(`${engine} ${sub.reason}`);
    await releaseDailySlot();
    const code = sub.reason === 'invalid_request' ? 'invalid_input' : sub.reason === 'safety' ? 'content_rejected' : sub.reason === 'not_configured' ? 'not_configured' : 'provider_unavailable';
    return fail(sub.reason === 'invalid_request' || sub.reason === 'safety' ? 422 : 503, code, { refunded });
  }

  const jobId = engine === 'omni'
    ? composeOmniJobId(sub.operation, r.aspect, createdMs, undefined, r.seconds)
    : composeVeoJobId(sub.operation, sub.aspect, createdMs, false, r.seconds as 4 | 6 | 8);
  const token = signGenjutsuCharge({ u: userId, r: ref, j: jobId });
  if (!token) {
    const refunded = await refund('no charge token');
    return fail(503, 'billing_unavailable', { refunded });
  }
  // `taskId` is the job row the Renders tray lists this clip under: the chat's card claims it, so the tray does not show
  // the same render a second time over the card (GG 2026-10-26 08:46Z).
  return NextResponse.json({
    success: true, op: 'clip', jobId: withGenjutsuCharge(jobId, token), taskId: rowId, credits, seconds: r.seconds,
    resolution, engine: engine === 'omni' ? 'Gemini Omni Flash' : 'Veo', ...(speech ? { speech } : {}),
  }, { status: 202 });
}
