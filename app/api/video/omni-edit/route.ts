/**
 * POST /api/video/omni-edit — a video the user uploaded, EDITED or EXTENDED by Gemini Omni Flash on Vertex (GG, 2026-10-25
 * 16:58Z; card 17:04Z „კი, ორივე"; lib/video/omniEdit). The words go as typed; an edit renders the video's own length, an
 * extend adds 4 · 6 · 8 · 10 s after it. The client polls the same status route as the 10 s clip: GET /api/genjutsu/status
 * (`::oe6` / `::ox8` in the signed id), which hosts the result and refunds a failed render by its signed charge token.
 *
 * ⚠️ THE VIDEO IS THE CALLER'S OWN UPLOAD, SIGNED FOR THEM ONLY (lib/security/callerMedia): a path under another account's
 * folder, or another account's storage URL, is refused before anything is fetched. Nothing outside our storage is read.
 *
 * ⚠️ IT IS MEASURED BEFORE IT IS PRICED. One ffmpeg pass (lib/video/omniEditInput) re-encodes it to the 720p H.264 the
 * 2026-10-25 probe measured and reads its length: over 10 s (Google's limit), too short to edit or unreadable is an honest
 * refusal with nothing taken. An edit's price is that length on the 4 · 6 · 8 · 10 s grid, rounded up; an extend's, the new
 * seconds (lib/credits/priceBook omniEdit, GG's card).
 *
 * THE ORDER IS THE SAFETY, as in /api/video/clip: sign-in → service switch → parse (free) → rate → one start at a time →
 * the caller's own video → the ledger is up → measure + re-encode (free) → price check → balance → daily slot → durable row
 * with `_reserve` → RESERVE → submit once → refund on any miss.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { billingLocale, ledgerUnavailableBody } from '@/lib/api/billingCopy';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { composeOmniJobId, genjutsuChargeReady, genjutsuChargeRef, genjutsuJobId, signGenjutsuCharge, withGenjutsuCharge } from '@/lib/genjutsu/chargeToken';
import { GENJUTSU_RATE, claimDailySlot, fail, releaseDailySlot } from '@/lib/genjutsu/serverCommon';
import { reportError } from '@/lib/observability/report-error';
import { claimIdempotencyKey, hashPayload, releaseIdempotencyKey } from '@/lib/orchestrator/idempotency';
import { createJob, failJob } from '@/lib/orchestrator/jobs';
import { deductCredits, hasSufficientBalance, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { resolveCallerMedia } from '@/lib/security/callerMedia';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';
import { readJson } from '@/lib/studio/http';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { submitOmniEdit } from '@/lib/video/omniClip';
import {
  omniEditBilledSeconds, omniEditCredits, omniEditInputCheck, omniEditOutputSeconds, omniEditRequestSeconds, parseOmniEditRequest,
  type OmniEditRequest,
} from '@/lib/video/omniEdit';
import { prepareOmniEditInput } from '@/lib/video/omniEditInput';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const ROUTE = '/api/video/omni-edit';
/** The upload is signed for the server's own fetch only, for as long as the fetch and the re-encode can take. */
const SOURCE_TTL_SEC = 600;

/** The same request twice at once (a double tap) is one edit, not two. */
async function claimInflight(userId: string, r: OmniEditRequest): Promise<(() => Promise<void>) | null> {
  const sig = await hashPayload({ o: r.op, t: r.prompt, v: r.video, s: r.seconds, res: r.resolution });
  const key = `video-omni-edit:${sig}`;
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

  const parsed = parseOmniEditRequest(await readJson(req));
  if (!parsed.ok) return fail(400, 'invalid_request', { issues: [{ path: parsed.field, code: parsed.code }] });
  const r = parsed.value;

  const limited = await checkRateLimitByKey(userId, GENJUTSU_RATE);
  if (limited) return limited;

  const release = await claimInflight(userId, r);
  if (!release) return fail(409, 'duplicate_request');
  try {
    return await startEdit(userId, r, locale);
  } finally {
    await release();
  }
}

