/** @jest-environment node */
/**
 * /api/heygen/presenter — signed in, and PAID BEFORE the TTS and the HeyGen render.
 *
 * ⚠️ Phase A spends the cloned-voice TTS (ElevenLabs) and Phase B a HeyGen render, both on the platform's keys. The
 * route used to charge only on the GET poll's success, behind a balance gate that skipped anonymous callers and
 * failed OPEN on a ledger error. Pinned here:
 *   · anonymous → 401 before the body is read, the TTS or any HeyGen call;
 *   · a short balance → 402, an unusable ledger → 503, both before any paid call;
 *   · one presenter = one charge: Phase A holds the price, Phase B releases the hold as it reserves the render, and
 *     the GET poll of a reserved video never deducts again;
 *   · a TTS / HeyGen failure, or HeyGen's terminal "failed" (or "completed" with no file) on the poll → exactly one
 *     refund of that reservation;
 *   · the hold is released only toward a render of Phase A's OWN audio on the default face — a render the caller can
 *     make fail (a junk audioUrl, a custom face) must not refund its way to free cloned-voice TTS.
 * HeyGen is a stubbed global fetch; ledger, TTS and storage are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { AI: { windowMs: 60_000, max: 10 } },
}));
jest.mock('../../../../lib/chat/filmVoiceover', () => ({ textToHostedSpeech: jest.fn() }));
jest.mock('../../../../lib/audio/georgian-voice', () => ({ georgianVoiceId: jest.fn(() => 'voice-ka') }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({
  uploadAndSign: jest.fn(async () => 'https://x.supabase.co/storage/v1/object/sign/uploads/presenter/out.mp4?token=t'),
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
import { textToHostedSpeech } from '../../../../lib/chat/filmVoiceover';
import { recordCompletedFilm, createJob, failJob } from '../../../../lib/orchestrator/jobs';
import { creditCostFor } from '../../../../lib/credits/pricing';
import { audioFingerprint, verifyAvatarCharge } from '../../../../lib/billing/avatarCharge';

const deductMock = deductCredits as jest.MockedFunction<typeof deductCredits>;
const refundMock = refundDebitByRef as jest.MockedFunction<typeof refundDebitByRef>;
const ttsMock = textToHostedSpeech as jest.MockedFunction<typeof textToHostedSpeech>;
const COST = creditCostFor('avatar');
const HOLD_REF = /^avatar:presenter-tts:[0-9a-f-]{36}:user-42$/;
const RENDER_REF = /^avatar:presenter:[0-9a-f-]{36}:user-42$/;
const AUDIO = 'https://x.supabase.co/tts.mp3';

/** HeyGen stub. `generate` decides Phase B's submit; `status` the poll's verdict. Any other URL is the re-host download. */
let heygen: { generate: () => Response; status: () => Response };
const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/v2/video/generate')) return heygen.generate();
  if (url.includes('/v1/video_status.get')) return heygen.status();
  return new Response(new Uint8Array(4096), { status: 200 });
});
const heygenCalls = () => fetchMock.mock.calls.filter(([u]) => /heygen\.com/.test(String(u)));

