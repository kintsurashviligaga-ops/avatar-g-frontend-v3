/** @jest-environment node */
/**
 * /api/heygen/presenter — POST refused, GET still settles the presenters started before (MASTER TASK v3.1).
 *
 * HeyGen is not Google, so both start phases (the TTS line and the HeyGen submit) answer 503 google_only before the
 * body is read, the TTS, any HeyGen call or the ledger, whatever the caller or the env says. Pinned for the renders
 * already running:
 *   · the GET poll of a reserved video (signed charge token) never deducts again, and files it in the Library;
 *   · HeyGen's terminal "failed" (or "completed" with no file) on the poll → exactly one refund of that reservation,
 *     then the durable row is closed; a refund that did not land leaves the row live for the cron;
 *   · a legacy bare videoId keeps deduct-on-success, so it is never free.
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
import { avatarChargeRef, signAvatarCharge, withChargeToken } from '../../../../lib/billing/avatarCharge';

const deductMock = deductCredits as jest.MockedFunction<typeof deductCredits>;
const refundMock = refundDebitByRef as jest.MockedFunction<typeof refundDebitByRef>;
const ttsMock = textToHostedSpeech as jest.MockedFunction<typeof textToHostedSpeech>;
const COST = creditCostFor('avatar');
const RENDER_REF = avatarChargeRef('presenter', 'user-42', '00000000-0000-4000-8000-000000000002');
const AUDIO = 'https://x.supabase.co/tts.mp3';
/** A render the old Phase B started and reserved: the HeyGen video id with its signed charge token. */
const reserved = (videoId = 'vid-1') =>
  withChargeToken(videoId, signAvatarCharge({ k: 'presenter', u: 'user-42', r: RENDER_REF, j: videoId })!);

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

describe('POST is refused before the body, the TTS, HeyGen or the ledger', () => {
  const hold = signAvatarCharge({ k: 'presenter-hold', u: 'user-42', r: avatarChargeRef('presenter-tts', 'user-42', '00000000-0000-4000-8000-00000000000a'), j: null });
  it.each([
    ['Phase A (TTS), a guest', null, {}, { text: 'გამარჯობა' }],
    ['Phase A (TTS), signed in', { id: 'user-42' }, {}, { text: 'გამარჯობა', gender: 'female' }],
    ['Phase B (HeyGen), signed in', { id: 'user-42' }, {}, { audioUrl: AUDIO }],
    ['Phase B with a hold token and a custom face', { id: 'user-42' }, {}, { audioUrl: AUDIO, chargeToken: hold, faceUrl: 'https://me.example/face.png' }],
    ['the demo flag', null, { FILM_ALLOW_ANONYMOUS: '1' }, { audioUrl: AUDIO }],
    ['the old opt-out with an owner approval', { id: 'user-42' }, { MEDIA_GOOGLE_ONLY: '0', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-heygen' }, { audioUrl: AUDIO }],
  ])('%s → 503 google_only', async (_l, user, env, body) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    mockUser = user;
    try {
      const { req, bodyRead } = post(body);
      const res = await POST(req);
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ success: false, code: 'google_only' });
      expect(bodyRead()).toBe(false);
      expect(ttsMock).not.toHaveBeenCalled();
      expect(heygenCalls()).toHaveLength(0);
      expect(deductMock).not.toHaveBeenCalled();
      expect(refundMock).not.toHaveBeenCalled();
      expect(createJob).not.toHaveBeenCalled();
    } finally {
      process.env = saved;
    }
  });
});

describe('a presenter started before the change still settles on its poll', () => {
  beforeEach(() => { mockUser = { id: 'user-42' }; });

  it('a reserved render: the poll never deducts, and files it in the Library', async () => {
    const done = await GET(poll(reserved()));
    expect(await done.json()).toMatchObject({ done: true, url: expect.stringContaining('supabase.co') });
    expect(String(heygenCalls().at(-1)?.[0])).toContain('video_id=vid-1'); // HeyGen sees the bare id
    await GET(poll(reserved()));
    expect(deductMock).not.toHaveBeenCalled();
    expect(refundMock).not.toHaveBeenCalled();
    expect(recordCompletedFilm).toHaveBeenCalledWith(expect.objectContaining({ id: 'presenter:vid-1', userId: 'user-42' }));
  });

  it("HeyGen's terminal 'failed' on the poll → one refund to the payer, even with no session", async () => {
    heygen.status = () => Response.json({ data: { status: 'failed', error: 'bad audio' } });
    mockUser = null;
    const res = await GET(poll(reserved()));
    // HeyGen's own words ('bad audio') stay server-side: a code the studio maps, plus whether the credits came back.
    expect(await res.json()).toEqual({ done: true, error: 'provider_unavailable', refunded: true });
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock).toHaveBeenCalledWith('user-42', RENDER_REF, COST);
    expect(deductMock).not.toHaveBeenCalled();
  });

  it("HeyGen 'completed' with NO video_url → terminal: one refund, done:true — never {done:false} forever", async () => {
    heygen.status = () => Response.json({ data: { status: 'completed' } });
    const res = await GET(poll(reserved()));
    expect(await res.json()).toEqual({ done: true, error: 'provider_unavailable', refunded: true });
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock).toHaveBeenCalledWith('user-42', RENDER_REF, COST);
    expect(recordCompletedFilm).not.toHaveBeenCalled();
    expect(deductMock).not.toHaveBeenCalled();
  });

  it('a legacy bare videoId keeps deduct-on-success (never free) and is never refunded', async () => {
    await GET(poll('old-vid'));
    expect(deductMock).toHaveBeenCalledWith('user-42', COST, 'avatar:presenter:old-vid:user-42');
    heygen.status = () => Response.json({ data: { status: 'failed' } });
    await GET(poll('old-vid'));
    expect(refundMock).not.toHaveBeenCalled();
  });

  it('a terminal failure closes the row AFTER the refund; a refund that did not land leaves it live for the cron', async () => {
    heygen.status = () => Response.json({ data: { status: 'failed', error: 'x' } });
    await GET(poll(reserved()));
    expect(failJob).toHaveBeenCalledWith('presenter:vid-1', expect.any(String));
    expect(refundMock.mock.invocationCallOrder[0]).toBeLessThan((failJob as jest.Mock).mock.invocationCallOrder[0]!);

    (failJob as jest.Mock).mockClear();
    refundMock.mockResolvedValueOnce({ ok: false, reason: 'error', refunded: 0 });
    const j = await (await GET(poll(reserved()))).json();
    expect(j.refunded).toBe(false);
    expect(failJob).not.toHaveBeenCalled();
  });
});