async function startEdit(userId: string, r: OmniEditRequest, locale: ReturnType<typeof billingLocale>): Promise<NextResponse> {
  // The caller's own upload only; nothing outside our storage is fetched.
  const source = await resolveCallerMedia(r.video, userId, SOURCE_TTL_SEC);
  if (!source.ok) {
    return source.reason === 'unavailable'
      ? fail(503, 'video_unavailable', { refunded: false })
      : fail(source.reason === 'not_owner' ? 403 : 400, source.reason === 'not_owner' ? 'forbidden' : 'invalid_request', { issues: [{ path: 'video', code: source.reason }] });
  }
  if (!source.own) return fail(400, 'invalid_request', { issues: [{ path: 'video', code: 'not_own_storage' }] });
  if (!genjutsuChargeReady()) return NextResponse.json(ledgerUnavailableBody(locale), { status: 503 });
  // The least this can cost (an extend's exact price, an edit's 4 s one): no balance for it, no fetch and no re-encode.
  const least = omniEditCredits({ op: r.op, inputSec: 0, seconds: r.seconds, resolution: r.resolution });
  if (!(await hasSufficientBalance(userId, least))) return fail(402, 'insufficient_credits', { needed: least });

  // Measured and re-encoded before it is priced: a video Omni cannot take costs nothing.
  const input = await prepareOmniEditInput(source.url);
  if (!input.ok) {
    if (input.reason === 'too_long') return fail(422, 'video_too_long', { seconds: Math.round((input.seconds ?? 0) * 10) / 10, maxSeconds: 10, refunded: false });
    if (input.reason === 'unavailable') return fail(503, 'provider_unavailable', { refunded: false });
    return fail(422, input.reason === 'too_large' ? 'video_too_large' : 'video_unreadable', { refunded: false });
  }
  const check = omniEditInputCheck(r.op, input.seconds);
  if (check === 'too_short') return fail(422, 'video_too_short', { seconds: Math.round(input.seconds * 10) / 10, minSeconds: r.op === 'edit' ? 3 : 1, refunded: false });
  if (check !== 'ok') return fail(422, 'video_unreadable', { refunded: false });

  const billed = omniEditBilledSeconds(r.op, input.seconds, r.seconds);
  const credits = omniEditCredits({ op: r.op, inputSec: input.seconds, seconds: r.seconds, resolution: r.resolution });
  if (r.expectedCredits !== null && r.expectedCredits !== credits) return fail(409, 'price_changed', { credits, seconds: billed, inputSeconds: Math.round(input.seconds * 10) / 10 });
  if (!(await hasSufficientBalance(userId, credits))) return fail(402, 'insufficient_credits', { needed: credits });
  if (!(await claimDailySlot())) return fail(429, 'rate_limited', { scope: 'daily' });

  const uuid = randomUUID();
  const ref = genjutsuChargeRef(userId, uuid);
  const rowId = genjutsuJobId(uuid);
  const createdMs = Date.now();
  const aspect = input.width >= input.height ? '16:9' : '9:16';
  const outputSec = omniEditOutputSeconds(r.op, input.seconds, r.seconds);

  const filed = await createJob({
    id: rowId, userId, serviceType: 'film', status: 'processing',
    params: {
      subtype: 'video', op: r.op === 'edit' ? 'omni-edit' : 'omni-extend', engine: 'omni', prompt: r.prompt.slice(0, 200),
      aspect, seconds: billed, inputSec: Math.round(input.seconds * 100) / 100, outputSec, resolution: r.resolution,
      _reserve: { ref, credits },
    },
  });
  if (!filed) reportError(new Error('omni edit job row not filed'), { route: ROUTE, ref });

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
    if (!back?.ok) reportError(new Error('omni edit refund did not land'), { route: ROUTE, ref, why });
    await failJob(rowId, why);
    return !!back?.ok;
  };

  const sub = await submitOmniEdit({
    op: r.op, prompt: r.prompt, video: { base64: input.base64, mimeType: input.mimeType }, inputSec: input.seconds,
    seconds: omniEditRequestSeconds(r.op, input.seconds, r.seconds), resolution: r.resolution, userId,
  });
  if (!sub.ok) {
    const refunded = await refund(`omni ${r.op} ${sub.reason}`);
    await releaseDailySlot();
    const code = sub.reason === 'invalid_request' ? 'invalid_input' : sub.reason === 'safety' ? 'content_rejected' : sub.reason === 'not_configured' ? 'not_configured' : 'provider_unavailable';
    return fail(sub.reason === 'invalid_request' || sub.reason === 'safety' ? 422 : 503, code, { refunded });
  }

  const jobId = composeOmniJobId(sub.id, aspect, createdMs, { op: r.op, seconds: billed });
  const token = signGenjutsuCharge({ u: userId, r: ref, j: jobId });
  if (!token) {
    const refunded = await refund('no charge token');
    return fail(503, 'billing_unavailable', { refunded });
  }
  // `taskId`: the job row the Renders tray lists it under, claimed by the chat's card (as in app/api/video/clip).
  return NextResponse.json({
    success: true, op: r.op, jobId: withGenjutsuCharge(jobId, token), taskId: rowId, credits, seconds: billed, outputSeconds: outputSec,
    inputSeconds: Math.round(input.seconds * 10) / 10, resolution: r.resolution, aspect, engine: 'Gemini Omni Flash',
  }, { status: 202 });
}
