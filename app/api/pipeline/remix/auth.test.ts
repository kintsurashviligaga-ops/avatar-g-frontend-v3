/** @jest-environment node */
/**
 * POST /api/pipeline/remix — signed in AND paid.
 *
 * ⚠️ This route re-renders up to four scenes on the platform's video keys (Veo: up to $3.20 a clip) and re-stitches
 * on our CPU, and it used to have neither a session check nor a charge: any direct POST was free video. Pinned here:
 *   · a guest is refused (401 authRequired) before the body is even read — no balance lookup, no render, no stitch;
 *   · a signed-in user who cannot cover the remix is refused (402) before any render;
 *   · the remix price is debited only once the re-cut is DELIVERED, and never for a remix whose scenes all failed
 *     (the original film comes back unchanged and must cost nothing).
 * Every heavy module (ServiceManager, the ffmpeg assembler, the ledger, the library) is mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { AI: { windowMs: 60_000, max: 30 }, STORYBOARD: { windowMs: 60_000, max: 30 } },
}));
jest.mock('../../../../lib/chat/ServiceManager', () => {
  const execute = jest.fn();
  const poll = jest.fn();
  return { ServiceManager: jest.fn().mockImplementation(() => ({ execute, poll })), __sm: { execute, poll } };
});
jest.mock('../../../../lib/orchestrator/ffmpeg-assembly', () => ({ assembleWithFfmpeg: jest.fn() }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedFilm: jest.fn(async () => undefined) }));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  hasSufficientBalance: jest.fn(async () => true),
  deductCredits: jest.fn(async () => ({ ok: true })),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { assembleWithFfmpeg } from '../../../../lib/orchestrator/ffmpeg-assembly';
import { deductCredits, hasSufficientBalance } from '../../../../lib/orchestrator/ledger';
import { recordCompletedFilm } from '../../../../lib/orchestrator/jobs';
import { creditCostFor } from '../../../../lib/credits/pricing';

const { __sm: sm } = jest.requireMock('../../../../lib/chat/ServiceManager') as { __sm: { execute: jest.Mock; poll: jest.Mock } };
const assembleMock = assembleWithFfmpeg as jest.MockedFunction<typeof assembleWithFfmpeg>;
const balanceMock = hasSufficientBalance as jest.MockedFunction<typeof hasSufficientBalance>;
const deductMock = deductCredits as jest.MockedFunction<typeof deductCredits>;

const REMIX_BODY = {
  originalPrompt: 'A lighthouse keeper keeps the lamp burning through a storm — a cinematic film',
  editRequest: 'make scene 2 darker',
  landedClips: [
    { ordinal: 1, url: 'https://x.supabase.co/clip-1.mp4' },
    { ordinal: 2, url: 'https://x.supabase.co/clip-2.mp4' },
    { ordinal: 3, url: 'https://x.supabase.co/clip-3.mp4' },
  ],
  clipSec: 8,
  sessionId: 'remix_session_1',
};

/** A request whose body read is observable — the refusal must come BEFORE the body is parsed. */
function post(body: unknown): { req: NextRequest; bodyRead: () => boolean } {
  const req = new NextRequest('https://myavatar.ge/api/pipeline/remix', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = jest.spyOn(req, 'json');
  return { req, bodyRead: () => json.mock.calls.length > 0 };
}

const ORIGINAL_FLAG = process.env.FILM_ALLOW_ANONYMOUS;

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  delete process.env.FILM_ALLOW_ANONYMOUS;
  balanceMock.mockResolvedValue(true);
  sm.execute.mockResolvedValue({ success: true, assetUrl: 'https://x.supabase.co/clip-2-darker.mp4', predictionStatus: 'succeeded' });
  assembleMock.mockResolvedValue({ url: 'https://x.supabase.co/remix-master.mp4' } as never);
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.FILM_ALLOW_ANONYMOUS;
  else process.env.FILM_ALLOW_ANONYMOUS = ORIGINAL_FLAG;
});

describe('anonymous → 401 before anything is read, priced or rendered', () => {
  it('refuses with authRequired and never touches the ledger, the renderer or the assembler', async () => {
    const { req, bodyRead } = post(REMIX_BODY);
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ success: false, error: 'auth_required', authRequired: true });
    expect(bodyRead()).toBe(false);
    expect(balanceMock).not.toHaveBeenCalled();
    expect(sm.execute).not.toHaveBeenCalled();
    expect(sm.poll).not.toHaveBeenCalled();
    expect(assembleMock).not.toHaveBeenCalled();
    expect(deductMock).not.toHaveBeenCalled();
  });

  it('FILM_ALLOW_ANONYMOUS=1 lets a demo guest through — and a guest is never debited', async () => {
    process.env.FILM_ALLOW_ANONYMOUS = '1';
    const res = await POST(post(REMIX_BODY).req);
    expect(res.status).toBe(200);
    expect(sm.execute).toHaveBeenCalledTimes(1);
    expect(balanceMock).not.toHaveBeenCalled(); // there is no account to check
    expect(deductMock).not.toHaveBeenCalled();
    expect(recordCompletedFilm).not.toHaveBeenCalled();
  });
});

describe('signed in', () => {
  beforeEach(() => {
    mockUser = { id: 'user-42' };
  });

  it('without the balance for a remix → 402 insufficient_credits, before any render', async () => {
    balanceMock.mockResolvedValue(false);
    const { req, bodyRead } = post(REMIX_BODY);
    const res = await POST(req);
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toMatchObject({ success: false, error: 'insufficient_credits', requiredCredits: creditCostFor('remix') });
    expect(balanceMock).toHaveBeenCalledWith('user-42', creditCostFor('remix'));
    expect(bodyRead()).toBe(false);
    expect(sm.execute).not.toHaveBeenCalled();
    expect(assembleMock).not.toHaveBeenCalled();
    expect(deductMock).not.toHaveBeenCalled();
  });

  it('with the balance: re-renders only the edited scene, delivers the re-cut, then debits the remix price once', async () => {
    const res = await POST(post(REMIX_BODY).req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, masterUrl: 'https://x.supabase.co/remix-master.mp4' });
    expect(sm.execute).toHaveBeenCalledTimes(1);
    expect(assembleMock).toHaveBeenCalledTimes(1);
    const segments = assembleMock.mock.calls[0]![0].segments.map((s: { url: string }) => s.url);
    expect(segments).toEqual(['https://x.supabase.co/clip-1.mp4', 'https://x.supabase.co/clip-2-darker.mp4', 'https://x.supabase.co/clip-3.mp4']);
    expect(deductMock).toHaveBeenCalledTimes(1);
    expect(deductMock).toHaveBeenCalledWith('user-42', creditCostFor('remix'), expect.stringMatching(/^pipeline-remix:user-42:\d+$/));
  });

  it('a remix whose re-render failed returns the original cut and costs nothing', async () => {
    sm.execute.mockResolvedValue({ success: false, predictionStatus: 'failed' });
    const res = await POST(post(REMIX_BODY).req);
    expect(res.status).toBe(200);
    const segments = assembleMock.mock.calls[0]![0].segments.map((s: { url: string }) => s.url);
    expect(segments).toEqual(REMIX_BODY.landedClips.map((c) => c.url)); // film intact, edit not applied
    expect(deductMock).not.toHaveBeenCalled();
  });

  it('a re-cut the assembler could not host is not charged', async () => {
    assembleMock.mockResolvedValue(null as never);
    const res = await POST(post(REMIX_BODY).req);
    expect((await res.json()).success).toBe(false);
    expect(deductMock).not.toHaveBeenCalled();
  });
});
