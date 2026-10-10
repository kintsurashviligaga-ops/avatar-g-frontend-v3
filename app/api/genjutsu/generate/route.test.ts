/** @jest-environment node */
/**
 * POST /api/genjutsu/generate — the money rules, pinned with every provider and the ledger mocked (no network, no spend).
 *
 *   · the credits are RESERVED before the provider is called, under a fresh server ref, and the durable row carrying
 *     `_reserve` is filed before that;
 *   · EVERY failure after the charge refunds by ref and says `refunded: true` only when the credit-back landed;
 *   · a ledger that cannot answer — including "no RPC at all" — is a 503, never a free render;
 *   · the server (not the browser) picks the photos the engine receives, and only the caller's OWN uploads are signed;
 *   · the number on the button is the number on the bill: a stale `expectedCredits` is refused before any charge.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn() }));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null), RATE_LIMITS: {} }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (t: string) => `EN(${t})`) }));
jest.mock('../../../../lib/platform/redis', () => ({ getRedisClient: () => null }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../../lib/genjutsu/capabilities', () => ({
  opStatuses: jest.fn(),
  SWAP_MODEL_ID: 'hf/genjutsu-swap',
  motionModelId: (q?: string) => (q === 'pro' ? 'hf/kling-3-motion-pro' : 'hf/kling-3-motion-std'),
}));
jest.mock('../../../../lib/genjutsu/veoScene', () => ({ submitScene: jest.fn() }));
jest.mock('../../../../lib/genjutsu/mp4Duration', () => ({ verifyStoredVideo: jest.fn() }));
jest.mock('../../../../lib/genjutsu/serverCommon', () => ({
  ...jest.requireActual('../../../../lib/genjutsu/serverCommon'),
  signOwnedPaths: jest.fn(),
  claimDailySlot: jest.fn(async () => true),
  releaseDailySlot: jest.fn(async () => undefined),
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  hasSufficientBalance: jest.fn(async () => true),
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundDebitByRef: jest.fn(async () => ({ ok: true, refunded: 25 })),
}));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ createJob: jest.fn(async () => true), failJob: jest.fn(async () => undefined) }));
jest.mock('../../../../lib/orchestrator/idempotency', () => ({
  hashPayload: jest.fn(async () => 'sig'),
  claimIdempotencyKey: jest.fn(async () => true),
  releaseIdempotencyKey: jest.fn(async () => undefined),
}));
jest.mock('../../../../lib/studio/runtime', () => ({ getStudioRuntime: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
import { checkRateLimitByKey } from '../../../../lib/api/rate-limit';
import { opStatuses } from '../../../../lib/genjutsu/capabilities';
import { submitScene } from '../../../../lib/genjutsu/veoScene';
import { verifyStoredVideo } from '../../../../lib/genjutsu/mp4Duration';
import { claimDailySlot, releaseDailySlot, signOwnedPaths } from '../../../../lib/genjutsu/serverCommon';
import { genjutsuChargeForPolledId } from '../../../../lib/genjutsu/chargeToken';
import { deductCredits, hasSufficientBalance, refundDebitByRef } from '../../../../lib/orchestrator/ledger';
import { createJob, failJob } from '../../../../lib/orchestrator/jobs';
import { claimIdempotencyKey } from '../../../../lib/orchestrator/idempotency';
import { reportError } from '../../../../lib/observability/report-error';
import { getStudioRuntime } from '../../../../lib/studio/runtime';

const ENV = { ...process.env };
const UID = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
const mine = (n: string) => `omni-uploads/${UID}/${n}`;
const photos = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ ref: mine(`p${i}.jpg`), role: (['wardrobe', 'product', 'character'] as const)[i % 3] }));

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/genjutsu/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const OPEN = { op: 'x', open: true, reason: 'ok' };
const SHUT = { op: 'x', open: false, reason: 'flag_off' };
const status = (over: Record<string, unknown> = {}) => ({ scene: OPEN, motion: SHUT, swap: SHUT, ...over });

const SCENE = { op: 'scene', preset: 'fire', references: photos(12), referencesTotal: 12 };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, GENJUTSU_CHARGE_SECRET: 'test-genjutsu-secret' };
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: { id: UID } });
  (opStatuses as jest.Mock).mockReturnValue(status());
  (checkRateLimitByKey as jest.Mock).mockResolvedValue(null);
  (hasSufficientBalance as jest.Mock).mockResolvedValue(true);
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  (refundDebitByRef as jest.Mock).mockResolvedValue({ ok: true, refunded: 25 });
  (createJob as jest.Mock).mockResolvedValue(true);
  (claimIdempotencyKey as jest.Mock).mockResolvedValue(true);
  (claimDailySlot as jest.Mock).mockResolvedValue(true);
  (signOwnedPaths as jest.Mock).mockImplementation(async (_u: string, paths: string[]) => ({ ok: true, urls: paths.map((p) => `https://signed.example/${p}`) }));
  (submitScene as jest.Mock).mockResolvedValue({ ok: true, operation: 'models/veo-3.1-fast-generate-preview/operations/abc', aspect: '16:9', model: 'veo-3.1-fast', transport: 'gemini', adjustments: [] });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { process.env = ENV; });

// ─── gates, in the order they fire ──────────────────────────────────────────────────────────────────────────────

test('a guest is refused (401) before anything is read, reserved or rendered', async () => {
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: null });
  const res = await POST(post(SCENE));
  expect(res.status).toBe(401);
  expect((await res.json()).authRequired).toBe(true);
  expect(deductCredits).not.toHaveBeenCalled();
  expect(submitScene).not.toHaveBeenCalled();
});

test('an auth outage reads as "no session", never as a user', async () => {
  (authedClientFromRequest as jest.Mock).mockRejectedValue(new Error('supabase down'));
  expect((await POST(post(SCENE))).status).toBe(401);
});

test('an invalid request is 400 with every reason — and costs nothing', async () => {
  const res = await POST(post({ op: 'scene' }));
  expect(res.status).toBe(400);
  expect((await res.json()).issues).toEqual([{ path: 'preset', code: 'preset_or_prompt' }]);
  expect(deductCredits).not.toHaveBeenCalled();
  expect(claimDailySlot).not.toHaveBeenCalled();
});

test('a locked op is 423 and never reaches the ledger or a provider', async () => {
  (opStatuses as jest.Mock).mockReturnValue(status({ scene: SHUT }));
  const res = await POST(post(SCENE));
  expect(res.status).toBe(423);
  expect(await res.json()).toMatchObject({ error: 'locked', op: 'scene' });
  expect(deductCredits).not.toHaveBeenCalled();
  expect(submitScene).not.toHaveBeenCalled();
});

test('the per-account rate limit answers first and nothing else runs', async () => {
  const limited = new Response(JSON.stringify({ error: 'rate' }), { status: 429 });
  (checkRateLimitByKey as jest.Mock).mockResolvedValue(limited);
  const res = await POST(post(SCENE));
  expect(res.status).toBe(429);
  expect(deductCredits).not.toHaveBeenCalled();
  expect((checkRateLimitByKey as jest.Mock).mock.calls[0]![0]).toBe(UID);
});

test("someone else's upload is refused (422 not_owner) — it is never signed, never rendered", async () => {
  const res = await POST(post({ ...SCENE, references: [{ ref: `omni-uploads/${OTHER}/theirs.jpg`, role: 'character' }] }));
  expect(res.status).toBe(422);
  expect((await res.json()).issues).toEqual([{ path: 'references', code: 'not_owner' }]);
  expect(signOwnedPaths).not.toHaveBeenCalled();
  expect(deductCredits).not.toHaveBeenCalled();
});

test('a double tap is ONE render: the in-flight lock refuses the second (409)', async () => {
  (claimIdempotencyKey as jest.Mock).mockResolvedValue(false);
  const res = await POST(post(SCENE));
  expect(res.status).toBe(409);
  expect((await res.json()).error).toBe('duplicate_request');
  expect(deductCredits).not.toHaveBeenCalled();
});

// ─── scene: the reservation, the selection, the price ───────────────────────────────────────────────────────────

test('the job row (carrying `_reserve`) is filed FIRST, the credits are reserved BEFORE the provider, under a fresh server ref', async () => {
  const res = await POST(post(SCENE));
  expect(res.status).toBe(202);
  const order = (m: jest.Mock) => m.mock.invocationCallOrder[0]!;
  expect(order(createJob as jest.Mock)).toBeLessThan(order(deductCredits as jest.Mock));
  expect(order(deductCredits as jest.Mock)).toBeLessThan(order(submitScene as jest.Mock));

  const [uid, amount, ref] = (deductCredits as jest.Mock).mock.calls[0]!;
  expect(uid).toBe(UID);
  expect(amount).toBe(25);
  expect(ref).toMatch(new RegExp(`^genjutsu:reserve:[0-9a-f-]{36}:${UID}$`));
  const row = (createJob as jest.Mock).mock.calls[0]![0];
  expect(row).toMatchObject({ userId: UID, serviceType: 'film', status: 'processing' });
  expect(row.id).toBe(`genjutsu:${ref.split(':')[2]}`);
  expect(row.params).toMatchObject({ subtype: 'vfx', op: 'scene', preset: 'fire', _reserve: { ref, credits: 25 } });
});

test('the returned jobId carries a charge token naming exactly this reservation and operation', async () => {
  const body = await (await POST(post(SCENE))).json();
  const ref = (deductCredits as jest.Mock).mock.calls[0]![2];
  const { jobId, charge } = genjutsuChargeForPolledId(body.jobId);
  expect(jobId).toMatch(/^models\/veo-3\.1-fast-generate-preview\/operations\/abc::16:9::\d+$/);
  expect(charge).toEqual({ u: UID, r: ref, j: jobId });
  expect(body).toMatchObject({ success: true, op: 'scene', credits: 25, engine: 'Veo 3.1 Fast' });
});

test('the SERVER picks the photos: 12 sent, Veo receives the best 3 (one per role, in priority order) and only those are signed', async () => {
  const body = await (await POST(post(SCENE))).json();
  expect(body).toMatchObject({ refsUsed: 3, refsTotal: 12 });
  const signedPaths = (signOwnedPaths as jest.Mock).mock.calls[0]![1] as string[];
  // photos(12): roles cycle wardrobe, product, character — the first of each is p2 (character), p1 (product), p0 (wardrobe).
  expect(signedPaths).toEqual([mine('p2.jpg'), mine('p1.jpg'), mine('p0.jpg')]);
  const sent = (submitScene as jest.Mock).mock.calls[0]![0];
  expect(sent.referenceUrls).toHaveLength(3);
  // The prompt describes ONLY the roles that were really given.
  expect(sent.prompt).toContain('exact person');
  expect(sent.prompt).toContain('product from the reference images');
  expect(sent.prompt).toContain('exact outfit');
});

test('a preset alone is a complete request; the typed line is translated and appended', async () => {
  await POST(post({ op: 'scene', preset: 'ice', prompt: 'ტყეში' }));
  const sent = (submitScene as jest.Mock).mock.calls[0]![0];
  expect(sent.prompt).toContain('Ice VFX');
  expect(sent.prompt).toContain('Extra detail: EN(ტყეში)');
  (submitScene as jest.Mock).mockClear();
  await POST(post({ op: 'scene', preset: 'ice' }));
  expect((submitScene as jest.Mock).mock.calls[0]![0].prompt).not.toContain('Extra detail');
});

test('Standard quality charges the Standard price (83) — through the same function that labels the button', async () => {
  await POST(post({ ...SCENE, quality: 'standard', expectedCredits: 83 }));
  expect((deductCredits as jest.Mock).mock.calls[0]![1]).toBe(83);
});

test('a stale button is refused BEFORE any charge: expectedCredits that is not the server\'s number → 409 price_changed', async () => {
  const res = await POST(post({ ...SCENE, expectedCredits: 24 }));
  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ error: 'price_changed', credits: 25 });
  expect(deductCredits).not.toHaveBeenCalled();
  expect(submitScene).not.toHaveBeenCalled();
});

test('a matching expectedCredits goes through', async () => {
  expect((await POST(post({ ...SCENE, expectedCredits: 25 }))).status).toBe(202);
});

// ─── scene: the failure paths ───────────────────────────────────────────────────────────────────────────────────

test('a balance that cannot pay is 402 before anything is reserved', async () => {
  (hasSufficientBalance as jest.Mock).mockResolvedValue(false);
  const res = await POST(post(SCENE));
  expect(res.status).toBe(402);
  expect(deductCredits).not.toHaveBeenCalled();
  expect(submitScene).not.toHaveBeenCalled();
});

test('the atomic deduct is the real gate: insufficient → 402, the row is closed, NO render', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'insufficient' });
  const res = await POST(post(SCENE));
  expect(res.status).toBe(402);
  expect(submitScene).not.toHaveBeenCalled();
  expect(failJob).toHaveBeenCalledTimes(1);
  expect(releaseDailySlot).toHaveBeenCalled();
});

test('a ledger that failed OR has no RPC at all is a 503 billing_unavailable — it never renders free', async () => {
  for (const reason of ['error', 'skipped'] as const) {
    (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason });
    (submitScene as jest.Mock).mockClear();
    const res = await POST(post(SCENE));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'billing_unavailable' });
    expect(submitScene).not.toHaveBeenCalled();
  }
});

test('no signing key → refuse BEFORE reserving (a charge nothing could refund is never taken)', async () => {
  delete process.env.GENJUTSU_CHARGE_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await POST(post(SCENE));
  expect(res.status).toBe(503);
  expect(deductCredits).not.toHaveBeenCalled();
  expect(submitScene).not.toHaveBeenCalled();
});

test('a submit that fails refunds the reservation BY REF, closes the row, and says refunded:true', async () => {
  (submitScene as jest.Mock).mockResolvedValue({ ok: false, reason: 'unavailable', retryable: true });
  const res = await POST(post(SCENE));
  const ref = (deductCredits as jest.Mock).mock.calls[0]![2];
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ error: 'provider_unavailable', refunded: true });
  expect(refundDebitByRef).toHaveBeenCalledWith(UID, ref, 25);
  expect(failJob).toHaveBeenCalledTimes(1);
  expect(releaseDailySlot).toHaveBeenCalled();
});

test('every Veo refusal refunds and maps to a code the studio already translates (never the provider\'s words)', async () => {
  const cases: Array<[string, number, string]> = [
    ['invalid_request', 422, 'invalid_input'],
    ['safety', 422, 'content_rejected'],
    ['not_configured', 503, 'not_configured'],
    ['quota', 503, 'provider_unavailable'],
    ['auth', 503, 'provider_unavailable'],
    ['rate_limited', 503, 'provider_unavailable'],
    ['ambiguous', 503, 'provider_unavailable'],
    ['budget', 503, 'provider_unavailable'],
  ];
  for (const [reason, status, error] of cases) {
    (submitScene as jest.Mock).mockResolvedValue({ ok: false, reason, retryable: false });
    (refundDebitByRef as jest.Mock).mockClear();
    const res = await POST(post(SCENE));
    const j = await res.json();
    expect([reason, res.status, j.error, j.refunded]).toEqual([reason, status, error, true]);
    expect(refundDebitByRef).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(j)).not.toMatch(/veo|google|gemini|vertex/i);
  }
});

test('a refund that does NOT land is reported loudly and never claimed', async () => {
  (submitScene as jest.Mock).mockResolvedValue({ ok: false, reason: 'unavailable', retryable: true });
  (refundDebitByRef as jest.Mock).mockResolvedValue({ ok: false, reason: 'error', refunded: 0 });
  const j = await (await POST(post(SCENE))).json();
  expect(j.refunded).toBe(false);
  expect(reportError).toHaveBeenCalled();
});

test('the daily cap spent → 429 and nothing was reserved', async () => {
  (claimDailySlot as jest.Mock).mockResolvedValue(false);
  const res = await POST(post(SCENE));
  expect(res.status).toBe(429);
  expect(deductCredits).not.toHaveBeenCalled();
});

test('a reference that cannot be signed is 422 reference_unavailable — nothing reserved', async () => {
  (signOwnedPaths as jest.Mock).mockResolvedValue({ ok: false, code: 'reference_unavailable', index: 1 });
  const res = await POST(post(SCENE));
  expect(res.status).toBe(422);
  expect((await res.json()).issues).toEqual([{ path: 'references.1', code: 'reference_unavailable' }]);
  expect(deductCredits).not.toHaveBeenCalled();
});

// ─── motion — Higgsfield through the studio saga ────────────────────────────────────────────────────────────────

const VIDEO = { path: mine('v.mp4'), durationSec: 12, sizeBytes: 9_000_000 };
const MOTION = { op: 'motion', preset: 'fire', video: VIDEO, references: [{ ref: mine('c.jpg'), role: 'character' }, { ref: mine('p.jpg'), role: 'product' }], referencesTotal: 2, confirmedGel: 7.2 };
const JOB_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function saga(create: jest.Mock) {
  (getStudioRuntime as jest.Mock).mockReturnValue({ saga: { create, quote: jest.fn() } });
}

test('motion: the stored video is MEASURED (not trusted), the saga is given Kling Motion Control\'s input and the confirmed price', async () => {
  (opStatuses as jest.Mock).mockReturnValue(status({ motion: OPEN }));
  (verifyStoredVideo as jest.Mock).mockResolvedValue({ ok: true, durationSec: 11.96, sizeBytes: 9_000_000 });
  const create = jest.fn(async () => ({ ok: true, job: { id: JOB_ID }, price: { credits: 72, gel: 7.2, usd: 2 } }));
  saga(create);
  const res = await POST(post(MOTION));
  expect(res.status).toBe(202);
  expect(verifyStoredVideo).toHaveBeenCalledWith(`https://signed.example/${VIDEO.path}`);
  const call = create.mock.calls[0]![0] as { userId: string; modelId: string; params: Record<string, unknown>; confirmedGel: number };
  expect(call).toMatchObject({ userId: UID, modelId: 'hf/kling-3-motion-std', confirmedGel: 7.2 });
  // Kling takes ONE image: the first character photo (the product photo is not sent).
  expect(call.params).toMatchObject({ image_url: `https://signed.example/${mine('c.jpg')}`, video_url: `https://signed.example/${VIDEO.path}`, keep_original_sound: 'yes', character_orientation: 'video' });
  expect(String(call.params.prompt)).toContain('Fire VFX');
  expect(await res.json()).toMatchObject({ success: true, op: 'motion', jobId: `hf:${JOB_ID}`, credits: 72, refsUsed: 1, refsTotal: 2, seconds: 12 });
  // The route itself charged nothing — the saga did.
  expect(deductCredits).not.toHaveBeenCalled();
});

test('motion: a video the file proves out of range is refused with the FILE\'s reason, whatever the browser claimed', async () => {
  (opStatuses as jest.Mock).mockReturnValue(status({ motion: OPEN }));
  const create = jest.fn();
  saga(create);
  for (const code of ['video_duration', 'video_unreadable', 'video_missing', 'video_size']) {
    (verifyStoredVideo as jest.Mock).mockResolvedValue({ ok: false, code });
    const res = await POST(post(MOTION));
    expect(res.status).toBe(422);
    expect((await res.json()).issues).toEqual([{ path: 'video', code }]);
  }
  expect(create).not.toHaveBeenCalled();
});

test('motion: pro quality runs on the Pro model; the saga\'s own refusals pass through with their codes and the fresh price', async () => {
  (opStatuses as jest.Mock).mockReturnValue(status({ motion: OPEN }));
  (verifyStoredVideo as jest.Mock).mockResolvedValue({ ok: true, durationSec: 12, sizeBytes: 9_000_000 });
  const create = jest.fn(async () => ({ ok: false, code: 'price_changed', price: { credits: 80, gel: 8, usd: 2.2 } }));
  saga(create);
  const res = await POST(post({ ...MOTION, quality: 'pro' }));
  expect((create.mock.calls[0]![0] as { modelId: string }).modelId).toBe('hf/kling-3-motion-pro');
  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ error: 'price_changed', price: { credits: 80 } });
  expect(releaseDailySlot).toHaveBeenCalled();
});

test('motion with no studio runtime (no Supabase service role) is 503 not_configured — nothing charged', async () => {
  (opStatuses as jest.Mock).mockReturnValue(status({ motion: OPEN }));
  (verifyStoredVideo as jest.Mock).mockResolvedValue({ ok: true, durationSec: 12, sizeBytes: 9_000_000 });
  (getStudioRuntime as jest.Mock).mockReturnValue(null);
  const res = await POST(post(MOTION));
  expect(res.status).toBe(503);
  expect((await res.json()).error).toBe('not_configured');
});

test('motion without a character photo, or with a video outside 3–30 s, never gets past the contract', async () => {
  (opStatuses as jest.Mock).mockReturnValue(status({ motion: OPEN }));
  const noChar = await POST(post({ ...MOTION, references: [{ ref: mine('p.jpg'), role: 'product' }] }));
  expect(noChar.status).toBe(400);
  expect((await noChar.json()).issues).toEqual([{ path: 'references', code: 'character_required' }]);
  const long = await POST(post({ ...MOTION, video: { ...VIDEO, durationSec: 41 } }));
  expect(long.status).toBe(400);
  expect(verifyStoredVideo).not.toHaveBeenCalled();
});

test('swap is locked while its model is not registered (423), even with the flag on', async () => {
  (opStatuses as jest.Mock).mockReturnValue(status({ swap: { op: 'swap', open: false, reason: 'engine_missing' } }));
  const res = await POST(post({ op: 'swap', preset: 'anime', video: VIDEO, references: [{ ref: mine('c.jpg'), role: 'character' }] }));
  expect(res.status).toBe(423);
});

test('MEDIA_GOOGLE_ONLY: motion (Higgsfield) is refused before the rate limit or the saga; scene (Veo) still renders', async () => {
  process.env.MEDIA_GOOGLE_ONLY = '1';
  try {
    (opStatuses as jest.Mock).mockReturnValue(status({ motion: OPEN }));
    const create = jest.fn();
    saga(create);
    const res = await POST(post(MOTION));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'google_only' });
    expect(checkRateLimitByKey).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();

    expect((await POST(post(SCENE))).status).toBe(202);
    expect(submitScene).toHaveBeenCalledTimes(1);
  } finally {
    delete process.env.MEDIA_GOOGLE_ONLY;
  }
});
