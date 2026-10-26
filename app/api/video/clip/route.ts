/**
 * POST /api/video/clip — the video service's ONE clip, the way Gemini makes a video (GG, 2026-10-25 16:10Z;
 * lib/video/directClip): the user's prompt and photos go to Google Veo as they are, and one 4, 6 or 8 s clip comes back —
 * or, at 10 s, to Gemini Omni Flash on Vertex (GG's card 16:51Z; lib/video/omniClip), which takes one photo as its first
 * frame and speaks Georgian itself, so a 10 s clip gets no Cloud TTS voice (`::o10` in the signed id).
 * No storyboard, no director, no narrator, no music bed: a single photo is the first frame, two or three are Veo's
 * reference images, and Veo's own sound follows the prompt. The client polls the same status route as the VFX scene and
 * the avatar: GET /api/genjutsu/status?id=<jobId> (refunds a failed render by its signed charge token).
 *
 * ⚠️ A GEORGIAN LINE IS SAID BY THE CHARACTER (lib/video/clipPrompt). It is voiced by Google Cloud TTS BEFORE anything is
 * charged — no voice, or a line longer than the clip, is an honest refusal with nothing taken — and Veo says the same
 * syllables in Latin letters so its mouth makes them; the status route lays the line onto where Veo spoke and keeps
 * Veo's other sound (lib/video/voicedClip). The `v` in the signed job id (`::c8v`) is what tells it to.
 *
 * THE ORDER IS THE SAFETY, as in /api/avatar/veo: sign-in → service switch → parse (free) → rate → one start at a time
 * → price check → the tier is open → balance → read the prompt → the Georgian voice → daily slot → durable row with `_reserve` → RESERVE →
 * submit once → refund on any miss. The price is the composer's own quote for the length and tier (lib/video/directClip).
 */
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { billingLocale, ledgerUnavailableBody } from '@/lib/api/billingCopy';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { speakAvatarLine } from '@/lib/chat/filmVoiceover';
import { composeOmniJobId, composeVeoJobId, genjutsuChargeReady, genjutsuChargeRef, genjutsuJobId, signGenjutsuCharge, withGenjutsuCharge } from '@/lib/genjutsu/chargeToken';
import { GENJUTSU_RATE, claimDailySlot, fail, releaseDailySlot } from '@/lib/genjutsu/serverCommon';
import { submitScene } from '@/lib/genjutsu/veoScene';
import { reportError } from '@/lib/observability/report-error';
import { claimIdempotencyKey, hashPayload, releaseIdempotencyKey } from '@/lib/orchestrator/idempotency';
import { createJob, failJob } from '@/lib/orchestrator/jobs';
import { deductCredits, hasSufficientBalance, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { removeStorageObjects } from '@/lib/orchestrator/storage-adapter';
import { readJson } from '@/lib/studio/http';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { veoModelProblem } from '@/lib/veo/engine';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';
import { CLIP_SPEECH_MAX_CHARS, asksForSubtitles, clipNegativePrompt, clipVoicedByTts, composeClipPrompt, spokenText } from '@/lib/video/clipPrompt';
import { readClipPrompt } from '@/lib/video/clipSpeech';
import { DIRECT_CLIP_BODY_MAX_BYTES, clipVoicePath, directClipCredits, directClipEngine, parseDirectClipRequest, type DirectClipRequest } from '@/lib/video/directClip';
import { submitOmniClip } from '@/lib/video/omniClip';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const ROUTE = '/api/video/clip';
/** The line may end a hair after the picture (an mp3's own lead-in and tail): the clip's last frame ends it. */
const VOICE_SLACK_SEC = 0.25;

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

async function startClip(userId: string, r: DirectClipRequest, locale: ReturnType<typeof billingLocale>): Promise<NextResponse> {
  const engine = directClipEngine(r.seconds);
  const credits = directClipCredits({ seconds: r.seconds, tier: r.tier, photos: r.photos.length, resolution: r.resolution });
  if (r.expectedCredits !== null && r.expectedCredits !== credits) return fail(409, 'price_changed', { credits });
  // A Veo tier this deployment cannot render (its model or location refused, GET /api/video/engine says the same) is
  // refused here, before the voice, the slot and the charge: never a debit that is refunded a second later.
  if (engine === 'veo' && veoModelProblem(r.tier) !== null) return fail(503, 'tier_unavailable', { tier: r.tier, refunded: false });
  if (!genjutsuChargeReady()) return NextResponse.json(ledgerUnavailableBody(locale), { status: 503 });
  if (!(await hasSufficientBalance(userId, credits))) return fail(402, 'insufficient_credits', { needed: credits });

  // The prompt as the user wrote it, in English for the engine, with the words its characters say kept verbatim.
  const reading = await readClipPrompt(r.prompt);
  const speech = spokenText(reading.lines);
  if (speech.length > CLIP_SPEECH_MAX_CHARS) return fail(422, 'speech_too_long', { maxSeconds: r.seconds });

  const uuid = randomUUID();
  // A Georgian line on Veo, spoken now — before the slot, the row and the charge, so a miss costs the user nothing.
  // Omni (10 s) says it in its own voice: nothing to speak here.
  const voiced = engine === 'veo' && speech.length > 0 && clipVoicedByTts(reading.lines);
  let voicedSec: number | undefined;
  if (voiced) {
    const line = await speakAvatarLine({ text: speech, gender: reading.speaker, path: clipVoicePath(uuid) });
    if (!line) return fail(503, 'voice_unavailable', { refunded: false });
    if ('off' in line) return fail(503, 'voice_off', { refunded: false });
    if (line.seconds > r.seconds + VOICE_SLACK_SEC) {
      await removeStorageObjects('renders', [clipVoicePath(uuid)]).catch(() => {});
      return fail(422, 'speech_too_long', { seconds: Math.round(line.seconds * 10) / 10, maxSeconds: r.seconds });
    }
    voicedSec = line.seconds;
  }
  if (!(await claimDailySlot())) return fail(429, 'rate_limited', { scope: 'daily' });

  const ref = genjutsuChargeRef(userId, uuid);
  const rowId = genjutsuJobId(uuid);
  const createdMs = Date.now();
  const photoMode = r.photos.length === 0 ? 'none' : r.photos.length === 1 ? 'frame' : 'refs';

  const filed = await createJob({
    id: rowId, userId, serviceType: 'film', status: 'processing',
    params: {
      subtype: 'video', op: 'clip', engine, prompt: r.prompt.slice(0, 200), aspect: r.aspect, seconds: r.seconds, tier: r.tier,
      resolution: r.resolution, photos: r.photos.length, ...(voiced ? { voiced: true } : {}), _reserve: { ref, credits },
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
      prompt: composeClipPrompt({ reading, clipSec: r.seconds, photos: photoMode, engine: 'omni', subtitles: asksForSubtitles(r.prompt) }),
      aspect: r.aspect, resolution: r.resolution, seconds: r.seconds, userId,
      ...(r.photos[0] ? { firstFrame: r.photos[0] } : {}),
    }).then((o) => (o.ok ? { ok: true as const, operation: o.id, aspect: r.aspect } : o))
    : await submitScene({
      prompt: composeClipPrompt({ reading, clipSec: r.seconds, photos: photoMode, ...(voicedSec !== undefined ? { voicedSec } : {}) }),
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
    ? composeOmniJobId(sub.operation, r.aspect, createdMs)
    : composeVeoJobId(sub.operation, sub.aspect, createdMs, voiced, r.seconds as 4 | 6 | 8);
  const token = signGenjutsuCharge({ u: userId, r: ref, j: jobId });
  if (!token) {
    const refunded = await refund('no charge token');
    return fail(503, 'billing_unavailable', { refunded });
  }
  // `taskId` is the job row the Renders tray lists this clip under: the chat's card claims it, so the tray does not show
  // the same render a second time over the card (GG 2026-10-26 08:46Z).
  return NextResponse.json({
    success: true, op: 'clip', jobId: withGenjutsuCharge(jobId, token), taskId: rowId, credits, seconds: r.seconds,
    resolution: r.resolution, engine: engine === 'omni' ? 'Gemini Omni Flash' : 'Veo', ...(voiced ? { voice: 'Google Cloud TTS' } : {}),
  }, { status: 202 });
}
