/** @jest-environment node */
/**
 * /api/agent/media/montage over HTTP: closed (404, before the session is read) unless AGENT_G_MEDIA_EXEC opens it,
 * `admin` lets only admins in, signed-out callers get 401; the user id always comes from the session, never the body;
 * the executor's refusals map to HTTP statuses. The executor itself is tested in lib/agent/media/montageExec.test.ts.
 */
jest.mock('server-only', () => ({}));

const mockAudit = jest.fn(async () => {});

let mockUser: { id: string; email?: string } | null = null;
jest.mock('../../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: mockUser })),
}));
jest.mock('../../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { READ: { maxRequests: 100, windowMs: 60_000 }, EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } },
}));
jest.mock('../../../../../lib/admin/guard', () => ({ isAdminUser: (u: { email?: string } | null) => u?.email === 'admin@example.com' }));
jest.mock('../../../../../lib/agent/media/montageLive', () => ({ liveMontageDeps: () => ({ audit: mockAudit }), newWorkerId: () => 'w-1' }));
jest.mock('../../../../../lib/agent/media/montageExec', () => ({
  quoteMontage: jest.fn(async (_d: unknown, input: { userId: string }) => ({ ok: true, quote: { jobId: 'j1' }, request: {}, token: 't', who: input.userId })),
  enqueueMontageJob: jest.fn(async () => ({ ok: false, error: 'quote_expired', message: 'expired' })),
  montageJobStatus: jest.fn(async () => ({ ok: false, error: 'not_found', message: 'No such edit.' })),
  cancelMontageJob: jest.fn(async () => ({ ok: false, error: 'not_found', message: 'No such edit.' })),
}));
jest.mock('../../../../../lib/agent/media/montageWorker', () => ({ workMontageJob: jest.fn(async () => ({ ran: true, outcome: 'delivered', videoUrl: 'x' })) }));

import { NextRequest } from 'next/server';
import { authedClientFromRequest } from '../../../../../lib/supabase/server';
import { enqueueMontageJob, montageJobStatus, quoteMontage } from '../../../../../lib/agent/media/montageExec';
import { workMontageJob } from '../../../../../lib/agent/media/montageWorker';
import { GET, POST } from './route';

