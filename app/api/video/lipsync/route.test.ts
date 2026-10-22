/** @jest-environment node */
/**
 * /api/video/lipsync — POST refused, GET still settles the jobs started before (MASTER TASK v3.1).
 *
 * The render engines (HeyGen, Replicate SadTalker / sync) are not Google, so every start answers 503 google_only before
 * any TTS, provider or ledger call, whatever the caller, the body or the env says. Pinned for the jobs already running:
 *   · a reserved job (signed charge token) is NOT deducted again on its successful poll, and is filed in the Library;
 *   · its terminal failure on the poll → exactly one refund of that reservation, to the payer, then the row is closed;
 *   · a job with no (or a forged) token keeps the legacy deduct-on-success, so it is never free.
 * The ledger, providers, TTS and storage are all mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { WRITE: { windowMs: 60_000, max: 30 } },
}));
jest.mock('../../../../lib/ai/lipsync', () => ({
  lipsyncCreate: jest.fn(),
  filmLipsyncCreate: jest.fn(),
  lipsyncFetch: jest.fn(),
  hasLipsyncProvider: jest.fn(() => true),
  lipsyncStatus: jest.fn(() => ({ ready: true })),
  heygenSelfTest: jest.fn(),
  heygenHealthCheck: jest.fn(),
}));
jest.mock('../../../../lib/chat/filmVoiceover', () => ({ textToHostedSpeech: jest.fn() }));
jest.mock('../../../../lib/audio/georgian-voice', () => ({ georgianVoiceId: jest.fn(() => 'voice-ka') }));
jest.mock('../../../../lib/audio/rvc', () => ({ convertSongWithRvc: jest.fn(async () => null) }));
jest.mock('../../../../lib/audio/voiceModel', () => ({ getUserVoiceModel: jest.fn(async () => null), DEMO_VOICE_USER_ID: 'demo' }));
jest.mock('../../../../lib/security/callerMedia', () => ({
  // The owner rule is pinned in lib/security/callerMedia.test.ts; here an https ref passes as given, a path does not.
  resolveCallerMedia: jest.fn(async (v: unknown) =>
    (typeof v === 'string' && /^https:\/\//.test(v) ? { ok: true, url: v, own: false } : { ok: false, reason: 'invalid' })),
}));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({
  uploadAndSign: jest.fn(async () => 'https://x.supabase.co/storage/v1/object/sign/uploads/lipsync/out.mp4?token=t'),
  reSignIfInternal: jest.fn(async (u: string) => u),
  createSignedAssetUrl: jest.fn(async () => null),
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundDebitByRef: jest.fn(async () => ({ ok: true, refunded: 20 })),
}));
jest.mock('../../../../lib/orchestrator/jobs', () => ({
  recordCompletedFilm: jest.fn(async () => undefined),
  createJob: jest.fn(async () => true),
  failJob: jest.fn(async () => undefined),
}));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { deductCredits, refundDebitByRef } from '../../../../lib/orchestrator/ledger';
import { lipsyncCreate, lipsyncFetch, filmLipsyncCreate } from '../../../../lib/ai/lipsync';
import { textToHostedSpeech } from '../../../../lib/chat/filmVoiceover';
import { recordCompletedFilm, createJob, failJob } from '../../../../lib/orchestrator/jobs';
import { creditCostFor } from '../../../../lib/credits/pricing';
import { avatarChargeRef, signAvatarCharge, withChargeToken } from '../../../../lib/billing/avatarCharge';

const deductMock = deductCredits as jest.MockedFunction<typeof deductCredits>;
const refundMock = refundDebitByRef as jest.MockedFunction<typeof refundDebitByRef>;
const createMock = lipsyncCreate as jest.MockedFunction<typeof lipsyncCreate>;
const filmCreateMock = filmLipsyncCreate as jest.MockedFunction<typeof filmLipsyncCreate>;
const fetchJobMock = lipsyncFetch as jest.MockedFunction<typeof lipsyncFetch>;
const ttsMock = textToHostedSpeech as jest.MockedFunction<typeof textToHostedSpeech>;
const COST = creditCostFor('avatar');
const RESERVE_REF = avatarChargeRef('lipsync', 'user-42', '00000000-0000-4000-8000-000000000001');
/** A job the old POST started and reserved: the provider id with its signed charge token. */
const reserved = (job = 'heygen:vid-1') =>
  withChargeToken(job, signAvatarCharge({ k: 'lipsync', u: 'user-42', r: RESERVE_REF, j: job })!);

