/**
 * POST /api/genjutsu/generate — start ONE VFX generation. Sign-in required; the price is reserved BEFORE the provider is
 * called and refunded on every failure; nothing is ever handed to a provider that is not the caller's own upload.
 *
 *   op=scene   → Google Veo 3.1 reference-to-video (lib/genjutsu/veoScene). Priced by lib/genjutsu/pricing — the SAME
 *                function that labels the Generate button; a stale `expectedCredits` is refused (409) before any charge.
 *   op=motion, op=swap → refused 503 `google_only` (they ran on Higgsfield, which has no Google engine; MASTER TASK v3.1).
 *
 * A scene answers 202 `{ success, jobId, credits, refsUsed, refsTotal, … }` — the client then polls
 * GET /api/genjutsu/status?id=<jobId>. A closed op answers 423 `locked` (the panel never offers one that is not open;
 * this is the answer to a forged call), a rejected request 400/422 with `issues`, money 402/409, an outage 503 —
 * `refunded: true` ONLY when the credit-back actually landed.
 *
 * ⚠️ maxDuration 60 here, but vercel.json's `app/api/**` glob grants 15 s and overrides it (see the note in
 * app/api/video/longform/route.ts): the integrator must add `app/api/genjutsu/**` there. Every step below is short
 * (references are downscaled in the browser; the submit is one POST), so even at 15 s the usual request completes — and
 * the reservation is stamped `_reserve` on a durable row BEFORE the provider call so the render drainer can refund a
 * request the platform killed mid-flight.
 *
 * ⚠️ THE ORDER IS THE SAFETY: validate (free) → rate / cap → owner-check + sign →
 * translate the user's line → file the job row → RESERVE → submit once → on any miss refund by ref (what the LEDGER
 * shows, once) and fail the row. A ledger that cannot answer — including "no RPC at all" — is a 503, never a free render.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { promptToEnglish } from '@/lib/ai/promptToEnglish';
import { billingLocale, ledgerUnavailableBody } from '@/lib/api/billingCopy';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { opStatuses } from '@/lib/genjutsu/capabilities';
import { genjutsuChargeReady, genjutsuChargeRef, genjutsuJobId, composeVeoJobId, signGenjutsuCharge, withGenjutsuCharge } from '@/lib/genjutsu/chargeToken';
import { ownsUploadPath, parseGenjutsuRequest, type GenjutsuRequest } from '@/lib/genjutsu/contract';
import { ENGINES, modelLabel } from '@/lib/genjutsu/engines';
import { genjutsuCredits } from '@/lib/genjutsu/pricing';
import { composeGenjutsuPrompt, getPreset } from '@/lib/genjutsu/presets';
import { selectReferences } from '@/lib/genjutsu/selection';
import { GENJUTSU_RATE, claimDailySlot, fail, issuesOf, releaseDailySlot, signOwnedPaths } from '@/lib/genjutsu/serverCommon';
import { submitScene, type SceneSubmit } from '@/lib/genjutsu/veoScene';
import { reportError } from '@/lib/observability/report-error';
import { claimIdempotencyKey, hashPayload, releaseIdempotencyKey } from '@/lib/orchestrator/idempotency';
import { createJob, failJob } from '@/lib/orchestrator/jobs';
import { deductCredits, hasSufficientBalance, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';
import { readJson } from '@/lib/studio/http';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const ROUTE = '/api/genjutsu/generate';
/** A Veo clip is fetched within seconds of the submit; an hour is generous without leaving a long-lived link around. */
const SCENE_REF_TTL_SEC = 3_600;

/** What the user sees of a failed submit: a code the studio's error mapper already translates (serviceError.ts). */
function submitFailure(sub: Extract<SceneSubmit, { ok: false }>, refunded: boolean): NextResponse {
  switch (sub.reason) {
    case 'invalid_request': return fail(422, 'invalid_input', { refunded });
    case 'safety': return fail(422, 'content_rejected', { refunded });
    case 'not_configured': return fail(503, 'not_configured', { refunded });
    // quota (OUR prepay is out), auth (OUR credentials), rate limits, 5xx, an ambiguous create, the platform budget:
    // all are our outage, never the user's fault, and the user is told to try again — never to "check their account".
    default: return fail(503, 'provider_unavailable', { refunded });
  }
}

/** A short in-flight lock on the whole request signature: a double tap must not start (and charge) a second render. */
async function claimInflight(userId: string, r: GenjutsuRequest): Promise<(() => Promise<void>) | null> {
  const sig = await hashPayload({
    op: r.op, p: r.preset, t: r.prompt, a: r.aspect, q: r.quality,
    v: r.video?.path ?? null, refs: r.references.map((x) => `${x.ref}:${x.role}`),
  });
  const key = `genjutsu:${r.op}:${sig}`;
  if (!(await claimIdempotencyKey(userId, key, 120))) return null;
  return async () => { await releaseIdempotencyKey(userId, key).catch(() => undefined); };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const locale = billingLocale(req);

  // 1. Who. A guest may look at the panel; only an account may generate (the browser stops them first — this is the
  //    answer to a direct POST).
  let userId: string | null = null;
  try {
    userId = (await authedClientFromRequest(req)).user?.id ?? null;
  } catch {
    userId = null; // an auth outage reads as "no session" — never as a user
  }
  if (!userId || mustSignInToGenerate(userId)) return NextResponse.json(signInToGenerateBody(locale), { status: 401 });

  // 2. What. Bounded read, then the one contract the browser and the tests share. Free to refuse, so it comes first.
  const raw = await readJson(req);
  const parsed = parseGenjutsuRequest(raw);
  if (!parsed.ok) return fail(400, 'invalid_request', { issues: issuesOf(parsed.issues) });
  const r = parsed.value;

  // 3. Is the op open? A locked op never reaches a provider, whatever the client believed.
  if (!opStatuses()[r.op].open) return fail(423, 'locked', { op: r.op });
  // Motion and swap run on Higgsfield, which has no Google engine: refused here, before any rate or charge, whatever
  // MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1). `scene` is Veo.
  if (r.op !== 'scene') return refuseOutsideEngine(req);
    // Admin service switch (lib/server/serviceSwitches): a switched-off tool is refused here, before any charge.
    const serviceOff = await serviceOffResponse('vfx');
    if (serviceOff) return serviceOff;

  // 4. How often. Per account (an IP rotation must not defeat a cap on a cost-bearing mint).
  const limited = await checkRateLimitByKey(userId, GENJUTSU_RATE);
  if (limited) return limited;

  // Every path the request names must be the caller's own — checked up front, for the photos the engine will not use too.
  const named = [...(r.video ? [r.video.path] : []), ...r.references.map((x) => x.ref)];
  const stranger = named.findIndex((p) => !ownsUploadPath(p, userId));
  if (stranger >= 0) return fail(422, 'invalid_input', { issues: [{ path: stranger === 0 && r.video ? 'video.path' : 'references', code: 'not_owner' }] });

  // 5. A double tap on the same request is one render, not two.
  const release = await claimInflight(userId, r);
  if (!release) return fail(409, 'duplicate_request');
  try {
    return await startScene(userId, r, locale);
  } finally {
    await release();
  }
}