const ENV = { ...process.env };
const CTX = Symbol.for('@vercel/request-context');
let waitUntil: jest.Mock;
const req = (body?: unknown, query = '') =>
  new NextRequest(`https://myavatar.ge/api/agent/media/montage${query}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV };
  delete process.env.AGENT_G_MEDIA_EXEC;
  delete process.env.VERCEL_ENV;
  mockUser = { id: 'user-1', email: 'admin@example.com' };
  waitUntil = jest.fn();
  (globalThis as Record<symbol, unknown>)[CTX] = { get: () => ({ waitUntil }) };
});
afterAll(() => {
  process.env = ENV;
  delete (globalThis as Record<symbol, unknown>)[CTX];
});

test('closed by default: POST is a 404 before the session is read, GET says disabled', async () => {
  expect((await POST(req({ action: 'quote', files: ['a'] }))).status).toBe(404);
  expect(authedClientFromRequest).not.toHaveBeenCalled();
  expect(await (await GET(req())).json()).toEqual({ enabled: false });
});

test('admin: admins only; signed out is 401', async () => {
  process.env.AGENT_G_MEDIA_EXEC = 'admin';
  expect(await (await GET(req())).json()).toEqual({ enabled: true });
  mockUser = { id: 'user-2', email: 'someone@example.com' };
  expect((await POST(req({ action: 'quote', files: ['a'] }))).status).toBe(404);
  expect(await (await GET(req())).json()).toEqual({ enabled: false });
  mockUser = null;
  expect((await POST(req({ action: 'quote', files: ['a'] }))).status).toBe(401);
});

test('a Preview with the flag unset is admin-only; Production with it unset is closed', async () => {
  process.env.VERCEL_ENV = 'preview';
  expect((await POST(req({ action: 'quote', files: ['a'] }))).status).toBe(200);
  process.env.VERCEL_ENV = 'production';
  expect((await POST(req({ action: 'quote', files: ['a'] }))).status).toBe(404);
});

test('the user id is the session, not anything in the body; refusals map to statuses', async () => {
  process.env.AGENT_G_MEDIA_EXEC = 'on';
  const res = await POST(req({ action: 'quote', files: ['a'], userId: 'someone-else' }));
  expect(res.status).toBe(200);
  expect((quoteMontage as jest.Mock).mock.calls[0][1]).toMatchObject({ userId: 'user-1', files: ['a'] });
  expect((await POST(req({ action: 'run', request: {}, token: 't' }))).status).toBe(409);
  expect((await POST(req({ action: 'cancel', jobId: 'j' }))).status).toBe(404);
  expect((await POST(req({ action: 'nope' }))).status).toBe(400);
});

describe('the render runs in a worker after the answer, never in the request', () => {
  beforeEach(() => { process.env.AGENT_G_MEDIA_EXEC = 'on'; });

  test('run answers "queued" at once and hands the job to a worker after the response', async () => {
    (enqueueMontageJob as jest.Mock).mockResolvedValueOnce({ ok: true, jobId: 'j9', status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false });
    (workMontageJob as jest.Mock).mockImplementationOnce(() => new Promise(() => {})); // a render that never ends…
    const res = await POST(req({ action: 'run', request: {}, token: 't' })); // …does not hold the answer
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, jobId: 'j9', status: 'queued' });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect((workMontageJob as jest.Mock).mock.calls[0][1]).toEqual({ jobId: 'j9', worker: 'w-1' });
  });

  test('a replay of a delivered job starts nothing', async () => {
    (enqueueMontageJob as jest.Mock).mockResolvedValueOnce({ ok: true, jobId: 'j9', status: 'completed', videoUrl: 'v', durationSec: 9, aspect: '9:16', replay: true });
    expect((await POST(req({ action: 'run', request: {}, token: 't' }))).status).toBe(200);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  test("the owner's status read: the view, and a worker only when the job has none", async () => {
    (montageJobStatus as jest.Mock).mockResolvedValueOnce({ view: { ok: true, jobId: 'j9', status: 'running', stage: 'stitch', pct: 88, attempt: 1 }, needsWorker: false });
    const live = await GET(req(undefined, '?jobId=j9'));
    expect(await live.json()).toMatchObject({ status: 'running', pct: 88 });
    expect((montageJobStatus as jest.Mock).mock.calls[0][1]).toEqual({ userId: 'user-1', jobId: 'j9' });
    expect(waitUntil).not.toHaveBeenCalled();

    (montageJobStatus as jest.Mock).mockResolvedValueOnce({ view: { ok: true, jobId: 'j9', status: 'running', stage: 'stitch', pct: 88, attempt: 1 }, needsWorker: true });
    await GET(req(undefined, '?jobId=j9'));
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  test('a job read is closed like the rest: flag off 404, signed out 401, not yours 404', async () => {
    delete process.env.AGENT_G_MEDIA_EXEC;
    expect((await GET(req(undefined, '?jobId=j9'))).status).toBe(404);
    process.env.AGENT_G_MEDIA_EXEC = 'on';
    mockUser = null;
    expect((await GET(req(undefined, '?jobId=j9'))).status).toBe(401);
    mockUser = { id: 'user-1', email: 'admin@example.com' };
    expect((await GET(req(undefined, '?jobId=j9'))).status).toBe(404);
  });
});

describe('how the user said yes (lib/agent/approval)', () => {
  beforeEach(() => { process.env.AGENT_G_MEDIA_EXEC = 'on'; });

  test('no approval is the card\'s Start tap', async () => {
    await POST(req({ action: 'run', request: {}, token: 't' }));
    expect((enqueueMontageJob as jest.Mock).mock.calls[0][1]).toMatchObject({ userId: 'user-1', approval: { channel: 'tap' } });
  });

  test('a voice yes reaches the executor with the user\'s words', async () => {
    await POST(req({ action: 'run', request: {}, token: 't', approval: { channel: 'voice-transcript', said: 'კი, დაიწყე' } }));
    expect((enqueueMontageJob as jest.Mock).mock.calls[0][1].approval).toEqual({ channel: 'voice-transcript', said: 'კი, დაიწყე' });
  });

  test('words that are not a clear yes start nothing, and the refusal is audited', async () => {
    const res = await POST(req({ action: 'run', request: {}, token: 't', approval: { channel: 'voice-transcript', said: 'wait' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: 'approval_unclear' });
    expect(enqueueMontageJob).not.toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith({ userId: 'user-1', op: 'montage', phase: 'run', outcome: 'refused', detail: 'approval_unclear' });
    expect((await POST(req({ action: 'run', request: {}, token: 't', approval: { channel: 'model' } }))).status).toBe(400);
    expect(enqueueMontageJob).not.toHaveBeenCalled();
  });
});
