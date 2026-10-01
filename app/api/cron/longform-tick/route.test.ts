/** @jest-environment node */
/**
 * /api/cron/longform-tick with everything mocked: the runtime deps (no Supabase, no Veo, no ledger, no ffmpeg) and,
 * for the gate tests, the tick itself. Rules under test: 404 when LONGFORM_VIDEO_ENABLED is off — before auth and
 * before anything is built; CRON_SECRET via the shared cronAuth (Bearer or x-cron-token, refused when unset);
 * the tick's options from env (clamped); 503 when the deps cannot be built; 500 + an ops marker if the tick throws;
 * a warn marker when the report shows trouble; and one pass through the REAL tick with fake deps.
 */
jest.mock('server-only', () => ({}));
const mockCreateDeps = jest.fn();
jest.mock('../../../../lib/video/longform/runtime', () => ({ createLongformTickDeps: (...a: unknown[]) => mockCreateDeps(...a) }));
const mockRunTick = jest.fn();
jest.mock('../../../../lib/video/longform/tick', () => ({
  ...jest.requireActual<typeof import('@/lib/video/longform/tick')>('../../../../lib/video/longform/tick'),
  runLongformTick: (...a: unknown[]) => mockRunTick(...a),
}));
const mockReportError = jest.fn();
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: (...a: unknown[]) => mockReportError(...a) }));
const mockOpsMarker = jest.fn();
jest.mock('../../../../lib/observability/reliability', () => ({ opsMarker: (...a: unknown[]) => mockOpsMarker(...a) }));

import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { emptyReport, type LongformTickDeps } from '@/lib/video/longform/tick';

/** The tick module is mocked above (for the gate tests); this is the real one. */
const realTick = jest.requireActual<typeof import('@/lib/video/longform/tick')>('../../../../lib/video/longform/tick').runLongformTick;

const env = process.env as Record<string, string | undefined>;
const KEYS = ['LONGFORM_VIDEO_ENABLED', 'CRON_SECRET', 'LONGFORM_TICK_BUDGET_MS', 'LONGFORM_TICK_MAX_JOBS', 'LONGFORM_MIN_STITCH_BUDGET_MS'];
const saved: Record<string, string | undefined> = {};

const req = (headers: Record<string, string> = {}, method = 'GET') =>
  new NextRequest('https://myavatar.ge/api/cron/longform-tick', { method, headers });
const FAKE_DEPS = { marker: 'deps' } as unknown as LongformTickDeps;

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = env[k];
    delete env[k];
  }
  mockCreateDeps.mockReset().mockReturnValue(FAKE_DEPS);
  mockRunTick.mockReset().mockResolvedValue({ ...emptyReport(), jobs: 2, submitted: 3 });
  mockReportError.mockReset();
  mockOpsMarker.mockReset();
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
});

describe('dark by default', () => {
  test('404 when LONGFORM_VIDEO_ENABLED is unset or off — even with a valid secret; nothing is built or run', async () => {
    env.CRON_SECRET = 's3cret';
    for (const v of [undefined, '', '0', 'false', 'off']) {
      if (v === undefined) delete env.LONGFORM_VIDEO_ENABLED;
      else env.LONGFORM_VIDEO_ENABLED = v;
      const res = await GET(req({ authorization: 'Bearer s3cret' }));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found' });
    }
    expect((await POST(req({ authorization: 'Bearer s3cret' }, 'POST'))).status).toBe(404);
    expect(mockCreateDeps).not.toHaveBeenCalled();
    expect(mockRunTick).not.toHaveBeenCalled();
  });
});

describe('CRON_SECRET', () => {
  beforeEach(() => {
    env.LONGFORM_VIDEO_ENABLED = '1';
  });

  test('refused when the secret is unset (never "no secret, no check")', async () => {
    expect((await GET(req({ authorization: 'Bearer undefined' }))).status).toBe(403);
    expect((await GET(req())).status).toBe(403);
    expect(mockCreateDeps).not.toHaveBeenCalled();
  });

  test('refused with a wrong or missing credential', async () => {
    env.CRON_SECRET = 's3cret';
    for (const h of [{}, { authorization: 'Bearer nope' }, { authorization: 's3cret' }, { 'x-cron-token': 'nope' }]) {
      expect((await GET(req(h))).status).toBe(403);
    }
    expect(mockRunTick).not.toHaveBeenCalled();
  });

  test('accepted as Vercel Cron sends it (Bearer) and as a manual x-cron-token, on GET and POST', async () => {
    env.CRON_SECRET = 's3cret';
    const a = await GET(req({ authorization: 'Bearer s3cret' }));
    expect(a.status).toBe(200);
    expect(await a.json()).toMatchObject({ ok: true, jobs: 2, submitted: 3 });
    expect((await POST(req({ 'x-cron-token': 's3cret' }, 'POST'))).status).toBe(200);
    expect(mockRunTick).toHaveBeenCalledTimes(2);
  });
});

