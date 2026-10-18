/** @jest-environment node */
// Presentation: who may build a deck, that the whole deck (not just its count) is filed to the Library, and — since the
// final P0/P1 repair run — how it is quoted, confirmed and charged. The build (outline, Imagen, resvg) is a stub. The money path is
// REAL (paidServiceGate → confirmedJob → produceBilling); only the ledger RPCs and the job table are in-memory fakes
// with the database's semantics (primary key on the job id, unique debit ref, unique refund ref).

jest.mock('server-only', () => ({}));

const mockUser = { id: '11111111-1111-4111-8111-111111111111' };
let signedIn = true;
jest.mock('../../../../../lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({ auth: { getUser: async () => ({ data: { user: signedIn ? mockUser : null } }) } }),
  createServiceRoleClient: () => null,
}));
jest.mock('../../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: jest.fn(async () => null),
  RATE_LIMITS: { STORYBOARD: { limit: 30 }, PRESENTATION_USER: { maxRequests: 30, windowMs: 86_400_000, keyPrefix: 'rl:deck:user' } },
}));
const runDeckBuild = jest.fn();
jest.mock('../../../../../lib/services/presentation/deckPipeline', () => ({ runDeckBuild: (...a: unknown[]) => runDeckBuild(...a) }));
const canProceed = jest.fn();
const recordUsage = jest.fn(async () => undefined);
jest.mock('../../../../../lib/services/billing/BillingGuard', () => ({
  canProceed: (...a: unknown[]) => canProceed(...a),
  recordUsage: (...a: unknown[]) => recordUsage(...a),
}));

// ── job table fake: primary key on id ────────────────────────────────────────────────────────────────────────────
type Row = { id: string; userId: string; status: string; stage?: string; params: Record<string, unknown>; error?: string };
const rows = new Map<string, Row>();
let jobInsertFails = false;
const createJob = jest.fn(async (i: { id: string; userId: string; params?: Record<string, unknown> }) => {
  if (jobInsertFails || rows.has(i.id)) return false;
  rows.set(i.id, { id: i.id, userId: i.userId, status: 'pending', params: { ...(i.params ?? {}) } });
  return true;
});
const live = (id: string) => { const r = rows.get(id); return r && (r.status === 'pending' || r.status === 'processing') ? r : null; };
let completeFails = 0;
const completeJob = jest.fn(async (id: string) => {
  if (completeFails > 0) { completeFails--; return false; }
  const r = live(id); if (!r) return false; r.status = 'completed'; return true;
});
const failJob = jest.fn(async (id: string, error: string) => { const r = live(id); if (!r) return false; r.status = 'failed'; r.error = error; return true; });
const updateJobStage = jest.fn(async (id: string, stage: string | null) => { const r = live(id); if (!r) return false; r.status = 'processing'; if (stage) r.stage = stage; return true; });
const recordJobReservation = jest.fn(async (id: string, reserve: { ref: string; credits: number }) => { const r = rows.get(id); if (r) r.params._reserve = reserve; });
const jobSnapshot = jest.fn(async (id: string) => { const r = rows.get(id); return r ? { userId: r.userId, status: r.status, result: null } : null; });
jest.mock('../../../../../lib/orchestrator/jobs', () => ({
  ...jest.requireActual('../../../../../lib/orchestrator/jobs'),
  createJob: (...a: unknown[]) => createJob(...(a as [never])),
  completeJob: (...a: unknown[]) => completeJob(...(a as [never])),
  failJob: (...a: unknown[]) => failJob(...(a as [never, never])),
  updateJobStage: (...a: unknown[]) => updateJobStage(...(a as [never, never])),
  recordJobReservation: (...a: unknown[]) => recordJobReservation(...(a as [never, never])),
  jobSnapshot: (...a: unknown[]) => jobSnapshot(...(a as [never])),
}));