const BODY = { videoUrl: 'https://cdn.example.com/face.jpg', text: 'გამარჯობა', gender: 'female' };

function post(body: unknown): NextRequest {
  return new NextRequest('https://myavatar.ge/api/video/lipsync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function poll(id: string): NextRequest {
  return new NextRequest(`https://myavatar.ge/api/video/lipsync?id=${encodeURIComponent(id)}`);
}

const ENV = { anon: process.env.FILM_ALLOW_ANONYMOUS, secret: process.env.AVATAR_CHARGE_SECRET };
const realFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  delete process.env.FILM_ALLOW_ANONYMOUS;
  process.env.AVATAR_CHARGE_SECRET = 'test-avatar-charge-secret-0123456789';
  deductMock.mockResolvedValue({ ok: true });
  ttsMock.mockResolvedValue('https://x.supabase.co/tts.mp3');
  createMock.mockResolvedValue('heygen:vid-1');
  filmCreateMock.mockResolvedValue('sync:pred-1');
  // The GET re-hosts the finished video — stub the download so nothing leaves the process.
  global.fetch = jest.fn(async () => new Response(new Uint8Array(2048), { status: 200 })) as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
});
afterAll(() => {
  if (ENV.anon === undefined) delete process.env.FILM_ALLOW_ANONYMOUS; else process.env.FILM_ALLOW_ANONYMOUS = ENV.anon;
  if (ENV.secret === undefined) delete process.env.AVATAR_CHARGE_SECRET; else process.env.AVATAR_CHARGE_SECRET = ENV.secret;
});

function expectNothingPaid(): void {
  expect(ttsMock).not.toHaveBeenCalled();
  expect(createMock).not.toHaveBeenCalled();
  expect(filmCreateMock).not.toHaveBeenCalled();
  expect(deductMock).not.toHaveBeenCalled();
  expect(refundMock).not.toHaveBeenCalled();
  expect(createJob).not.toHaveBeenCalled();
}

describe('POST is refused before any voice, charge or render', () => {
  const hold = signAvatarCharge({ k: 'presenter-hold', u: 'user-42', r: avatarChargeRef('presenter-tts', 'user-42', '00000000-0000-4000-8000-00000000000a'), j: null });
  it.each([
    ['a guest', null, {}, BODY],
    ['a signed-in caller', { id: 'user-42' }, {}, BODY],
    ['a film pass', { id: 'user-42' }, {}, { ...BODY, kind: 'film' }],
    ['a presenter fallback with its hold token', { id: 'user-42' }, {}, { characterRef: 'https://myavatar.ge/presenter/default-female.jpg', audioUrl: 'https://x.supabase.co/tts.mp3', forceSadTalker: true, chargeToken: hold }],
    ['the demo flag', null, { FILM_ALLOW_ANONYMOUS: '1' }, BODY],
    ['the old opt-out with an owner approval', { id: 'user-42' }, { MEDIA_GOOGLE_ONLY: '0', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-heygen' }, BODY],
  ])('%s → 503 google_only', async (_l, user, env, body) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    mockUser = user;
    try {
      const res = await POST(post(body));
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ code: 'google_only', jobId: null });
      expectNothingPaid();
    } finally {
      process.env = saved;
    }
  });
});