// ─── scene — Veo 3.1 reference-to-video ─────────────────────────────────────────────────────────────────────────

async function startScene(userId: string, r: GenjutsuRequest, locale: ReturnType<typeof billingLocale>): Promise<NextResponse> {
  const engine = ENGINES.scene;
  // The engine takes up to 3 photos; the SERVER picks them (selection.ts), whatever the browser sent.
  const pick = selectReferences(r.references.map((x) => ({ id: x.ref, role: x.role })), engine.maxRefs);

  // THE number on the bill is the number on the button: the same function, and a stale button is refused before a charge.
  const credits = genjutsuCredits({ op: 'scene', refsUsed: pick.used.length, quality: r.quality }) as number;
  if (r.expectedCredits !== null && r.expectedCredits !== credits) return fail(409, 'price_changed', { credits });

  // Cheap refusals before anything is reserved: a signing key to authorise the refund, and a balance that can pay.
  if (!genjutsuChargeReady()) return NextResponse.json(ledgerUnavailableBody(locale), { status: 503 });
  if (!(await hasSufficientBalance(userId, credits))) return fail(402, 'insufficient_credits', { needed: credits });

  const signed = await signOwnedPaths(userId, pick.used.map((u) => u.id), SCENE_REF_TTL_SEC);
  if (!signed.ok) return fail(422, 'invalid_input', { issues: [{ path: `references.${signed.index}`, code: signed.code }] });

  // The preset's English prompt + the user's line, translated to English (fail-open: returns the original on any miss).
  const english = r.prompt ? await promptToEnglish(r.prompt, 'video') : '';
  const prompt = composeGenjutsuPrompt({ preset: getPreset(r.preset), op: 'scene', userText: english, roles: pick.used.map((u) => u.role) });

  if (!(await claimDailySlot())) return fail(429, 'rate_limited', { scope: 'daily' });

  const uuid = randomUUID();
  const ref = genjutsuChargeRef(userId, uuid);
  const rowId = genjutsuJobId(uuid);
  const createdMs = Date.now();

  // The durable row comes FIRST and carries `_reserve`, so a request the platform kills after the charge is refunded by
  // the render drainer. A row for a charge that never landed refunds nothing (refundDebitByRef pays only what the
  // ledger shows under the ref).
  const filed = await createJob({
    id: rowId, userId, serviceType: 'film', status: 'processing',
    params: { subtype: 'vfx', op: 'scene', preset: r.preset, prompt: r.prompt.slice(0, 200), aspect: r.aspect, quality: r.quality, refs: pick.used.length, _reserve: { ref, credits } },
  });
  if (!filed) reportError(new Error('genjutsu job row not filed'), { route: ROUTE, ref });

  // RESERVE. Fail closed on every ledger answer that is not "taken": insufficient → 402, error AND skipped (no RPC at
  // all) → 503. A paid render never starts on a charge that could not be taken.
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
    if (!back?.ok) reportError(new Error('genjutsu refund did not land'), { route: ROUTE, ref, why });
    await failJob(rowId, why);
    return !!back?.ok;
  };

  // SUBMIT — exactly once; an ambiguous create is never re-sent (veoScene.ts).
  const sub = await submitScene({ prompt, aspect: r.aspect, quality: r.quality, referenceUrls: signed.urls, userId, sessionId: `genjutsu-${uuid}` });
  if (!sub.ok) {
    console.error('[genjutsu] scene submit failed:', sub.reason);
    const refunded = await refund(`veo ${sub.reason}`);
    await releaseDailySlot();
    return submitFailure(sub, refunded);
  }

  const jobId = composeVeoJobId(sub.operation, sub.aspect, createdMs);
  const token = signGenjutsuCharge({ u: userId, r: ref, j: jobId });
  if (!token) {
    // Unreachable in practice (genjutsuChargeReady was checked) — but a billed render the status route could never
    // authorise must not be left as a charge: give it back.
    const refunded = await refund('no charge token');
    return fail(503, 'billing_unavailable', { refunded });
  }
  return NextResponse.json(
    {
      success: true, op: 'scene', jobId: withGenjutsuCharge(jobId, token), credits,
      refsUsed: pick.used.length, refsTotal: r.referencesTotal, engine: modelLabel('scene', r.quality, 'en'),
    },
    { status: 202 },
  );
}