describe('running the tick', () => {
  beforeEach(() => {
    env.LONGFORM_VIDEO_ENABLED = 'true';
    env.CRON_SECRET = 's3cret';
  });
  const ok = () => GET(req({ authorization: 'Bearer s3cret' }));

  test('default options fit the 60 s cron glob: 50 s budget, lease = budget + 60 s, 5 jobs, 120 s stitch reserve', async () => {
    await ok();
    expect(mockRunTick).toHaveBeenCalledWith(FAKE_DEPS, { timeBudgetMs: 50_000, leaseSec: 110, maxJobs: 5, minStitchBudgetMs: 120_000 });
    expect(mockOpsMarker).not.toHaveBeenCalled();
  });

  test('env overrides are clamped', async () => {
    env.LONGFORM_TICK_BUDGET_MS = '270000';
    env.LONGFORM_TICK_MAX_JOBS = '999';
    env.LONGFORM_MIN_STITCH_BUDGET_MS = '5';
    await ok();
    expect(mockRunTick).toHaveBeenCalledWith(FAKE_DEPS, { timeBudgetMs: 270_000, leaseSec: 330, maxJobs: 20, minStitchBudgetMs: 10_000 });
    env.LONGFORM_TICK_BUDGET_MS = 'abc';
    await ok();
    expect(mockRunTick).toHaveBeenLastCalledWith(FAKE_DEPS, expect.objectContaining({ timeBudgetMs: 50_000 }));
  });

  test('503 when the deps cannot be built (no service-role env)', async () => {
    mockCreateDeps.mockImplementation(() => { throw new Error('SUPABASE_SERVICE_ROLE_KEY missing'); });
    const res = await ok();
    expect(res.status).toBe(503);
    expect(mockReportError).toHaveBeenCalledWith(expect.any(Error), { route: '/api/cron/longform-tick', stage: 'deps' });
    expect(mockRunTick).not.toHaveBeenCalled();
  });

  test('500 + an error marker if the tick throws', async () => {
    mockRunTick.mockRejectedValue(new Error('boom'));
    const res = await ok();
    expect(res.status).toBe(500);
    expect(mockOpsMarker).toHaveBeenCalledWith('error', 'longform_tick_failure', { error: 'boom' });
  });

  test('a warn marker when the report shows trouble', async () => {
    mockRunTick.mockResolvedValue({ ...emptyReport(), refundMisses: 1 });
    await ok();
    expect(mockOpsMarker).toHaveBeenCalledWith('warn', 'longform_tick', expect.objectContaining({ refundMisses: 1 }));
  });

  test('wired to the REAL tick with fake deps: an empty queue is a clean no-op', async () => {
    const calls: string[] = [];
    const deps: LongformTickDeps = {
      store: {
        claimJobs: async (limit, lease) => { calls.push(`claim ${limit} ${lease}`); return []; },
        loadScenes: async () => [], claimScenes: async () => [], patchScene: async () => undefined, patchJob: async () => undefined, releaseJob: async () => undefined,
      },
      engine: { submit: async () => { throw new Error('never'); }, poll: async () => { throw new Error('never'); }, extractLastFrame: async () => null },
      billing: { reserveAct: async () => 'ok', refundScene: async () => true },
      stitcher: { stitch: async () => ({ ok: false, reason: 'never', retryable: false }) },
      now: () => 1_800_000_000_000,
    };
    mockCreateDeps.mockReturnValue(deps);
    mockRunTick.mockImplementation((d: LongformTickDeps, o: object) => realTick(d, o));
    const res = await ok();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ...emptyReport() });
    expect(calls).toEqual(['claim 5 110']);
  });
});