// ── ledger fake: unique debit ref, unique refund ref, balance ───────────────────────────────────────────────────
let balance = 100;
const debits = new Map<string, number>();
const refunds = new Map<string, number>();
let refundFails = false;
let ledgerMode: 'charge' | 'skipped' | 'error' = 'charge';
const deductCreditsOnce = jest.fn(async (_u: string, amount: number, ref: string) => {
  if (ledgerMode === 'skipped') return { ok: false, reason: 'skipped' };
  if (ledgerMode === 'error') return { ok: false, reason: 'error' };
  if (debits.has(ref)) return { ok: false, reason: 'replay', balance };
  if (balance < amount) return { ok: false, reason: 'insufficient', balance };
  balance -= amount; debits.set(ref, amount); return { ok: true, balance };
});
const refundCredits = jest.fn(async (_u: string, amount: number, ref: string) => {
  if (refundFails) return { ok: false, reason: 'error' };
  if (!refunds.has(ref)) { refunds.set(ref, amount); balance += amount; }
  return { ok: true, balance };
});
const deductCredits = jest.fn(async () => ({ ok: true }));
jest.mock('../../../../../lib/orchestrator/ledger', () => ({
  ...jest.requireActual('../../../../../lib/orchestrator/ledger'),
  deductCreditsOnce: (...a: unknown[]) => deductCreditsOnce(...(a as [never, never, never])),
  refundCredits: (...a: unknown[]) => refundCredits(...(a as [never, never, never])),
  deductCredits: (...a: unknown[]) => deductCredits(...(a as [])),
}));
const reportError = jest.fn();
jest.mock('../../../../../lib/observability/report-error', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { checkRateLimitByKey, RATE_LIMITS } from '../../../../../lib/api/rate-limit';
import { CREDIT_COSTS } from '../../../../../lib/credits/pricing';

/** The deck's price in the price book; the owner's approval names this exact number (OWNER_APPROVED_PRICING). */
const DECK = CREDIT_COSTS.presentation_deck;

const png = (i: number) => `https://ours.supabase.co/storage/v1/object/sign/renders/deck/s${i}.png?token=t`;
const COVER = 'https://ours.supabase.co/storage/v1/object/sign/renders/deck/cover.png?token=t';
const slides = (n: number) => Array.from({ length: n }, (_, i) => ({ index: i, title: `Slide ${i}`, bullets: ['a'], pngUrl: png(i), imageUrl: `https://x/${i}.png` }));
const RESULT = {
  deck: { title: 'Tbilisi cafés', language: 'en', theme: 'dark', slides: [] },
  slides: slides(6), coverUrl: COVER, usedFallbackOutline: false, imagesMissing: 0, imagesRequested: true,
  stepsRun: ['outline', 'visuals', 'render'],
};

const post = async (body: Record<string, unknown>) => {
  const res = await POST(new NextRequest('https://myavatar.ge/api/v2/presentation/build', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { res, json: (await res.json()) as Record<string, unknown> };
};
const quoteThenConfirm = async (body: Record<string, unknown>) => {
  const q = await post(body);
  const quote = q.json.quote as { token: string; jobId: string; credits: number };
  const c = await post({ ...body, quoteToken: quote.token, confirm: true });
  return { quote, ...c };
};

const saved = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  process.env.OWNER_APPROVED_PRICING = `dubbing:${CREDIT_COSTS.dubbing_per_minute},presentation:${DECK}`;
  process.env.AGENT_G_QUOTE_SECRET = 'test-quote-secret';
  signedIn = true;
  rows.clear(); debits.clear(); refunds.clear();
  balance = 100; jobInsertFails = false; completeFails = 0; refundFails = false; ledgerMode = 'charge';
  canProceed.mockResolvedValue({ allowed: true, reason: 'ok' });
  runDeckBuild.mockResolvedValue({ ok: true, result: RESULT });
});
afterAll(() => { process.env = saved; });

describe('POST /api/v2/presentation/build — access and input', () => {
  it('turns a signed-out caller away before anything runs', async () => {
    signedIn = false;
    const { res } = await post({ topic: 'Tbilisi cafés' });
    expect(res.status).toBe(401);
    expect(createJob).not.toHaveBeenCalled();
    expect(runDeckBuild).not.toHaveBeenCalled();
  });

  it.each([[{ topic: 'ab' }], [{ topic: 'x'.repeat(601) }], [{}]])('refuses a missing or out-of-range topic: %j', async (body) => {
    const { res, json } = await post(body);
    expect(res.status).toBe(400);
    expect(json.error).toBe('invalid_request');
    expect(checkRateLimitByKey).not.toHaveBeenCalled();
  });

  it('over the daily ceiling nothing is quoted, filed or built', async () => {
    (checkRateLimitByKey as jest.Mock).mockResolvedValueOnce(new Response('{"error":"rate_limited"}', { status: 429 }));
    const { res } = await post({ topic: 'Tbilisi cafés' });
    expect(res.status).toBe(429);
    expect(checkRateLimitByKey).toHaveBeenCalledWith(mockUser.id, RATE_LIMITS.PRESENTATION_USER);
    expect(createJob).not.toHaveBeenCalled();
  });
});

describe('owner approval (the deck runs only at the exact price the owner approved)', () => {
  it.each([undefined, '', `presentation:${DECK - 1}`, `dubbing:${CREDIT_COSTS.dubbing_per_minute}`])('OWNER_APPROVED_PRICING=%p ⇒ unavailable before any ledger or provider call', async (v) => {
    if (v === undefined) delete process.env.OWNER_APPROVED_PRICING; else process.env.OWNER_APPROVED_PRICING = v;
    const { res, json } = await post({ topic: 'Tbilisi cafés' });
    expect(res.status).toBe(503);
    expect(json).toMatchObject({ error: 'service_unavailable', reason: 'pricing_not_approved' });
    expect(deductCreditsOnce).not.toHaveBeenCalled();
    expect(runDeckBuild).not.toHaveBeenCalled();
  });
});

describe('signed quote and explicit confirm', () => {
  it('a first POST is a quote of the deck price; nothing charged or built', async () => {
    const { res, json } = await post({ topic: 'Tbilisi cafés' });
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ requiresConfirm: true, quote: { credits: DECK } });
    expect(deductCreditsOnce).not.toHaveBeenCalled();
    expect(runDeckBuild).not.toHaveBeenCalled();
  });

  it('a token for a different deck, a dubbing token, or no confirm flag is refused', async () => {
    const { json } = await post({ topic: 'Tbilisi cafés' });
    const token = (json.quote as { token: string }).token;
    expect((await post({ topic: 'Batumi bars', quoteToken: token, confirm: true })).res.status).toBe(409);
    expect((await post({ topic: 'Tbilisi cafés', quoteToken: token })).res.status).toBe(409);
    expect((await post({ topic: 'Tbilisi cafés', confirm: true })).res.status).toBe(409);
    expect(deductCreditsOnce).not.toHaveBeenCalled();
  });
});

