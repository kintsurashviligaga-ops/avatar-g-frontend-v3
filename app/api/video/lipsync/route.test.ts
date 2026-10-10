/** @jest-environment node */
/**
 * /api/video/lipsync — signed in, and PAID BEFORE the render.
 *
 * ⚠️ This route spends ElevenLabs (TTS) and HeyGen/Replicate (the render) on the platform's keys. It used to charge
 * only on the GET poll's success, behind a balance gate that skipped anonymous callers and failed OPEN on a ledger
 * error — so the presenter template cards brought in unpaid renders. Pinned here:
 *   · anonymous → 401 before any TTS, provider or ledger call;
 *   · a short balance → 402, an unusable ledger → 503, both before any TTS or provider call;
 *   · success → exactly ONE deduct for the whole job (the GET poll of a reserved job does not deduct again);
 *   · a provider / TTS failure, or a terminal failure reported on the poll → exactly one refund of that reservation;
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
import { audioFingerprint, avatarChargeRef, signAvatarCharge, withChargeToken } from '../../../../lib/billing/avatarCharge';

const deductMock = deductCredits as jest.MockedFunction<typeof deductCredits>;
const refundMock = refundDebitByRef as jest.MockedFunction<typeof refundDebitByRef>;
const createMock = lipsyncCreate as jest.MockedFunction<typeof lipsyncCreate>;
const filmCreateMock = filmLipsyncCreate as jest.MockedFunction<typeof filmLipsyncCreate>;
const fetchJobMock = lipsyncFetch as jest.MockedFunction<typeof lipsyncFetch>;
const ttsMock = textToHostedSpeech as jest.MockedFunction<typeof textToHostedSpeech>;
const COST = creditCostFor('avatar');
const RESERVE_REF = /^avatar:lipsync:[0-9a-f-]{36}:user-42$/;

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

describe('anonymous → 401 before any paid work', () => {
  it('never reaches TTS, the provider or the ledger', async () => {
    const res = await POST(post(BODY));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ jobId: null, error: 'auth_required', authRequired: true });
    expect(ttsMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(filmCreateMock).not.toHaveBeenCalled();
    expect(deductMock).not.toHaveBeenCalled();
  });

  it('FILM_ALLOW_ANONYMOUS=1 (demo) renders unbilled with a bare id, as before', async () => {
    process.env.FILM_ALLOW_ANONYMOUS = '1';
    const res = await POST(post(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jobId: 'heygen:vid-1' });
    expect(deductMock).not.toHaveBeenCalled();
  });
});

describe('signed in — the reservation is the gate', () => {
  beforeEach(() => { mockUser = { id: 'user-42' }; });

  it('zero balance → 402 before TTS or the provider', async () => {
    deductMock.mockResolvedValueOnce({ ok: false, reason: 'insufficient' });
    const res = await POST(post(BODY));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ jobId: null, code: 'insufficient_credits', topUpNeeded: true });
    expect(deductMock).toHaveBeenCalledWith('user-42', COST, expect.stringMatching(RESERVE_REF));
    expect(ttsMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it.each(['error', 'skipped'] as const)('ledger %s → 503, never a free render (the old gate failed open here)', async (reason) => {
    deductMock.mockResolvedValueOnce({ ok: false, reason });
    const res = await POST(post(BODY));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ jobId: null, code: 'ledger_unavailable' });
    expect(ttsMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('no signing key → 503 before reserving (a reservation must never strand without its token)', async () => {
    delete process.env.AVATAR_CHARGE_SECRET;
    const prevSr = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const res = await POST(post(BODY));
      expect(res.status).toBe(503);
      expect(deductMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
    } finally {
      if (prevSr !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevSr;
    }
  });

  it('success → exactly one deduct for the whole job: reserved at POST, NOT deducted again on the poll', async () => {
    const res = await POST(post(BODY));
    expect(res.status).toBe(200);
    const { jobId, chargeToken } = (await res.json()) as { jobId: string; chargeToken: string };
    expect(jobId.startsWith('heygen:vid-1~av1.')).toBe(true); // the client's startsWith('heygen:') still works
    expect(typeof chargeToken).toBe('string');
    // The reservation happened BEFORE the TTS and the provider.
    expect(deductMock.mock.invocationCallOrder[0]).toBeLessThan(ttsMock.mock.invocationCallOrder[0]);
    expect(deductMock.mock.invocationCallOrder[0]).toBeLessThan(createMock.mock.invocationCallOrder[0]);

    fetchJobMock.mockResolvedValue({ status: 'succeeded', url: 'https://provider.example/out.mp4', error: null });
    const done = await GET(poll(jobId));
    expect(await done.json()).toMatchObject({ done: true, url: expect.stringContaining('supabase.co') });
    expect(fetchJobMock).toHaveBeenCalledWith('heygen:vid-1'); // the provider sees the bare id
    await GET(poll(jobId)); // a repeated poll changes nothing

    expect(deductMock).toHaveBeenCalledTimes(1);
    expect(deductMock).toHaveBeenCalledWith('user-42', COST, expect.stringMatching(RESERVE_REF));
    expect(refundMock).not.toHaveBeenCalled();
    expect(recordCompletedFilm).toHaveBeenCalledWith(expect.objectContaining({ id: 'lipsync:heygen:vid-1', userId: 'user-42' }));
  });

  it('provider failure at start → exactly one refund of the reservation, no job id', async () => {
    createMock.mockResolvedValueOnce(null);
    const res = await POST(post(BODY));
    expect(await res.json()).toMatchObject({ jobId: null, code: 'provider_failed' });
    const ref = deductMock.mock.calls[0][2];
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock).toHaveBeenCalledWith('user-42', ref, COST);
  });

  it('TTS failure → exactly one refund, and the provider is never called', async () => {
    ttsMock.mockResolvedValueOnce(null);
    const res = await POST(post(BODY));
    expect(await res.json()).toMatchObject({ jobId: null, error: 'tts-failed' });
    expect(createMock).not.toHaveBeenCalled();
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock).toHaveBeenCalledWith('user-42', deductMock.mock.calls[0][2], COST);
  });

  it('a thrown provider error → refunded, not stranded', async () => {
    filmCreateMock.mockRejectedValueOnce(new Error('boom'));
    const res = await POST(post({ ...BODY, kind: 'film' }));
    expect(res.status).toBe(500);
    expect(refundMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['failed', { status: 'failed', url: null, error: 'render crashed' }],
    ['canceled', { status: 'canceled', url: null, error: null }],
    ['succeeded without a file', { status: 'succeeded', url: null, error: null }],
  ])('terminal poll verdict (%s) → one refund of the reserved ref, to the payer', async (_label, verdict) => {
    const { jobId } = (await (await POST(post(BODY))).json()) as { jobId: string };
    const ref = deductMock.mock.calls[0][2];
    fetchJobMock.mockResolvedValue(verdict);
    mockUser = null; // the refund follows the signed token, not whoever happens to be polling
    const res = await GET(poll(jobId));
    expect(await res.json()).toMatchObject({ done: true, url: null });
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock).toHaveBeenCalledWith('user-42', ref, COST);
    expect(deductMock).toHaveBeenCalledTimes(1);
  });

  it('a still-processing poll neither charges nor refunds', async () => {
    const { jobId } = (await (await POST(post(BODY))).json()) as { jobId: string };
    fetchJobMock.mockResolvedValue({ status: 'processing', url: null, error: null });
    expect(await (await GET(poll(jobId))).json()).toEqual({ done: false });
    expect(refundMock).not.toHaveBeenCalled();
    expect(deductMock).toHaveBeenCalledTimes(1);
  });

  const TTS = 'https://x.supabase.co/tts.mp3';
  const PRESENTER_FACE = 'https://myavatar.ge/presenter/default-female.jpg';
  const FALLBACK = { characterRef: PRESENTER_FACE, audioUrl: TTS, forceSadTalker: true, orientation: 'vertical' };
  const holdRef = avatarChargeRef('presenter-tts', 'user-42', '00000000-0000-4000-8000-00000000000a');
  const holdFor = (audio: string | undefined) => signAvatarCharge({ k: 'presenter-hold', u: 'user-42', r: holdRef, j: null, ...(audio ? { a: audioFingerprint(audio) } : {}) });

  it('presenter fallback: a valid presenter-hold token for THIS user is released as the render reserves', async () => {
    const res = await POST(post({ ...FALLBACK, chargeToken: holdFor(TTS) }));
    expect(res.status).toBe(200);
    expect(refundMock).toHaveBeenCalledWith('user-42', holdRef, COST);
    expect(deductMock).toHaveBeenCalledTimes(1); // the render still reserves its own price
  });

  it.each([
    ['a junk face SadTalker cannot read', { ...FALLBACK, characterRef: 'https://attacker.example/no-face.jpg' }],
    ['a different audio file', { ...FALLBACK, audioUrl: 'https://attacker.example/junk.mp3' }],
    ["the video engine (kind:'film') fed a still", { ...FALLBACK, kind: 'film' }],
    ['fresh `text` that replaces the held audio', { ...FALLBACK, text: 'სხვა ტექსტი' }],
  ])('a hold is NOT released toward %s — its failure refund would make the TTS free', async (_l, body) => {
    const res = await POST(post({ ...body, chargeToken: holdFor(TTS) }));
    expect(res.status).toBe(200);
    expect(refundMock).not.toHaveBeenCalled();
    expect(deductMock).toHaveBeenCalledTimes(1); // the render pays its own reservation; the hold stays taken
  });

  it('a hold token with no audio binding releases nothing', async () => {
    await POST(post({ ...FALLBACK, chargeToken: holdFor(undefined) }));
    expect(refundMock).not.toHaveBeenCalled();
  });

  it("another user's hold token (or a forged one) releases nothing", async () => {
    const theirs = signAvatarCharge({ k: 'presenter-hold', u: 'user-99', r: 'avatar:presenter-tts:x:user-99', j: null });
    await POST(post({ ...BODY, chargeToken: theirs }));
    await POST(post({ ...BODY, chargeToken: 'av1.e30.forged' }));
    expect(refundMock).not.toHaveBeenCalled();
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

describe('the unpolled-job backstop — a durable settle row, and an honest poll verdict', () => {
  beforeEach(() => { mockUser = { id: 'user-42' }; });

  it('a reserved job files `lipsync:<jobId>` (the id the GET completes) with `_settle` naming its reservation', async () => {
    await POST(post(BODY));
    const ref = deductMock.mock.calls[0][2];
    expect(createJob).toHaveBeenCalledTimes(1);
    const row = (createJob as jest.Mock).mock.calls[0][0];
    expect(row).toMatchObject({ id: 'lipsync:heygen:vid-1', userId: 'user-42', status: 'processing' });
    expect(row.params._settle).toEqual({ v: 1, kind: 'lipsync', job: 'heygen:vid-1', ref, credits: COST });
  });

  it('an unbilled demo job files no settle row (nothing to refund)', async () => {
    mockUser = null;
    process.env.FILM_ALLOW_ANONYMOUS = '1';
    await POST(post(BODY));
    expect(createJob).not.toHaveBeenCalled();
  });

  it('a terminal failure reports refunded:true and closes the row AFTER the refund', async () => {
    const { jobId } = (await (await POST(post(BODY))).json()) as { jobId: string };
    fetchJobMock.mockResolvedValue({ status: 'failed', url: null, error: 'RuntimeError: ANTIALIAS' });
    const j = await (await GET(poll(jobId))).json();
    // `error` stays the raw text on purpose: the composer reads it to retry SadTalker's transient crash only.
    expect(j).toEqual({ done: true, url: null, error: 'RuntimeError: ANTIALIAS', refunded: true });
    expect(failJob).toHaveBeenCalledWith('lipsync:heygen:vid-1', expect.any(String));
    expect(refundMock.mock.invocationCallOrder[0]).toBeLessThan((failJob as jest.Mock).mock.invocationCallOrder[0]!);
  });

  it('a refund that did NOT land says so, and leaves the row live for the settle cron to retry', async () => {
    const { jobId } = (await (await POST(post(BODY))).json()) as { jobId: string };
    refundMock.mockResolvedValueOnce({ ok: false, reason: 'error', refunded: 0 });
    fetchJobMock.mockResolvedValue({ status: 'failed', url: null, error: 'x' });
    const j = await (await GET(poll(jobId))).json();
    expect(j.refunded).toBe(false);
    expect(failJob).not.toHaveBeenCalled();
  });
});

describe('MEDIA_GOOGLE_ONLY on', () => {
  beforeEach(() => { process.env.MEDIA_GOOGLE_ONLY = '1'; mockUser = { id: 'user-42' }; });
  afterEach(() => { delete process.env.MEDIA_GOOGLE_ONLY; });

  test('a start → 503 google_only before any voice, charge or render', async () => {
    const res = await POST(post(BODY));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'google_only', jobId: null });
    expect(deductMock).not.toHaveBeenCalled();
    expect(ttsMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  test('the HeyGen health probe answers not-ok, so a film skips its lip-sync stage at once', async () => {
    const { heygenHealthCheck } = jest.requireMock('../../../../lib/ai/lipsync') as { heygenHealthCheck: jest.Mock };
    const res = await GET(new NextRequest('https://myavatar.ge/api/video/lipsync?health=heygen'));
    expect(await res.json()).toEqual({ ok: false, reason: 'google_only' });
    expect(heygenHealthCheck).not.toHaveBeenCalled();
  });

  test('a poll of a job started before the switch still settles', async () => {
    fetchJobMock.mockResolvedValue({ status: 'processing' } as never);
    const res = await GET(poll('heygen:vid-1'));
    expect(res.status).toBe(200);
  });
});
