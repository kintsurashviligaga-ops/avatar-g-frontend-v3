/** @jest-environment node */
/**
 * /api/video/director/* — the director run over HTTP, end to end on a scripted Veo engine, an in-memory Supabase table
 * and a fake ledger (no network, no spend). Pins: the routes do not exist while VIDEO_DIRECTOR_RUNS is off (404 before
 * the session is even read), `admin` lets only admins in, signed-out callers get 401; a plan is only ever a draft; a run
 * starts only from an approved storyboard and charges nothing until its first step; steps render every shot in order,
 * each charged under its own ref; another user cannot see or move a run; decisions that do not apply are 409; and in
 * production a ledger that cannot charge refuses the shot instead of rendering it free.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string; email?: string } | null = null;
const mockRows = new Map<string, Record<string, unknown>>();

function mockDb() {
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    from() {
      const filters: Array<[string, unknown]> = [];
      let patch: Record<string, unknown> | null = null;
      const matches = () =>
        [...mockRows.values()].filter((row) => filters.every(([col, v]) => row[col] === v));
      const builder = {
        async insert(row: Record<string, unknown>) {
          if (mockRows.has(row.id as string)) return { error: { message: 'duplicate key' } };
          mockRows.set(row.id as string, clone(row));
          return { error: null };
        },
        select: () => builder,
        update: (p: Record<string, unknown>) => {
          patch = p;
          return builder;
        },
        eq: (col: string, v: unknown) => {
          filters.push([col, v]);
          return builder;
        },
        async maybeSingle() {
          const row = matches()[0];
          return { data: row ? { record: clone(row.record) } : null, error: null };
        },
        then(resolve: (v: unknown) => void) {
          // The awaited UPDATE … WHERE id, user_id, version … RETURNING id.
          const hit = patch ? matches() : [];
          for (const row of hit) Object.assign(row, clone(patch));
          resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
        },
      };
      return builder;
    },
  };
}

jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: mockUser })),
  createServiceRoleClient: jest.fn(() => mockDb()),
  isSupabaseConfiguredServer: jest.fn(() => true),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { READ: { maxRequests: 100, windowMs: 60_000 }, WRITE: { maxRequests: 20, windowMs: 60_000 }, EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } },
}));
jest.mock('../../../../lib/admin/guard', () => ({ isAdminUser: (u: { email?: string } | null) => u?.email === 'admin@example.com' }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundDebitByRef: jest.fn(async () => ({ ok: true, refunded: 1 })),
}));
// The live bindings, swapped for the scripted engine and a canned planner: nothing here may reach Google.
jest.mock('../../../../lib/video/director/server', () => {
  const { createFakeVeoEngine } = jest.requireActual('../../../../lib/video/director/testing/fakeVeoEngine');
  const { createVideoDirector } = jest.requireActual('../../../../lib/video/director/director');
  const { GoogleVeoProvider } = jest.requireActual('../../../../lib/video/director/googleVeoProvider');
  const { makeStoryboard, threeShots } = jest.requireActual('../../../../lib/video/director/testing/fixtures');
  const engine = createFakeVeoEngine();
  return {
    liveVeoEngine: engine,
    createGoogleVideoDirector: () =>
      createVideoDirector({
        provider: new GoogleVeoProvider({ engine }),
        // The planner claims approval; the director must strip it.
        planner: async () => ({ ...makeStoryboard(threeShots()), approvedByUser: true }),
      }),
  };
});

import { NextRequest } from 'next/server';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
import { deductCredits } from '../../../../lib/orchestrator/ledger';
import { liveVeoEngine } from '../../../../lib/video/director/server';
import { makeStoryboard, threeShots } from '../../../../lib/video/director/testing/fixtures';
import type { FakeVeoEngine } from '../../../../lib/video/director/testing/fakeVeoEngine';
import { POST as plan } from './plan/route';
import { POST as start } from './runs/route';
import { GET as getRun } from './runs/[id]/route';
import { POST as advance } from './runs/[id]/advance/route';
import { POST as decide } from './runs/[id]/decision/route';

const engine = liveVeoEngine as unknown as FakeVeoEngine;
const ENV = { ...process.env };

function req(path: string, body?: unknown): NextRequest {
  return new NextRequest(`https://myavatar.ge${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const approved = () => makeStoryboard(threeShots());

async function startRun(): Promise<string> {
  const res = await start(req('/api/video/director/runs', { storyboard: approved() }));
  expect(res.status).toBe(201);
  return ((await res.json()) as { run: { id: string } }).run.id;
}

const step = async (id: string) => (await (await advance(req(`/api/video/director/runs/${id}/advance`, {}), { params: { id } })).json()) as { run: { state: string; shots: Array<{ status: string }> } };

beforeEach(() => {
  process.env = { ...ENV, VIDEO_DIRECTOR_RUNS: '1', SUPABASE_SERVICE_ROLE_KEY: 'test-key' };
  mockUser = { id: 'user-1', email: 'someone@example.com' };
  mockRows.clear();
  engine.calls.length = 0;
  jest.clearAllMocks();
});

afterAll(() => {
  process.env = ENV;
});

describe('the gate', () => {
  it('answers 404 on every route while VIDEO_DIRECTOR_RUNS is off, before reading the session', async () => {
    delete process.env.VIDEO_DIRECTOR_RUNS;
    const id = '00000000-0000-4000-8000-000000000000';
    const statuses = [
      (await plan(req('/api/video/director/plan', { brief: 'x', aspectRatio: '16:9' }))).status,
      (await start(req('/api/video/director/runs', { storyboard: approved() }))).status,
      (await getRun(req(`/api/video/director/runs/${id}`), { params: { id } })).status,
      (await advance(req(`/api/video/director/runs/${id}/advance`, {}), { params: { id } })).status,
      (await decide(req(`/api/video/director/runs/${id}/decision`, { decision: 'cancel' }), { params: { id } })).status,
    ];
    expect(statuses).toEqual([404, 404, 404, 404, 404]);
    expect(authedClientFromRequest).not.toHaveBeenCalled();
  });

  it('`admin` lets only admins in; everyone else gets 404', async () => {
    process.env.VIDEO_DIRECTOR_RUNS = 'admin';
    expect((await start(req('/api/video/director/runs', { storyboard: approved() }))).status).toBe(404);
    mockUser = { id: 'admin-1', email: 'admin@example.com' };
    expect((await start(req('/api/video/director/runs', { storyboard: approved() }))).status).toBe(201);
  });

  it('refuses a signed-out caller with 401', async () => {
    mockUser = null;
    expect((await start(req('/api/video/director/runs', { storyboard: approved() }))).status).toBe(401);
    expect((await plan(req('/api/video/director/plan', { brief: 'x', aspectRatio: '16:9' }))).status).toBe(401);
  });
});

describe('plan', () => {
  it('lists every problem with the input and calls no planner', async () => {
    const res = await plan(req('/api/video/director/plan', { brief: '', aspectRatio: '1:1', shotCount: 40, durationSeconds: 5 }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { problems: string[] };
    expect(body.problems).toHaveLength(4);
  });

  it('returns a draft that is never approved, with its price', async () => {
    const res = await plan(req('/api/video/director/plan', { brief: 'A lighthouse keeper at night', aspectRatio: '16:9' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { storyboard: { approvedByUser: boolean; createdBy: string }; quoteCredits: number };
    expect(body.storyboard.approvedByUser).toBe(false);
    expect(body.storyboard.createdBy).toBe('agent_planner');
    expect(body.quoteCredits).toBe(75);
  });
});

describe('runs', () => {
  it('refuses a storyboard the user has not approved, and one that breaks the rules', async () => {
    const draft = await start(req('/api/video/director/runs', { storyboard: { ...approved(), approvedByUser: false } }));
    expect(draft.status).toBe(400);
    const broken = await start(req('/api/video/director/runs', { storyboard: { ...approved(), totalDurationSeconds: 99 } }));
    expect(broken.status).toBe(400);
    expect(((await broken.json()) as { error: string }).error).toBe('invalid_storyboard');
    expect(mockRows.size).toBe(0);
  });

  it('starts with nothing charged, then renders every shot in order, each under its own charge', async () => {
    const id = await startRun();
    expect(deductCredits).not.toHaveBeenCalled();
    expect(engine.calls).toHaveLength(0);
    let last = await step(id);
    for (let i = 0; i < 5; i++) last = await step(id);
    expect(last.run.state).toBe('completed');
    expect(engine.calls.map((c) => c.request.prompt)).toEqual(approved().shots.map((s) => s.prompt));
    expect((deductCredits as jest.Mock).mock.calls.map((c) => c[2])).toEqual([
      `director:${id}:shot:0:a1`,
      `director:${id}:shot:1:a1`,
      `director:${id}:shot:2:a1`,
    ]);
    const got = await getRun(req(`/api/video/director/runs/${id}`), { params: { id } });
    const view = (await got.json()) as { run: { state: string; shots: Array<{ clipUrl?: string }> } };
    expect(view.run.state).toBe('completed');
    expect(view.run.shots.every((s) => typeof s.clipUrl === 'string')).toBe(true);
    expect(JSON.stringify(view)).not.toContain('operations/');
  });

  it('is invisible to every other user', async () => {
    const id = await startRun();
    mockUser = { id: 'user-2', email: 'other@example.com' };
    expect((await getRun(req(`/api/video/director/runs/${id}`), { params: { id } })).status).toBe(404);
    expect((await advance(req(`/api/video/director/runs/${id}/advance`, {}), { params: { id } })).status).toBe(404);
    expect(engine.calls).toHaveLength(0);
  });

  it('answers 404 for an id that is not a run id', async () => {
    const id = "x' OR 1=1 --";
    expect((await getRun(req('/api/video/director/runs/x'), { params: { id } })).status).toBe(404);
  });
});

describe('decision', () => {
  it('refuses an unknown decision (400) and one that does not apply now (409)', async () => {
    const id = await startRun();
    await step(id);
    expect((await decide(req(`/api/video/director/runs/${id}/decision`, { decision: 'skip' }), { params: { id } })).status).toBe(400);
    expect((await decide(req(`/api/video/director/runs/${id}/decision`, { decision: 'retry' }), { params: { id } })).status).toBe(409);
  });
});

describe('billing in production', () => {
  it('a ledger that cannot charge refuses the shot: nothing is submitted, the run waits', async () => {
    const id = await startRun();
    (process.env as Record<string, string>).NODE_ENV = 'production';
    (deductCredits as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'skipped' });
    const after = await step(id);
    expect(after.run.state).toBe('waiting_for_shot_decision');
    expect(engine.calls).toHaveLength(0);
  });
});

describe('GET /api/video/director — the studio asks before it hands a board over', () => {
  it('is false while the flag is off, signed out, or for a non-admin under `admin`; true when open', async () => {
    const { GET: capability } = await import('./route');
    const enabled = async () => ((await (await capability(req('/api/video/director'))).json()) as { enabled: boolean }).enabled;
    expect(await enabled()).toBe(true);
    mockUser = null;
    expect(await enabled()).toBe(false);
    mockUser = { id: 'user-1', email: 'someone@example.com' };
    process.env.VIDEO_DIRECTOR_RUNS = 'admin';
    expect(await enabled()).toBe(false);
    mockUser = { id: 'admin-1', email: 'admin@example.com' };
    expect(await enabled()).toBe(true);
    delete process.env.VIDEO_DIRECTOR_RUNS;
    expect(await enabled()).toBe(false);
  });
});