function post(body: unknown): { req: NextRequest; bodyRead: () => boolean } {
  const req = new NextRequest('https://myavatar.ge/api/heygen/presenter', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = jest.spyOn(req, 'json');
  return { req, bodyRead: () => json.mock.calls.length > 0 };
}
const poll = (id: string) => new NextRequest(`https://myavatar.ge/api/heygen/presenter?id=${encodeURIComponent(id)}`);

const ENV = {
  anon: process.env.FILM_ALLOW_ANONYMOUS,
  secret: process.env.AVATAR_CHARGE_SECRET,
  key: process.env.HEYGEN_API_KEY,
  photo: process.env.PRESENTER_TALKING_PHOTO_ID,
};
const realFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  delete process.env.FILM_ALLOW_ANONYMOUS;
  process.env.AVATAR_CHARGE_SECRET = 'test-avatar-charge-secret-0123456789';
  process.env.HEYGEN_API_KEY = 'test-heygen-key';
  process.env.PRESENTER_TALKING_PHOTO_ID = 'tp-pinned'; // skip the face upload — only generate/status hit HeyGen
  deductMock.mockResolvedValue({ ok: true });
  ttsMock.mockResolvedValue(AUDIO);
  heygen = {
    generate: () => Response.json({ data: { video_id: 'vid-1' } }),
    status: () => Response.json({ data: { status: 'completed', video_url: 'https://heygen.example/out.mp4' } }),
  };
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => { global.fetch = realFetch; });
afterAll(() => {
  for (const [k, v] of Object.entries({ FILM_ALLOW_ANONYMOUS: ENV.anon, AVATAR_CHARGE_SECRET: ENV.secret, HEYGEN_API_KEY: ENV.key, PRESENTER_TALKING_PHOTO_ID: ENV.photo })) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe('anonymous → 401 before any paid work', () => {
  it.each([
    ['Phase A (TTS)', { text: 'გამარჯობა' }],
    ['Phase B (HeyGen)', { audioUrl: AUDIO }],
  ])('%s: refused before the body is read; no TTS, no HeyGen, no ledger', async (_l, body) => {
    const { req, bodyRead } = post(body);
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ success: false, error: 'auth_required', authRequired: true });
    expect(bodyRead()).toBe(false);
    expect(ttsMock).not.toHaveBeenCalled();
    expect(heygenCalls()).toHaveLength(0);
    expect(deductMock).not.toHaveBeenCalled();
  });
});