describe('a reserved job started before the change still settles on its poll', () => {
  it('success → no second deduct, filed in the Library under the bare id', async () => {
    fetchJobMock.mockResolvedValue({ status: 'succeeded', url: 'https://provider.example/out.mp4', error: null });
    const done = await GET(poll(reserved()));
    expect(await done.json()).toMatchObject({ done: true, url: expect.stringContaining('supabase.co') });
    expect(fetchJobMock).toHaveBeenCalledWith('heygen:vid-1'); // the provider sees the bare id
    await GET(poll(reserved())); // a repeated poll changes nothing
    expect(deductMock).not.toHaveBeenCalled();
    expect(refundMock).not.toHaveBeenCalled();
    expect(recordCompletedFilm).toHaveBeenCalledWith(expect.objectContaining({ id: 'lipsync:heygen:vid-1', userId: 'user-42' }));
  });

  it.each([
    ['failed', { status: 'failed', url: null, error: 'render crashed' }],
    ['canceled', { status: 'canceled', url: null, error: null }],
    ['succeeded without a file', { status: 'succeeded', url: null, error: null }],
  ])('terminal poll verdict (%s) → one refund of the reserved ref, to the payer', async (_label, verdict) => {
    fetchJobMock.mockResolvedValue(verdict);
    mockUser = null; // the refund follows the signed token, not whoever happens to be polling
    const res = await GET(poll(reserved()));
    expect(await res.json()).toMatchObject({ done: true, url: null });
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock).toHaveBeenCalledWith('user-42', RESERVE_REF, COST);
    expect(deductMock).not.toHaveBeenCalled();
  });

  it('a still-processing poll neither charges nor refunds', async () => {
    fetchJobMock.mockResolvedValue({ status: 'processing', url: null, error: null });
    expect(await (await GET(poll(reserved()))).json()).toEqual({ done: false });
    expect(refundMock).not.toHaveBeenCalled();
    expect(deductMock).not.toHaveBeenCalled();
  });

  it('a terminal failure reports refunded:true and closes the row AFTER the refund', async () => {
    fetchJobMock.mockResolvedValue({ status: 'failed', url: null, error: 'RuntimeError: ANTIALIAS' });
    const j = await (await GET(poll(reserved()))).json();
    // `error` stays the raw text on purpose: the composer reads it to retry SadTalker's transient crash only.
    expect(j).toEqual({ done: true, url: null, error: 'RuntimeError: ANTIALIAS', refunded: true });
    expect(failJob).toHaveBeenCalledWith('lipsync:heygen:vid-1', expect.any(String));
    expect(refundMock.mock.invocationCallOrder[0]).toBeLessThan((failJob as jest.Mock).mock.invocationCallOrder[0]!);
  });

  it('a refund that did NOT land says so, and leaves the row live for the settle cron to retry', async () => {
    refundMock.mockResolvedValueOnce({ ok: false, reason: 'error', refunded: 0 });
    fetchJobMock.mockResolvedValue({ status: 'failed', url: null, error: 'x' });
    const j = await (await GET(poll(reserved()))).json();
    expect(j.refunded).toBe(false);
    expect(failJob).not.toHaveBeenCalled();
  });
});

describe('legacy ids (no token) keep deduct-on-success — never free', () => {
  beforeEach(() => { mockUser = { id: 'user-42' }; });

  it('a bare id is charged once on success under the legacy per-job ref', async () => {
    fetchJobMock.mockResolvedValue({ status: 'succeeded', url: 'https://provider.example/out.mp4', error: null });
    await GET(poll('heygen:old-job'));
    expect(deductMock).toHaveBeenCalledTimes(1);
    expect(deductMock).toHaveBeenCalledWith('user-42', COST, 'avatar:lipsync:heygen:old-job:user-42');
  });

  it('a token re-pointed at another job is ignored: charged on success, nothing refunded on failure', async () => {
    const t = signAvatarCharge({ k: 'lipsync', u: 'user-42', r: 'avatar:lipsync:x:user-42', j: 'heygen:A' })!;
    fetchJobMock.mockResolvedValue({ status: 'succeeded', url: 'https://provider.example/out.mp4', error: null });
    await GET(poll(withChargeToken('heygen:B', t)));
    expect(deductMock).toHaveBeenCalledWith('user-42', COST, 'avatar:lipsync:heygen:B:user-42');
    fetchJobMock.mockResolvedValue({ status: 'failed', url: null, error: 'x' });
    await GET(poll(withChargeToken('heygen:B', t)));
    expect(refundMock).not.toHaveBeenCalled();
  });
});

describe('the HeyGen probes', () => {
  test('the health probe answers not-ok, so a film skips its lip-sync stage at once', async () => {
    const { heygenHealthCheck } = jest.requireMock('../../../../lib/ai/lipsync') as { heygenHealthCheck: jest.Mock };
    const res = await GET(new NextRequest('https://myavatar.ge/api/video/lipsync?health=heygen'));
    expect(await res.json()).toEqual({ ok: false, reason: 'google_only' });
    expect(heygenHealthCheck).not.toHaveBeenCalled();
  });

  test('the paid self-test is refused', async () => {
    const { heygenSelfTest } = jest.requireMock('../../../../lib/ai/lipsync') as { heygenSelfTest: jest.Mock };
    const res = await GET(new NextRequest('https://myavatar.ge/api/video/lipsync?selftest=heygen'));
    expect(res.status).toBe(503);
    expect(heygenSelfTest).not.toHaveBeenCalled();
  });
});
