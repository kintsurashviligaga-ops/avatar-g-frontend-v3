/** @jest-environment node */
// Dubbing: who may start one, what source it may read, and — since the final P0/P1 repair run — how it is priced and
// charged. The pipeline itself (STT, TTS) is lib/services/dubbing's own suites; here it is a stub. The money path is
// REAL (paidServiceGate → confirmedJob → produceBilling); only the ledger RPCs and the job table are in-memory fakes
// with the database's semantics (primary key on the job id, unique debit ref, unique refund ref).

jest.mock('server-only', () => ({}));

const mockUser = { id: '11111111-1111-4111-8111-111111111111' };
const OTHER = '22222222-2222-4222-8222-222222222222';
let signedIn = true;
jest.mock('../../../../../lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({ auth: { getUser: async () => ({ data: { user: signedIn ? mockUser : null } }) } }),
  createServiceRoleClient: () => null,
}));
jest.mock('../../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: jest.fn(async () => null),
  RATE_LIMITS: { AI: { limit: 10 }, DUBBING_USER: { maxRequests: 10, windowMs: 86_400_000, keyPrefix: 'rl:dub:user' } },
}));
const runDubbing = jest.fn();
jest.mock('../../../../../lib/services/dubbing/dubbingPipeline', () => ({ runDubbing: (...a: unknown[]) => runDubbing(...a) }));
const extractAudioTrack = jest.fn();
jest.mock('../../../../../lib/services/dubbing/dubbingFfmpeg', () => ({ extractAudioTrack: (...a: unknown[]) => extractAudioTrack(...a) }));
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
const createSignedAssetUrl = jest.fn();
jest.mock('../../../../../lib/orchestrator/storage-adapter', () => ({
  ...jest.requireActual('../../../../../lib/orchestrator/storage-adapter'),
  createSignedAssetUrl: (...a: unknown[]) => createSignedAssetUrl(...a),
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

const SRC = 'https://cdn.example.com/talk.mp4';
const SIGNED = 'https://ours.supabase.co/storage/v1/object/sign/uploads/clip.mp4?token=t';
const DUB = 'https://ours.supabase.co/storage/v1/object/sign/renders/dub.mp4?token=d';
const RESULT = {
  videoUrl: DUB, audioUrl: 'https://ours.supabase.co/a.mp3', subtitlesUrl: 'https://ours.supabase.co/s.srt',
  segments: [{}, {}, {}], detectedLanguage: 'en', speakers: 2, minutes: 2,
  stepsRun: ['extract_audio', 'transcribe', 'translate', 'synthesize', 'mix', 'mux'], droppedLines: 1, untranslatedLines: 0,
};
const track = (durationSec: number | null) => ({ buffer: Buffer.alloc(2048), durationSec });

const post = async (body: Record<string, unknown>) => {
  const res = await POST(new NextRequest('https://myavatar.ge/api/v2/dubbing/start', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { res, json: (await res.json()) as Record<string, unknown> };
};
/** The panel's two steps: ask for a quote, then press Confirm with the token. */
const quoteThenConfirm = async (body: Record<string, unknown>) => {
  const q = await post(body);
  const quote = q.json.quote as { token: string; jobId: string; credits: number };
  const c = await post({ ...body, quoteToken: quote.token, confirm: true });
  return { quote, ...c };
};

const saved = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  process.env.OWNER_APPROVED_PRICING = 'dubbing:10';
  process.env.AGENT_G_QUOTE_SECRET = 'test-quote-secret';
  signedIn = true;
  rows.clear(); debits.clear(); refunds.clear();
  balance = 100; jobInsertFails = false; completeFails = 0; refundFails = false; ledgerMode = 'charge';
  canProceed.mockResolvedValue({ allowed: true, reason: 'ok' });
  runDubbing.mockResolvedValue({ ok: true, result: RESULT });
  extractAudioTrack.mockResolvedValue(track(95));
  createSignedAssetUrl.mockResolvedValue(SIGNED);
});
afterAll(() => { process.env = saved; });

describe('POST /api/v2/dubbing/start — access and input', () => {
  it('turns a signed-out caller away before anything runs', async () => {
    signedIn = false;
    const { res } = await post({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(res.status).toBe(401);
    expect(extractAudioTrack).not.toHaveBeenCalled();
    expect(runDubbing).not.toHaveBeenCalled();
  });

  it('does not sign another account’s upload, and refuses the request', async () => {
    const { res } = await post({ sourceVideoUrl: `${OTHER}/clip.mp4`, targetLanguage: 'ka' });
    expect(res.status).toBe(400);
    expect(createSignedAssetUrl).not.toHaveBeenCalled();
    expect(extractAudioTrack).not.toHaveBeenCalled();
  });

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost:3000/v.mp4',
    'https://10.0.0.5/v.mp4',
    'https://metadata.google.internal/v.mp4',
    'https://user:pw@cdn.example.com/v.mp4',
    'file:///etc/passwd',
  ])('refuses a source that is not a public http(s) address: %s', async (sourceVideoUrl) => {
    const { res, json } = await post({ sourceVideoUrl, targetLanguage: 'ka' });
    expect(res.status).toBe(400);
    expect(json.error).toBe('invalid_request');
    expect(extractAudioTrack).not.toHaveBeenCalled();
  });

  it('refuses a dub into the language the video is already in', async () => {
    const { res } = await post({ sourceVideoUrl: SRC, sourceLanguage: 'ka', targetLanguage: 'ka' });
    expect(res.status).toBe(400);
  });

  it('a request that fails validation spends none of the daily allowance', async () => {
    await post({ sourceVideoUrl: 'http://169.254.169.254/x.mp4', targetLanguage: 'ka' });
    expect(checkRateLimitByKey).not.toHaveBeenCalled();
  });

  it('over the daily ceiling nothing is measured, filed or run', async () => {
    (checkRateLimitByKey as jest.Mock).mockResolvedValueOnce(new Response('{"error":"rate_limited"}', { status: 429 }));
    const { res } = await post({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(res.status).toBe(429);
    expect(checkRateLimitByKey).toHaveBeenCalledWith(mockUser.id, RATE_LIMITS.DUBBING_USER);
    expect(extractAudioTrack).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
  });
});

describe('owner approval (prices are PROPOSED, not approved)', () => {
  it.each([undefined, '', 'dubbing:9', 'dubbing', 'presentation:15', 'dubbing:10:x'])('OWNER_APPROVED_PRICING=%p ⇒ unavailable before ffmpeg, ledger or provider', async (v) => {
    if (v === undefined) delete process.env.OWNER_APPROVED_PRICING; else process.env.OWNER_APPROVED_PRICING = v;
    const { res, json } = await post({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(res.status).toBe(503);
    expect(json).toMatchObject({ error: 'service_unavailable', reason: 'pricing_not_approved' });
    expect(extractAudioTrack).not.toHaveBeenCalled();
    expect(deductCreditsOnce).not.toHaveBeenCalled();
    expect(runDubbing).not.toHaveBeenCalled();
  });
});

describe('server-measured price and signed quote', () => {
  it('a first POST is a quote: measured on the server, nothing charged, nothing run', async () => {
    extractAudioTrack.mockResolvedValueOnce(track(95));
    const { res, json } = await post({ sourceVideoUrl: SRC, targetLanguage: 'ka', durationSec: 10 });
    expect(res.status).toBe(200);
    expect(json.requiresConfirm).toBe(true);
    expect(json.quote).toMatchObject({ credits: 20, minutes: 2, durationSec: 95 });
    expect(deductCreditsOnce).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
    expect(runDubbing).not.toHaveBeenCalled();
  });

  it('UNDER-DECLARED duration buys nothing: the price is the measured length, never the declared one', async () => {
    extractAudioTrack.mockResolvedValue(track(241));
    const { res, json } = await quoteThenConfirm({ sourceVideoUrl: SRC, targetLanguage: 'ka', durationSec: 1 });
    expect(res.status).toBe(200);
    expect(deductCreditsOnce).toHaveBeenCalledWith(mockUser.id, 50, expect.stringMatching(/^dubbing:/));
    expect(json.creditsCharged).toBe(50);
    expect(deductCredits).not.toHaveBeenCalled(); // no after-the-fact top-up exists
  });

  it('a source over five minutes (measured) is refused before any job or charge', async () => {
    extractAudioTrack.mockResolvedValueOnce(track(301));
    const { res, json } = await post({ sourceVideoUrl: SRC, targetLanguage: 'ka', durationSec: 30 });
    expect(res.status).toBe(413);
    expect(json).toMatchObject({ error: 'source_too_long', maxSourceSec: 300 });
    expect(createJob).not.toHaveBeenCalled();
  });

  it.each([null, 0])('an unmeasurable source (duration %p) is refused, nothing charged', async (d) => {
    extractAudioTrack.mockResolvedValueOnce(d === null ? null : track(d));
    const { res, json } = await post({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(res.status).toBe(422);
    expect(json.error).toBe('duration_unmeasurable');
    expect(deductCreditsOnce).not.toHaveBeenCalled();
  });

  it('confirm without a token, a forged token, another user’s token or a changed request is refused (409), nothing charged', async () => {
    const body = { sourceVideoUrl: SRC, targetLanguage: 'ka' };
    const { json } = await post(body);
    const token = (json.quote as { token: string }).token;
    for (const attempt of [
      { ...body, confirm: true },
      { ...body, quoteToken: token },                                   // no explicit confirm
      { ...body, quoteToken: `${token}x`, confirm: true },              // forged signature
      { ...body, targetLanguage: 'ru', quoteToken: token, confirm: true }, // changed request
    ]) {
      const r = await post(attempt);
      expect(r.res.status).toBe(409);
    }
    process.env.AGENT_G_QUOTE_SECRET = 'another-key';
    expect((await post({ ...body, quoteToken: token, confirm: true })).res.status).toBe(409);
    expect(deductCreditsOnce).not.toHaveBeenCalled();
    expect(runDubbing).not.toHaveBeenCalled();
  });

  it('a source that measures longer at confirm than at quote needs a new quote', async () => {
    const body = { sourceVideoUrl: SRC, targetLanguage: 'ka' };
    extractAudioTrack.mockResolvedValueOnce(track(50));
    const { json } = await post(body);
    extractAudioTrack.mockResolvedValueOnce(track(200));
    const r = await post({ ...body, quoteToken: (json.quote as { token: string }).token, confirm: true });
    expect(r.res.status).toBe(409);
    expect(r.json.error).toBe('quote_price_changed');
    expect(deductCreditsOnce).not.toHaveBeenCalled();
  });

  it('with no signing key there are no quotes (fail closed)', async () => {
    delete process.env.AGENT_G_QUOTE_SECRET;
    const prev = process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { res } = await post({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    if (prev !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prev;
    expect(res.status).toBe(503);
  });
});

describe('confirmed run: reserve → provider → persist', () => {
  it('reserves before the provider, reuses the measured track, files the dub as a Library video, reports the charge', async () => {
    const { quote, res, json } = await quoteThenConfirm({ sourceVideoUrl: `${mockUser.id}/clip.mp4`, targetLanguage: 'ka' });
    expect(res.status).toBe(200);
    expect(json.jobId).toBe(quote.jobId);
    expect(deductCreditsOnce.mock.invocationCallOrder[0]).toBeLessThan(runDubbing.mock.invocationCallOrder[0]);
    expect(runDubbing).toHaveBeenCalledWith(expect.objectContaining({ sourceVideoUrl: SIGNED, targetLanguage: 'ka' }), { jobId: quote.jobId, extracted: track(95) });
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({ id: quote.jobId, userId: mockUser.id, serviceType: 'film', params: { subtype: 'dubbing', targetLanguage: 'ka', minutes: 2 } }));
    expect(rows.get(quote.jobId)).toMatchObject({ status: 'completed', params: { _reserve: { ref: `dubbing:${quote.jobId}`, credits: 20 } } });
    expect(json).toMatchObject({ status: 'completed', persisted: true, creditsCharged: 20, videoUrl: DUB, segments: 3 });
    expect(json.warnings).toEqual({ droppedLines: 1, untranslatedLines: 0, lipSyncSkipped: false });
    expect(balance).toBe(80);
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it('a short balance answers 402; no provider, the job is failed', async () => {
    balance = 5;
    const { quote, res, json } = await quoteThenConfirm({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(res.status).toBe(402);
    expect(json.error).toBe('insufficient_credits');
    expect(runDubbing).not.toHaveBeenCalled();
    expect(rows.get(quote.jobId)?.status).toBe('failed');
  });

  it('a ledger error refuses (503), never dubs for free', async () => {
    ledgerMode = 'error';
    const { res } = await quoteThenConfirm({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(res.status).toBe(503);
    expect(runDubbing).not.toHaveBeenCalled();
  });

  it('JOB CREATION FAILURE: no charge, no provider, no orphan reservation', async () => {
    const body = { sourceVideoUrl: SRC, targetLanguage: 'ka' };
    const { json } = await post(body);
    jobInsertFails = true;
    const r = await post({ ...body, quoteToken: (json.quote as { token: string }).token, confirm: true });
    expect(r.res.status).toBe(503);
    expect(r.json.error).toBe('job_unavailable');
    expect(deductCreditsOnce).not.toHaveBeenCalled();
    expect(runDubbing).not.toHaveBeenCalled();
  });

  it('CONCURRENT confirmations of one quote: exactly one debit, one provider run', async () => {
    const body = { sourceVideoUrl: SRC, targetLanguage: 'ka' };
    const { json } = await post(body);
    const confirm = { ...body, quoteToken: (json.quote as { token: string }).token, confirm: true };
    const results = await Promise.all([post(confirm), post(confirm), post(confirm)]);
    const statuses = results.map((r) => r.res.status).sort();
    expect(statuses).toEqual([200, 409, 409]);
    expect(results.filter((r) => r.json.error === 'duplicate_request')).toHaveLength(2);
    expect(debits.size).toBe(1);
    expect(runDubbing).toHaveBeenCalledTimes(1);
    expect(balance).toBe(80);
  });

  it('a RETRY after success (lost response) is refused, not charged again', async () => {
    const body = { sourceVideoUrl: SRC, targetLanguage: 'ka' };
    const { json } = await post(body);
    const confirm = { ...body, quoteToken: (json.quote as { token: string }).token, confirm: true };
    expect((await post(confirm)).res.status).toBe(200);
    const again = await post(confirm);
    expect(again.res.status).toBe(409);
    expect(again.json).toMatchObject({ error: 'duplicate_request', status: 'completed' });
    expect(debits.size).toBe(1);
    expect(runDubbing).toHaveBeenCalledTimes(1);
  });

  it('a failed leg refunds exactly once and fails the job with its step', async () => {
    runDubbing.mockResolvedValueOnce({ ok: false, step: 'transcribe', error: 'stt unavailable' });
    const { quote, res, json } = await quoteThenConfirm({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(res.status).toBe(502);
    expect(json).toMatchObject({ error: 'dubbing_failed', step: 'transcribe', refunded: true, refundPending: false });
    expect(refundCredits).toHaveBeenCalledTimes(1);
    expect(refundCredits).toHaveBeenCalledWith(mockUser.id, 20, `dubbing:${quote.jobId}:refund`);
    expect(rows.get(quote.jobId)).toMatchObject({ status: 'failed', error: 'transcribe: stt unavailable' });
    expect(balance).toBe(100);
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('a pipeline that throws refunds once and answers 500', async () => {
    runDubbing.mockRejectedValueOnce(new Error('ffmpeg missing'));
    const { res, json } = await quoteThenConfirm({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(res.status).toBe(500);
    expect(json.refunded).toBe(true);
    expect(balance).toBe(100);
  });

  it('an exhausted platform budget refunds before any provider leg', async () => {
    canProceed.mockResolvedValue({ allowed: false, reason: 'daily_cap' });
    const { quote, res, json } = await quoteThenConfirm({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(res.status).toBe(429);
    expect(json).toMatchObject({ error: 'budget_exceeded', reason: 'daily_cap', refunded: true });
    expect(runDubbing).not.toHaveBeenCalled();
    expect(rows.get(quote.jobId)?.status).toBe('failed');
    expect(balance).toBe(100);
  });

  it('a REFUND THAT DOES NOT LAND is never reported as refunded; the job stays live for the drainer', async () => {
    refundFails = true;
    runDubbing.mockResolvedValueOnce({ ok: false, step: 'mix', error: 'x' });
    const { quote, json } = await quoteThenConfirm({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(json).toMatchObject({ refunded: false, refundPending: true });
    const row = rows.get(quote.jobId)!;
    expect(row.status).toBe('processing'); // reapable — not failed
    expect(row.params._reserve).toEqual({ ref: `dubbing:${quote.jobId}`, credits: 20 });
    expect(reportError).toHaveBeenCalled();
  });

  it('WORKER CRASH: the reserved row is processing with its _reserve stamp before the provider runs (drainer can refund)', async () => {
    let seen: Row | undefined;
    runDubbing.mockImplementationOnce(async (_r: unknown, o: { jobId: string }) => { seen = { ...rows.get(o.jobId)!, params: { ...rows.get(o.jobId)!.params } }; throw new Error('killed'); });
    await quoteThenConfirm({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(seen).toMatchObject({ status: 'processing', stage: 'reserved' });
    expect(seen?.params._reserve).toMatchObject({ credits: 20 });
  });

  it('PERSISTENCE FAILURE: the result is returned but never reported as a completed job', async () => {
    completeFails = 2;
    const { res, json } = await quoteThenConfirm({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ status: 'unpersisted', persisted: false, videoUrl: DUB });
    expect(completeJob).toHaveBeenCalledTimes(2);
    expect(reportError).toHaveBeenCalled();
  });

  it('a dev/test ledger that is not provisioned runs uncharged and reports 0 credits charged (never a fake charge)', async () => {
    ledgerMode = 'skipped';
    const { json } = await quoteThenConfirm({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(json.creditsCharged).toBe(0);
  });
});
