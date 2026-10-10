/** @jest-environment node */
/**
 * /api/tasks over HTTP (EF-7): a session is required; the user id is the session's, never the request's; anyone
 * else's task is the same 404 as none; a lease job is handed to a worker only while AGENT_G_MEDIA_EXEC is open to the
 * caller; Stop answers 409 where there is nothing to stop. The rules themselves are in lib/tasks/taskService.test.ts.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string; email?: string } | null = null;
jest.mock('../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: mockUser })),
}));
jest.mock('../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { READ: { maxRequests: 100, windowMs: 60_000 }, TASKS: { maxRequests: 120, windowMs: 60_000 } },
}));
jest.mock('../../../lib/admin/guard', () => ({ isAdminUser: (u: { email?: string } | null) => u?.email === 'admin@example.com' }));

type Row = import('../../../lib/tasks/taskView').TaskRow;
const mockRows: Row[] = [];
const mockKind = {
  status: jest.fn(async (r: Row) => ({
    task: { id: r.id, kind: 'agent-montage', service: 'film', status: 'running', stage: 'stitch', pct: 40, attempt: 1, result: null, error: null, cancellable: true, label: null, position: null, createdAt: null, updatedAt: null },
    needsWorker: true,
  })),
  view: jest.fn((r: Row) => ({ id: r.id, kind: 'agent-montage', status: r.status === 'failed' ? 'cancelled' : 'running' })),
  cancel: jest.fn(async (_u: string, id: string) => {
    const r = mockRows.find((x) => x.id === id)!;
    r.status = 'failed';
    return 'ok' as const;
  }),
  startWorker: jest.fn(),
};
const mockReads: Array<[string, string]> = [];
jest.mock('../../../lib/tasks/taskLive', () => {
  const { taskFromRow } = jest.requireActual<typeof import('../../../lib/tasks/taskView')>('../../../lib/tasks/taskView');
  return {
    liveTaskDeps: () => ({
      readRow: async (userId: string, id: string) => {
        mockReads.push([userId, id]);
        return mockRows.find((r) => r.id === id && r.user_id === userId) ?? null;
      },
      listRows: async (userId: string, opts: { active: boolean; limit: number }) =>
        mockRows.filter((r) => r.user_id === userId && (!opts.active || r.status === 'processing')).slice(0, opts.limit),
      kindOf: (r: Row) => ((r.params?._exec as { kind?: string } | undefined)?.kind ?? null),
      kinds: { 'agent-montage': mockKind },
      plain: taskFromRow,
    }),
  };
});

const mockRun = {
  planRun: jest.fn(async (_d: unknown, i: { userId: string; spec: unknown }) =>
    (i.spec ? { ok: true, plan: { runId: 'run-1', credits: 0, expiresAt: 1, steps: [] }, spec: i.spec, token: 'tok' } : { ok: false, error: 'bad_spec', message: 'x' })),
  startRun: jest.fn(async () => ({ ok: true, runId: 'run-1', replay: false })),
  approveStep: jest.fn(async () => ({ ok: true })),
  resumeRun: jest.fn(async () => ({ ok: true, runId: 'run-2', replay: false })),
  tickRun: jest.fn(async () => null),
};
jest.mock('../../../lib/agent/run/runExec', () => ({
  planRun: (...a: unknown[]) => (mockRun.planRun as jest.Mock)(...a),
  startRun: (...a: unknown[]) => (mockRun.startRun as jest.Mock)(...a),
  approveStep: (...a: unknown[]) => (mockRun.approveStep as jest.Mock)(...a),
  resumeRun: (...a: unknown[]) => (mockRun.resumeRun as jest.Mock)(...a),
  tickRun: (...a: unknown[]) => (mockRun.tickRun as jest.Mock)(...a),
}));
jest.mock('../../../lib/agent/run/runLive', () => ({ liveRunDeps: () => ({ live: true }) }));
const mockAfter: string[] = [];
jest.mock('../../../lib/platform/afterResponse', () => ({
  runAfterResponse: jest.fn((task: () => Promise<unknown>, label: string) => { mockAfter.push(label); void task(); return true; }),
}));
const mockRate = { ok: true as boolean };
jest.mock('../../../lib/orchestrator/rate-limit', () => ({
  checkProduceRate: jest.fn(async () => (mockRate.ok ? { ok: true } : { ok: false, reason: 'rate_minute', retryAfterSec: 60 })),
  rateLimitedResponse: () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 }),
}));

import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '../../../lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '../../../lib/api/rate-limit';
import { GET, POST } from './route';

const ENV = { ...process.env };
const row = (id: string, r: Partial<Row> = {}): Row => ({
  id, user_id: 'user-1', service_type: 'film', status: 'processing', current_stage: null, pct: null, params: {}, result: null,
  signed_url: null, error: null, created_at: null, updated_at: null, ...r,
});
const get = (query = '') => GET(new NextRequest(`https://myavatar.ge/api/tasks${query}`));
const post = (body: unknown) =>
  POST(new NextRequest('https://myavatar.ge/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV };
  delete process.env.AGENT_G_MEDIA_EXEC;
  delete process.env.VERCEL_ENV;
  mockUser = { id: 'user-1', email: 'admin@example.com' };
  mockReads.length = 0;
  mockRows.length = 0;
  mockAfter.length = 0;
  mockRate.ok = true;
  mockRows.push(
    row('prod_1_a', { status: 'completed', signed_url: 'https://s/v.mp4' }),
    row('job-m', { params: { _exec: { kind: 'agent-montage' } } }),
    row('job-x', { user_id: 'user-2', params: { _exec: { kind: 'agent-montage' } } }),
    row('prod_2_b'),
  );
});
afterAll(() => {
  process.env = ENV;
});

test('signed out: 401 for a read, a list and a stop, and no row is read', async () => {
  mockUser = null;
  expect((await get('?id=job-m')).status).toBe(401);
  expect((await get()).status).toBe(401);
  expect((await post({ action: 'cancel', id: 'job-m' })).status).toBe(401);
  expect(mockReads).toEqual([]);
});

test("one task: the caller's own, by the session's id; anyone else's is the same 404 as none; answers are never cached", async () => {
  const own = await get('?id=prod_1_a');
  expect(own.status).toBe(200);
  expect(own.headers.get('cache-control')).toBe('private, no-store');
  expect(await own.json()).toEqual({ ok: true, task: expect.objectContaining({ id: 'prod_1_a', kind: 'render', status: 'completed', result: { url: 'https://s/v.mp4', media: 'video' } }) });
  for (const q of ['?id=job-x', '?id=missing', '?id=../etc', '?id=']) {
    const r = await get(q);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ ok: false, error: 'not_found', message: 'No such task.' });
  }
  expect(mockReads.every(([u]) => u === 'user-1')).toBe(true);
  expect(authedClientFromRequest).toHaveBeenCalled();
});

test('a lease job is read through its executor; a worker is started only while Agent G media is open to the caller', async () => {
  // Closed (Production default): it reads, it never starts work.
  expect(await (await get('?id=job-m')).json()).toMatchObject({ ok: true, task: { id: 'job-m', kind: 'agent-montage', status: 'running', pct: 40 } });
  expect(mockKind.startWorker).not.toHaveBeenCalled();
  // `admin`: admins only.
  process.env.AGENT_G_MEDIA_EXEC = 'admin';
  mockUser = { id: 'user-1', email: 'someone@example.com' };
  await get('?id=job-m');
  expect(mockKind.startWorker).not.toHaveBeenCalled();
  mockUser = { id: 'user-1', email: 'admin@example.com' };
  await get('?id=job-m');
  expect(mockKind.startWorker).toHaveBeenCalledWith('job-m');
});

test("the list: the caller's own tasks, live ones with active=1, a bad limit falls back to the cap", async () => {
  expect((await (await get()).json()).tasks.map((t: { id: string }) => t.id)).toEqual(['prod_1_a', 'job-m', 'prod_2_b']);
  expect((await (await get('?active=1')).json()).tasks.map((t: { id: string }) => t.id)).toEqual(['job-m', 'prod_2_b']);
  expect((await (await get('?limit=1')).json()).tasks).toHaveLength(1);
  expect((await (await get('?limit=abc')).json()).tasks).toHaveLength(3);
});

test('stop: a lease job through its executor (200); a studio render 409 not_cancellable; over 409 not_running; others 404; a bad action 400', async () => {
  const ok = await post({ action: 'cancel', id: 'job-m' });
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ ok: true, task: { id: 'job-m', kind: 'agent-montage', status: 'cancelled' } });
  expect(mockKind.cancel).toHaveBeenCalledWith('user-1', 'job-m');

  const render = await post({ action: 'cancel', id: 'prod_2_b' });
  expect(render.status).toBe(409);
  expect(await render.json()).toEqual({ ok: false, error: 'not_cancellable' });
  expect(await (await post({ action: 'cancel', id: 'prod_1_a' })).json()).toEqual({ ok: false, error: 'not_running' });

  expect((await post({ action: 'cancel', id: 'job-x' })).status).toBe(404);
  expect((await post({ action: 'cancel', id: 'a/b' })).status).toBe(404);
  expect(mockKind.cancel).toHaveBeenCalledTimes(1);
  expect((await post({ action: 'delete', id: 'job-m' })).status).toBe(400);
  expect((await post('not json')).status).toBe(400);
});

test('its own rate-limit bucket, keyed by the user: the tray, the panels and the chat cards poll it, not the shared read budget', async () => {
  await get('?active=1');
  await get('?id=job-m');
  await post({ action: 'cancel', id: 'job-m' });
  expect(checkRateLimit).toHaveBeenCalledTimes(3);
  for (const call of (checkRateLimit as jest.Mock).mock.calls) {
    expect(call[1]).toBe(RATE_LIMITS.TASKS);
    expect(call[2]).toBe('user-1');
  }
  // Over the limit: its 429 is the answer, and nothing is read or stopped.
  (checkRateLimit as jest.Mock).mockResolvedValueOnce(NextResponse.json({ error: 'rate_limited' }, { status: 429 }));
  expect((await get('?id=job-m')).status).toBe(429);
  (checkRateLimit as jest.Mock).mockResolvedValueOnce(NextResponse.json({ error: 'rate_limited' }, { status: 429 }));
  expect((await post({ action: 'cancel', id: 'job-m' })).status).toBe(429);
  expect(mockKind.cancel).toHaveBeenCalledTimes(1);
});

describe('multi-step runs (PART 2): plan, run, approve, resume', () => {
  const SPEC = { steps: [{ id: 'sound', tool: 'audio_extract', source: { file: 'omni-uploads/user-1/v.mp4' } }] };

  test('closed (Production default) or not an admin under `admin`: 403 not_enabled, nothing is planned or started', async () => {
    for (const body of [{ action: 'plan', spec: SPEC }, { action: 'run', spec: SPEC, token: 't' }, { action: 'approve', id: 'job-m', step: 's', quoteId: 'q' }, { action: 'resume', id: 'job-m' }]) {
      const r = await post(body);
      expect([body.action, r.status, (await r.json()).error]).toEqual([body.action, 403, 'not_enabled']);
    }
    process.env.AGENT_G_MEDIA_EXEC = 'admin';
    mockUser = { id: 'user-1', email: 'someone@example.com' };
    expect((await post({ action: 'plan', spec: SPEC })).status).toBe(403);
    for (const f of Object.values(mockRun)) expect(f).not.toHaveBeenCalled();
  });

  test("plan and run: the session's user id, never the body's; the tap's answer is the run id and the run moves on after it", async () => {
    process.env.AGENT_G_MEDIA_EXEC = 'admin';
    const plan = await post({ action: 'plan', spec: SPEC, userId: 'user-2' });
    expect(plan.status).toBe(200);
    expect(await plan.json()).toMatchObject({ ok: true, plan: { runId: 'run-1' }, token: 'tok' });
    expect(mockRun.planRun).toHaveBeenCalledWith({ live: true }, { userId: 'user-1', spec: SPEC });
    expect((await post({ action: 'plan' })).status).toBe(400); // bad_spec

    const run = await post({ action: 'run', spec: SPEC, token: 'tok', userId: 'user-2' });
    expect(run.status).toBe(200);
    expect(await run.json()).toEqual({ ok: true, jobId: 'run-1', status: 'queued', replay: false });
    expect(mockRun.startRun).toHaveBeenCalledWith({ live: true }, { userId: 'user-1', spec: SPEC, token: 'tok' });
    expect(mockAfter).toEqual(['agent-run-tick']);
    expect(mockRun.tickRun).toHaveBeenCalledWith({ live: true }, { id: 'run-1', startWorkers: true });
  });

  test('run errors keep their meaning: an expired or changed plan 409, an unrecordable run 503; the produce cap applies', async () => {
    process.env.AGENT_G_MEDIA_EXEC = '1';
    mockRun.startRun.mockResolvedValueOnce({ ok: false, error: 'quote_expired', message: 'x' } as never);
    expect((await post({ action: 'run', spec: SPEC, token: 'old' })).status).toBe(409);
    mockRun.startRun.mockResolvedValueOnce({ ok: false, error: 'jobs_unavailable', message: 'x' } as never);
    expect((await post({ action: 'run', spec: SPEC, token: 'tok' })).status).toBe(503);
    expect(mockAfter).toEqual([]);
    mockRate.ok = false;
    expect((await post({ action: 'run', spec: SPEC, token: 'tok' })).status).toBe(429);
    expect((await post({ action: 'resume', id: 'job-m' })).status).toBe(429);
    expect(mockRun.startRun).toHaveBeenCalledTimes(2);
    expect(mockRun.resumeRun).not.toHaveBeenCalled();
  });

  test("approve: the user's yes to one step's quote; the answer is the task as it now stands; a stale quote 409", async () => {
    process.env.AGENT_G_MEDIA_EXEC = '1';
    const ok = await post({ action: 'approve', id: 'job-m', step: 'sound', quoteId: 'q1' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, task: { id: 'job-m' } });
    expect(mockRun.approveStep).toHaveBeenCalledWith({ live: true }, { userId: 'user-1', id: 'job-m', step: 'sound', quoteId: 'q1', startWorkers: true });
    mockRun.approveStep.mockResolvedValueOnce({ ok: false, error: 'quote_changed', message: 'x', step: 'sound' } as never);
    expect((await post({ action: 'approve', id: 'job-m', step: 'sound', quoteId: 'old' })).status).toBe(409);
    mockRun.approveStep.mockResolvedValueOnce({ ok: false, error: 'not_found', message: 'x' } as never);
    expect((await post({ action: 'approve', id: 'job-x', step: 'sound', quoteId: 'q1' })).status).toBe(404);
    expect((await post({ action: 'approve', id: '../x', step: 'sound', quoteId: 'q1' })).status).toBe(404);
  });

  test('resume: a new run id, moved on after the answer; a live run 409 not_final', async () => {
    process.env.AGENT_G_MEDIA_EXEC = '1';
    const ok = await post({ action: 'resume', id: 'job-m' });
    expect(await ok.json()).toEqual({ ok: true, jobId: 'run-2', status: 'queued', replay: false });
    expect(mockRun.resumeRun).toHaveBeenCalledWith({ live: true }, { userId: 'user-1', id: 'job-m' });
    expect(mockAfter).toEqual(['agent-run-tick']);
    mockRun.resumeRun.mockResolvedValueOnce({ ok: false, error: 'not_final', message: 'x' } as never);
    expect((await post({ action: 'resume', id: 'job-m' })).status).toBe(409);
  });

  test('a read can ask only for the events after the ones it has (`after=n`); anything else is ignored', async () => {
    await get('?id=job-m&after=7');
    expect(mockKind.status).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'job-m' }), 'user-1', { workersOpen: false, after: 7 });
    for (const bad of ['-1', 'abc', '1.5']) {
      await get(`?id=job-m&after=${bad}`);
      expect(mockKind.status).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'job-m' }), 'user-1', { workersOpen: false });
    }
  });
});