describe('confirmed build', () => {
  it('reserves the deck price before the build, files every page, reports the charge', async () => {
    const { quote, res, json } = await quoteThenConfirm({ topic: '  Tbilisi   cafés ', slideCount: 6, language: 'en', withImages: true });
    expect(res.status).toBe(200);
    expect(deductCreditsOnce).toHaveBeenCalledWith(mockUser.id, DECK, `presentation:${quote.jobId}`);
    expect(deductCreditsOnce.mock.invocationCallOrder[0]).toBeLessThan(runDeckBuild.mock.invocationCallOrder[0]);
    expect(runDeckBuild).toHaveBeenCalledWith({ topic: 'Tbilisi cafés', slideCount: 6, language: 'en', theme: 'dark', withImages: true }, { jobId: quote.jobId });
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({ id: quote.jobId, serviceType: 'image', params: { subtype: 'presentation', slides: 6, language: 'en' } }));
    expect(completeJob).toHaveBeenCalledWith(quote.jobId, {
      signedUrl: COVER,
      result: { subtype: 'presentation', slideCount: 6, coverUrl: COVER, url: COVER, slides: RESULT.slides.map((s) => ({ index: s.index, pngUrl: s.pngUrl })) },
    });
    expect(json).toMatchObject({ status: 'completed', persisted: true, creditsCharged: DECK, title: 'Tbilisi cafés', coverUrl: COVER });
    expect(balance).toBe(100 - DECK);
    expect(recordUsage).toHaveBeenCalledTimes(1);
  });

  it('a deck with no cover is filed under its first page; a degraded deck says so', async () => {
    runDeckBuild.mockResolvedValue({ ok: true, result: { ...RESULT, coverUrl: null, usedFallbackOutline: true, imagesMissing: 2 } });
    const { quote, json } = await quoteThenConfirm({ topic: 'Tbilisi cafés', withImages: true });
    expect(completeJob).toHaveBeenCalledWith(quote.jobId, expect.objectContaining({ signedUrl: png(0), result: expect.objectContaining({ coverUrl: null, url: png(0) }) }));
    expect(json.warnings).toEqual({ usedFallbackOutline: true, imagesMissing: 2, imagesRequested: true });
  });

  it('holds the slide count to 3–12 and defaults the language to Georgian', async () => {
    await quoteThenConfirm({ topic: 'Tbilisi cafés', slideCount: 50 });
    expect(runDeckBuild).toHaveBeenLastCalledWith(expect.objectContaining({ slideCount: 12, language: 'ka', withImages: false }), expect.anything());
  });

  it('a short balance answers 402 and nothing is built', async () => {
    balance = 10;
    const { res } = await quoteThenConfirm({ topic: 'Tbilisi cafés' });
    expect(res.status).toBe(402);
    expect(runDeckBuild).not.toHaveBeenCalled();
  });

  it('JOB CREATION FAILURE: nothing charged, nothing built', async () => {
    const { json } = await post({ topic: 'Tbilisi cafés' });
    jobInsertFails = true;
    const r = await post({ topic: 'Tbilisi cafés', quoteToken: (json.quote as { token: string }).token, confirm: true });
    expect(r.res.status).toBe(503);
    expect(deductCreditsOnce).not.toHaveBeenCalled();
    expect(runDeckBuild).not.toHaveBeenCalled();
  });

  it('CONCURRENT confirmations: one debit, one build', async () => {
    const { json } = await post({ topic: 'Tbilisi cafés' });
    const confirm = { topic: 'Tbilisi cafés', quoteToken: (json.quote as { token: string }).token, confirm: true };
    const r = await Promise.all([post(confirm), post(confirm)]);
    expect(r.map((x) => x.res.status).sort()).toEqual([200, 409]);
    expect(debits.size).toBe(1);
    expect(runDeckBuild).toHaveBeenCalledTimes(1);
  });

  it('a failed step refunds exactly once; a thrown build refunds once; an exhausted budget refunds', async () => {
    runDeckBuild.mockResolvedValueOnce({ ok: false, step: 'outline', error: 'gemini down' });
    const a = await quoteThenConfirm({ topic: 'Tbilisi cafés' });
    expect(a.res.status).toBe(502);
    expect(a.json).toMatchObject({ error: 'deck_failed', step: 'outline', refunded: true });
    expect(rows.get(a.quote.jobId)).toMatchObject({ status: 'failed', error: 'outline: gemini down' });
    runDeckBuild.mockRejectedValueOnce(new Error('boom'));
    const b = await quoteThenConfirm({ topic: 'Kutaisi' });
    expect(b.res.status).toBe(500);
    canProceed.mockResolvedValue({ allowed: false, reason: 'daily_cap' });
    const c = await quoteThenConfirm({ topic: 'Batumi' });
    expect(c.res.status).toBe(429);
    expect(refundCredits).toHaveBeenCalledTimes(3);
    expect(refunds.size).toBe(3);
    expect(balance).toBe(100);
  });

  it('a refund that does not land is not reported as refunded; the row stays reapable', async () => {
    refundFails = true;
    runDeckBuild.mockResolvedValueOnce({ ok: false, step: 'render', error: 'x' });
    const { quote, json } = await quoteThenConfirm({ topic: 'Tbilisi cafés' });
    expect(json).toMatchObject({ refunded: false, refundPending: true });
    expect(rows.get(quote.jobId)?.status).toBe('processing');
  });

  it('PERSISTENCE FAILURE: never reported as a completed job', async () => {
    completeFails = 2;
    const { json } = await quoteThenConfirm({ topic: 'Tbilisi cafés' });
    expect(json).toMatchObject({ status: 'unpersisted', persisted: false });
  });
});
