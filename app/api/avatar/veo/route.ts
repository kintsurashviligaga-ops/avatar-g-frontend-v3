/**
 * POST /api/avatar/veo — start ONE talking-avatar clip on Google Veo (lib/avatar/veoAvatar): the caller's own face photo
 * is the first frame, Veo speaks their words, their direction moves it. The client polls the same status route as the
 * VFX scene: GET /api/genjutsu/status?id=<jobId> (refunds a failed render by its signed charge token).
 *
 * ⚠️ ADMIN ONLY until the owner opens it. GG chose this engine on 2026-10-16 (the HeyGen avatar is refused by the
 * Google-only boundary); its first paid test and its public price are his to approve, so a non-admin is refused 423
 * unless AVATAR_VEO_PUBLIC=1 (a public flag: GG's word).
 *
 * THE ORDER IS THE SAFETY, as in /api/genjutsu/generate: sign-in → admin/flag → parse (free) → rate → own photo →
 * price check → balance → the Georgian voice → daily slot → durable row with `_reserve` → RESERVE → submit once →
 * refund on any miss.
 *
 * ⚠️ A GEORGIAN LINE IS ELEVENLABS' VOICE (GG, 2026-10-17 07:54Z). It is made BEFORE anything is charged: no voice, or a
 * line longer than the clip, is an honest refusal with nothing taken. Veo then renders the person talking with no sound
 * (its Georgian is garbled), and the status route lays the line over the clip before it is shown (lib/avatar/voicedClip).
 * The `::v` in the signed job id is what tells it to.
 *
 * GET answers whether this caller may use it, and at what price — the studio's card and panel print that price.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { billingLocale, ledgerUnavailableBody } from '@/lib/api/billingCopy';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { isAdminIdentity } from '@/lib/auth/adminGuard';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import {
  VEO_AVATAR_NEGATIVE, VEO_AVATAR_SECONDS, avatarVoiceByElevenLabs, avatarVoicePath, buildVeoAvatarPrompt, parseVeoAvatarRequest,
  veoAvatarCredits, veoAvatarPublic,
} from '@/lib/avatar/veoAvatar';
import { speakAvatarLine } from '@/lib/chat/filmVoiceover';
import { composeVeoJobId, genjutsuChargeReady, genjutsuChargeRef, genjutsuJobId, signGenjutsuCharge, withGenjutsuCharge } from '@/lib/genjutsu/chargeToken';
import { GENJUTSU_RATE, claimDailySlot, fail, releaseDailySlot } from '@/lib/genjutsu/serverCommon';
import { submitScene } from '@/lib/genjutsu/veoScene';
import { reportError } from '@/lib/observability/report-error';
import { createJob, failJob } from '@/lib/orchestrator/jobs';
import { deductCredits, hasSufficientBalance, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { removeStorageObjects } from '@/lib/orchestrator/storage-adapter';
import { resolveCallerMedia } from '@/lib/security/callerMedia';
import { readJson } from '@/lib/studio/http';
import { authedClientFromRequest } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const ROUTE = '/api/avatar/veo';
const PHOTO_TTL_SEC = 3_600;
/** The line may end a hair after the picture (an mp3's own lead-in and tail): the clip's last frame ends it. */
const VOICE_SLACK_SEC = 0.25;