describe('signed in', () => {
  beforeEach(() => { mockUser = { id: 'user-42' }; });

  it('zero balance → 402 before the TTS', async () => {
    deductMock.mockResolvedValueOnce({ ok: false, reason: 'insufficient' });
    const res = await POST(post({ text: 'გამარჯობა' }).req);
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: 'insufficient_credits', topUpNeeded: true });
    expect(ttsMock).not.toHaveBeenCalled();
  });

  it('zero balance → 402 before HeyGen', async () => {
    deductMock.mockResolvedValueOnce({ ok: false, reason: 'insufficient' });
    const res = await POST(post({ audioUrl: AUDIO }).req);
    expect(res.status).toBe(402);
    expect(heygenCalls()).toHaveLength(0);
  });

  it.each(['error', 'skipped'] as const)('ledger %s → 503 (the old gate failed open here), no TTS, no HeyGen', async (reason) => {
    deductMock.mockResolvedValue({ ok: false, reason });
    expect((await POST(post({ text: 'გამარჯობა' }).req)).status).toBe(503);
    expect((await POST(post({ audioUrl: AUDIO }).req)).status).toBe(503);
    expect(ttsMock).not.toHaveBeenCalled();
    expect(heygenCalls()).toHaveLength(0);
  });

  it('one presenter = one charge: A holds, B releases the hold and reserves, the poll never deducts', async () => {
    const a = await POST(post({ text: 'გამარჯობა', gender: 'female' }).req);
    const syn = (await a.json()) as { success: boolean; audioUrl: string; chargeToken: string };
    expect(syn).toMatchObject({ success: true, audioUrl: AUDIO, heygenReady: true });
    expect(deductMock).toHaveBeenNthCalledWith(1, 'user-42', COST, expect.stringMatching(HOLD_REF));
    expect(deductMock.mock.invocationCallOrder[0]).toBeLessThan(ttsMock.mock.invocationCallOrder[0]);
    const holdRef = deductMock.mock.calls[0][2];

    const b = await POST(post({ audioUrl: syn.audioUrl, chargeToken: syn.chargeToken }).req);
    const sj = (await b.json()) as { success: boolean; videoId: string };
    expect(sj.success).toBe(true);
    expect(sj.videoId.startsWith('vid-1~av1.')).toBe(true);
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock).toHaveBeenCalledWith('user-42', holdRef, COST); // the hold went back…
    expect(deductMock).toHaveBeenNthCalledWith(2, 'user-42', COST, expect.stringMatching(RENDER_REF)); // …as the render reserved
    expect(refundMock.mock.invocationCallOrder[0]).toBeLessThan(deductMock.mock.invocationCallOrder[1]);

    const done = await GET(poll(sj.videoId));
    expect(await done.json()).toMatchObject({ done: true, url: expect.stringContaining('supabase.co') });
    expect(String(heygenCalls().at(-1)?.[0])).toContain('video_id=vid-1'); // HeyGen sees the bare id
    await GET(poll(sj.videoId));

    // Net: two debits, one release → exactly one avatar price, and nothing more on the poll.
    expect(deductMock).toHaveBeenCalledTimes(2);
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(recordCompletedFilm).toHaveBeenCalledWith(expect.objectContaining({ id: 'presenter:vid-1', userId: 'user-42' }));
  });

  it('Phase B called directly (no hold) → exactly one deduct, and the poll adds none', async () => {
    const sj = (await (await POST(post({ audioUrl: AUDIO }).req)).json()) as { videoId: string };
    await GET(poll(sj.videoId));
    expect(deductMock).toHaveBeenCalledTimes(1);
    expect(deductMock).toHaveBeenCalledWith('user-42', COST, expect.stringMatching(RENDER_REF));
    expect(refundMock).not.toHaveBeenCalled();
  });

  it('a replayed hold token releases nothing extra and every render still reserves', async () => {
    const syn = (await (await POST(post({ text: 'გამარჯობა' }).req)).json()) as { chargeToken: string };
    await POST(post({ audioUrl: AUDIO, chargeToken: syn.chargeToken }).req);
    await POST(post({ audioUrl: AUDIO, chargeToken: syn.chargeToken }).req);
    // 1 hold + 2 renders reserved; every release targets the SAME hold ref (refundDebitByRef is net-capped).
    expect(deductMock).toHaveBeenCalledTimes(3);
    expect(new Set(refundMock.mock.calls.map((c) => c[1])).size).toBe(1);
  });

  it('TTS failure → exactly one refund of the hold', async () => {
    ttsMock.mockResolvedValueOnce(null);
    const res = await POST(post({ text: 'გამარჯობა' }).req);
    expect(res.status).toBe(502);
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock).toHaveBeenCalledWith('user-42', deductMock.mock.calls[0][2], COST);
  });

  it('HeyGen submit failure → exactly one refund of the render reservation', async () => {
    heygen.generate = () => new Response('upstream error', { status: 500 });
    const res = await POST(post({ audioUrl: AUDIO }).req);
    expect(res.status).toBe(502);
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock).toHaveBeenCalledWith('user-42', deductMock.mock.calls[0][2], COST);
  });

  it("HeyGen's terminal 'failed' on the poll → one refund to the payer, even with no session", async () => {
    const sj = (await (await POST(post({ audioUrl: AUDIO }).req)).json()) as { videoId: string };
    const ref = deductMock.mock.calls[0][2];
    heygen.status = () => Response.json({ data: { status: 'failed', error: 'bad audio' } });
    mockUser = null;
    const res = await GET(poll(sj.videoId));
    // HeyGen's own words ('bad audio') stay server-side: a code the studio maps, plus whether the credits came back.
    expect(await res.json()).toEqual({ done: true, error: 'provider_unavailable', refunded: true });
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock).toHaveBeenCalledWith('user-42', ref, COST);
    expect(deductMock).toHaveBeenCalledTimes(1);
  });

  it("HeyGen 'completed' with NO video_url → terminal: one refund, done:true — never {done:false} forever", async () => {
    const sj = (await (await POST(post({ audioUrl: AUDIO }).req)).json()) as { videoId: string };
    const ref = deductMock.mock.calls[0][2];
    heygen.status = () => Response.json({ data: { status: 'completed' } });
    const res = await GET(poll(sj.videoId));
    expect(await res.json()).toEqual({ done: true, error: 'provider_unavailable', refunded: true });
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock).toHaveBeenCalledWith('user-42', ref, COST);
    expect(recordCompletedFilm).not.toHaveBeenCalled();
    expect(deductMock).toHaveBeenCalledTimes(1);
  });

  it("Phase A's hold is bound to the audio it produced", async () => {
    const syn = (await (await POST(post({ text: 'გამარჯობა' }).req)).json()) as { chargeToken: string };
    expect(verifyAvatarCharge(syn.chargeToken, 'presenter-hold')).toMatchObject({ u: 'user-42', a: audioFingerprint(AUDIO) });
  });

  it.each([
    ['a different audioUrl (one HeyGen can be made to reject)', { audioUrl: 'https://attacker.example/junk.mp3' }],
    ['a custom face (one that can be made unreachable)', { audioUrl: AUDIO, faceUrl: 'https://attacker.example/404.jpg' }],
  ])('the hold is NOT released for %s — a failed render cannot refund the TTS away', async (_l, phaseB) => {
    const syn = (await (await POST(post({ text: 'გამარჯობა' }).req)).json()) as { chargeToken: string };
    const holdRef = deductMock.mock.calls[0][2];
    heygen.generate = () => new Response('rejected', { status: 400 });
    const res = await POST(post({ ...phaseB, chargeToken: syn.chargeToken }).req);
    expect(res.status).toBe(502);
    // The failed render's own reservation goes back; the hold (the TTS the caller already holds) does not.
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock).not.toHaveBeenCalledWith('user-42', holdRef, expect.anything());
    expect(refundMock).toHaveBeenCalledWith('user-42', expect.stringMatching(RENDER_REF), COST);
  });

  it('a legacy bare videoId keeps deduct-on-success (never free) and is never refunded', async () => {
    await GET(poll('old-vid'));
    expect(deductMock).toHaveBeenCalledWith('user-42', COST, 'avatar:presenter:old-vid:user-42');
    heygen.status = () => Response.json({ data: { status: 'failed' } });
    await GET(poll('old-vid'));
    expect(refundMock).not.toHaveBeenCalled();
  });

  it('a reserved render files `presenter:<videoId>` with `_settle`, so an unpolled failure is still refunded by the cron', async () => {
    await POST(post({ audioUrl: AUDIO }).req);
    const ref = deductMock.mock.calls[0][2];
    expect(createJob).toHaveBeenCalledTimes(1);
    const row = (createJob as jest.Mock).mock.calls[0][0];
    expect(row).toMatchObject({ id: 'presenter:vid-1', userId: 'user-42', status: 'processing' });
    // Polled by the cron through lipsyncFetch, which reads HeyGen ids as `heygen:<videoId>`.
    expect(row.params._settle).toEqual({ v: 1, kind: 'presenter', job: 'heygen:vid-1', ref, credits: COST });
  });

  it('a terminal failure closes the row AFTER the refund; a refund that did not land leaves it live for the cron', async () => {
    const sj = (await (await POST(post({ audioUrl: AUDIO }).req)).json()) as { videoId: string };
    heygen.status = () => Response.json({ data: { status: 'failed', error: 'x' } });
    await GET(poll(sj.videoId));
    expect(failJob).toHaveBeenCalledWith('presenter:vid-1', expect.any(String));
    expect(refundMock.mock.invocationCallOrder[0]).toBeLessThan((failJob as jest.Mock).mock.invocationCallOrder[0]!);

    (failJob as jest.Mock).mockClear();
    refundMock.mockResolvedValueOnce({ ok: false, reason: 'error', refunded: 0 });
    const j = await (await GET(poll(sj.videoId))).json();
    expect(j.refunded).toBe(false);
    expect(failJob).not.toHaveBeenCalled();
  });
});
