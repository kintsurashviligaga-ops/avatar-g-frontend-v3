/** @jest-environment node */
/**
 * POST /api/v2/montage/render — the music start („start the song at 0:42").
 *
 * `musicStartSec` is a number of seconds, 0–3600. Anything else is a 400 with a sentence that says so, before any job
 * row is written or any ffmpeg runs; a valid one reaches the pipeline as `request.musicStartSec`. 0/absent is the top
 * of the song and is not sent on at all, so an edit without a start renders exactly as before.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = { id: 'user-1' };
jest.mock('../../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000, keyPrefix: 'rl:exp' } },
}));
jest.mock('../../../../../lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(() => ({ auth: { getUser: jest.fn(async () => ({ data: { user: mockUser } })) } })),
}));
jest.mock('../../../../../lib/services/montage/montagePipeline', () => ({
  runMontage: jest.fn(async (req: { aspect: string; shots: unknown[] }) => ({
    ok: true,
    result: { videoUrl: 'https://cdn.test/master.mp4', durationSec: 10, shots: req.shots.length, aspect: req.aspect, bridged: 0, hasMusic: true, stepsRun: ['music'] },
  })),
}));
jest.mock('../../../../../lib/services/billing/guardedCall', () => ({
  guardedCall: jest.fn(async (_opts: unknown, fn: () => Promise<unknown>) => fn()),
  BudgetExceededError: class BudgetExceededError extends Error {},
}));
jest.mock('../../../../../lib/orchestrator/jobs', () => ({
  createJob: jest.fn(async () => true),
  completeJob: jest.fn(async () => undefined),
  failJob: jest.fn(async () => undefined),
  safeJobId: jest.fn((_v: unknown, fallback: string) => fallback),
}));
jest.mock('../../../../../lib/orchestrator/storage-adapter', () => ({
  // A bare storage path is signed into a public https URL, as the real adapter does.
  createSignedAssetUrl: jest.fn(async (bucket: string, path: string) => `https://x.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t`),
}));

// eslint-disable-next-line import/first
import { POST } from './route';
// eslint-disable-next-line import/first
import { runMontage } from '../../../../../lib/services/montage/montagePipeline';
// eslint-disable-next-line import/first
import { createJob } from '../../../../../lib/orchestrator/jobs';

const post = (body: unknown) =>
  POST(new Request('https://myavatar.ge/api/v2/montage/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0]);

const edit = (over: Record<string, unknown> = {}) => ({
  shots: [{ url: 'u/clip-1', kind: 'video', startSec: 0, endSec: 6, muted: false, transition: 'cut' }],
  aspect: '9:16',
  musicUrl: 'u/song',
  musicOnly: false,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'user-1' };
});

describe('musicStartSec', () => {
  it.each([
    ['a negative', -1],
    ['past an hour', 3600.5],
    ['a string', '42'],
    ['a boolean', true],
    ['an object', { sec: 4 }],
  ])('%s is a 400 with a clear message — no job, no render', async (_label, musicStartSec) => {
    const res = await post(edit({ musicStartSec }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_request', message: 'musicStartSec must be a number of seconds from 0 to 3600' });
    expect(createJob).not.toHaveBeenCalled();
    expect(runMontage).not.toHaveBeenCalled();
  });

  it('a valid start reaches the pipeline beside the signed song', async () => {
    const res = await post(edit({ musicStartSec: 42.5 }));
    expect(res.status).toBe(200);
    expect(runMontage).toHaveBeenCalledTimes(1);
    const req = (runMontage as jest.Mock).mock.calls[0][0];
    expect(req.musicStartSec).toBe(42.5);
    expect(req.musicUrl).toBe('https://x.supabase.co/storage/v1/object/sign/uploads/u/song?token=t');
  });

  it.each([0, null, undefined])('%s is the top of the song — nothing extra reaches the pipeline', async (musicStartSec) => {
    const res = await post(edit(musicStartSec === undefined ? {} : { musicStartSec }));
    expect(res.status).toBe(200);
    expect((runMontage as jest.Mock).mock.calls[0][0]).not.toHaveProperty('musicStartSec');
  });

  it('the boundaries are inclusive: 0 and 3600', async () => {
    expect((await post(edit({ musicStartSec: 3600 }))).status).toBe(200);
    expect((runMontage as jest.Mock).mock.calls[0][0].musicStartSec).toBe(3600);
  });

  it('a start without a bed is accepted and dropped — there is nothing to start', async () => {
    const { musicUrl: _drop, ...noMusic } = edit({ musicStartSec: 30 });
    void _drop;
    const res = await post(noMusic);
    expect(res.status).toBe(200);
    const req = (runMontage as jest.Mock).mock.calls[0][0];
    expect(req).not.toHaveProperty('musicUrl');
    expect(req).not.toHaveProperty('musicStartSec');
  });

  it('is still behind sign-in', async () => {
    mockUser = null;
    expect((await post(edit({ musicStartSec: 5 }))).status).toBe(401);
    expect(runMontage).not.toHaveBeenCalled();
  });
});