/** Whether this caller may start an avatar, and its price. Signed out → closed (nothing to start). Never throws. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const credits = veoAvatarCredits();
  let user: Awaited<ReturnType<typeof authedClientFromRequest>>['user'] | null = null;
  try {
    user = (await authedClientFromRequest(req)).user ?? null;
  } catch {
    user = null;
  }
  const open = !!user?.id && (veoAvatarPublic() || (await isAdminIdentity(user).catch(() => false)));
  return NextResponse.json({ success: true, open, credits, seconds: VEO_AVATAR_SECONDS }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const locale = billingLocale(req);

  let user: Awaited<ReturnType<typeof authedClientFromRequest>>['user'] | null = null;
  try {
    user = (await authedClientFromRequest(req)).user ?? null;
  } catch {
    user = null;
  }
  const userId = user?.id ?? null;
  if (!userId || mustSignInToGenerate(userId)) return NextResponse.json(signInToGenerateBody(locale), { status: 401 });
  if (!veoAvatarPublic() && !(await isAdminIdentity(user).catch(() => false))) return fail(423, 'locked', { op: 'avatar' });

  const parsed = parseVeoAvatarRequest(await readJson(req));
  if (!parsed.ok) return fail(400, 'invalid_request', { issues: [{ path: parsed.field, code: parsed.code }] });
  const r = parsed.value;

  const limited = await checkRateLimitByKey(userId, GENJUTSU_RATE);
  if (limited) return limited;

  // Our own storage only, and only the caller's own object.
  const photo = await resolveCallerMedia(r.photo, userId, PHOTO_TTL_SEC);
  if (!photo.ok || !photo.own) return fail(422, 'invalid_input', { issues: [{ path: 'photo', code: photo.ok ? 'not_own_storage' : photo.reason }] });

  const credits = veoAvatarCredits();
  if (r.expectedCredits !== null && r.expectedCredits !== credits) return fail(409, 'price_changed', { credits });
  if (!genjutsuChargeReady()) return NextResponse.json(ledgerUnavailableBody(locale), { status: 503 });
  if (!(await hasSufficientBalance(userId, credits))) return fail(402, 'insufficient_credits', { needed: credits });

  const uuid = randomUUID();
  // The Georgian line, spoken now — before the slot, the row and the charge, so a miss costs the user nothing.
  const voiced = avatarVoiceByElevenLabs(r.speech);
  let voicedSec: number | undefined;
  if (voiced) {
    const line = await speakAvatarLine({ text: r.speech, gender: r.voiceGender, path: avatarVoicePath(uuid) });
    if (!line) return fail(503, 'voice_unavailable', { refunded: false });
    // ElevenLabs refused for good (2026-10-17 09:31Z: the plan does not allow the cloned Georgian voices) — a retry
    // cannot help, so the user is not told to try again in a minute.
    if ('off' in line) return fail(503, 'voice_off', { refunded: false });
    if (line.seconds > VEO_AVATAR_SECONDS + VOICE_SLACK_SEC) {
      await removeStorageObjects('renders', [avatarVoicePath(uuid)]).catch(() => {});
      return fail(422, 'speech_too_long', { seconds: Math.round(line.seconds * 10) / 10, maxSeconds: VEO_AVATAR_SECONDS });
    }
    voicedSec = line.seconds;
  }
  if (!(await claimDailySlot())) return fail(429, 'rate_limited', { scope: 'daily' });

  const ref = genjutsuChargeRef(userId, uuid);
  const rowId = genjutsuJobId(uuid);
  const createdMs = Date.now();

  const filed = await createJob({
    id: rowId, userId, serviceType: 'film', status: 'processing',
    params: { subtype: 'avatar', op: 'avatar-veo', prompt: r.speech.slice(0, 200), aspect: r.aspect, ...(voiced ? { voiced: true } : {}), _reserve: { ref, credits } },
  });
  if (!filed) reportError(new Error('veo avatar job row not filed'), { route: ROUTE, ref });

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
    if (!back?.ok) reportError(new Error('veo avatar refund did not land'), { route: ROUTE, ref, why });
    await failJob(rowId, why);
    return !!back?.ok;
  };

  const sub = await submitScene({
    prompt: buildVeoAvatarPrompt({ speech: r.speech, direction: r.direction, ...(voicedSec !== undefined ? { voicedSec } : {}) }),
    aspect: r.aspect, quality: 'fast', referenceUrls: [], startImageUrl: photo.url,
    negativePrompt: VEO_AVATAR_NEGATIVE, userId, sessionId: `avatar-${uuid}`,
    ...(voiced ? { audio: false } : {}),
  });
  if (!sub.ok) {
    const refunded = await refund(`veo ${sub.reason}`);
    await releaseDailySlot();
    const code = sub.reason === 'invalid_request' ? 'invalid_input' : sub.reason === 'safety' ? 'content_rejected' : sub.reason === 'not_configured' ? 'not_configured' : 'provider_unavailable';
    return fail(sub.reason === 'invalid_request' || sub.reason === 'safety' ? 422 : 503, code, { refunded });
  }

  const jobId = composeVeoJobId(sub.operation, sub.aspect, createdMs, voiced);
  const token = signGenjutsuCharge({ u: userId, r: ref, j: jobId });
  if (!token) {
    const refunded = await refund('no charge token');
    return fail(503, 'billing_unavailable', { refunded });
  }
  return NextResponse.json({ success: true, op: 'avatar', jobId: withGenjutsuCharge(jobId, token), credits, engine: 'Veo', ...(voiced ? { voice: 'ElevenLabs' } : {}) }, { status: 202 });
}
