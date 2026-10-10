/** @jest-environment node */
/**
 * /api/agent/media/edit over HTTP: closed (404, before the session is read) unless AGENT_G_MEDIA_EXEC opens it,
 * `admin` lets only admins in, signed-out callers get 401; the user id always comes from the session, never the body;
 * an edit this file cannot take is a 422 that says why; the edit runs in a worker after the answer. The executor is
 * tested in lib/agent/media/editExec.test.ts and editLive.ffmpeg.test.ts.
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
jest.mock('../../../../../lib/agent/media/montageLive', () => ({ newWorkerId: () => 'w-1' }));
jest.mock('../../../../../lib/agent/media/editLive', () => ({ liveEditDeps: () => ({ audit: mockAudit }) }));
jest.mock('../../../../../lib/agent/media/editExec', () => ({
  quoteEdit: jest.fn(async (_d: unknown, input: { userId: string }) => ({ ok: true, quote: { jobId: 'j1' }, request: {}, token: 't', who: input.userId })),
  enqueueEditJob: jest.fn(async () => ({ ok: false, error: 'quote_expired', message: 'expired' })),
  editJobStatus: jest.fn(async () => ({ ok: false, error: 'not_found', message: 'No such job.' })),
  cancelEditJob: jest.fn(async () => ({ ok: false, error: 'not_found', message: 'No such job.' })),
}));
jest.mock('../../../../../lib/agent/media/editWorker', () => ({ workEditJob: jest.fn(async () => ({ ran: true, outcome: 'delivered', url: 'x' })) }));

import { NextRequest } from 'next/server';
import { authedClientFromRequest } from '../../../../../lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '../../../../../lib/api/rate-limit';
import { editJobStatus, enqueueEditJob, quoteEdit } from '../../../../../lib/agent/media/editExec';
import { workEditJob } from '../../../../../lib/agent/media/editWorker';
import { GET, POST } from './route';

const ENV = { ...process.env };
const CTX = Symbol.for('@vercel/request-context');
let waitUntil: jest.Mock;
const FILE = 'omni-uploads/user-1/clip.mp4';
const EDITS = [{ op: 'trim', toSec: 5 }];
const req = (body?: unknown, query = '') =>
  new NextRequest(`https://myavatar.ge/api/agent/media/edit${query}`, {
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
  expect((await POST(req({ action: 'quote', file: FILE, edits: EDITS }))).status).toBe(404);
  expect((await GET(req(undefined, '?jobId=j1'))).status).toBe(404);
  expect(authedClientFromRequest).not.toHaveBeenCalled();
  expect(await (await GET(req())).json()).toEqual({ enabled: false });
});

test('admin: admins only; signed out is 401; Production with the flag unset is closed', async () => {
  process.env.AGENT_G_MEDIA_EXEC = 'admin';
  expect(await (await GET(req())).json()).toEqual({ enabled: true });
  mockUser = { id: 'user-2', email: 'someone@example.com' };
  expect((await POST(req({ action: 'quote', file: FILE, edits: EDITS }))).status).toBe(404);
  mockUser = null;
  expect((await POST(req({ action: 'quote', file: FILE, edits: EDITS }))).status).toBe(401);
  delete process.env.AGENT_G_MEDIA_EXEC;
  process.env.VERCEL_ENV = 'production';
  mockUser = { id: 'user-1', email: 'admin@example.com' };
  expect((await POST(req({ action: 'quote', file: FILE, edits: EDITS }))).status).toBe(404);
});

test('the user id is the session, not the body; refusals carry their status', async () => {
  process.env.AGENT_G_MEDIA_EXEC = 'on';
  expect((await POST(req({ action: 'quote', file: FILE, edits: EDITS, name: 'clip.mp4', userId: 'someone-else' }))).status).toBe(200);
  expect((quoteEdit as jest.Mock).mock.calls[0][1]).toEqual({ userId: 'user-1', file: FILE, edits: EDITS, name: 'clip.mp4' });
  expect((checkRateLimit as jest.Mock).mock.calls[0][1]).toBe(RATE_LIMITS.EXPENSIVE);
  (quoteEdit as jest.Mock).mockResolvedValueOnce({ ok: false, error: 'out_of_range', message: 'The video is 30 s long.' });
  const past = await POST(req({ action: 'quote', file: FILE, edits: [{ op: 'trim', fromSec: 40 }] }));
  expect(past.status).toBe(422);
  expect(await past.json()).toMatchObject({ error: 'out_of_range', message: 'The video is 30 s long.' });
  (quoteEdit as jest.Mock).mockResolvedValueOnce({ ok: false, error: 'media_not_yours', message: 'm' });
  expect((await POST(req({ action: 'quote', file: 'omni-uploads/user-2/x.mp4', edits: EDITS }))).status).toBe(403);
  expect((await POST(req({ action: 'run', request: {}, token: 't' }))).status).toBe(409);
  expect((await POST(req({ action: 'cancel', jobId: 'j' }))).status).toBe(404);
  expect((await POST(req({ action: 'nope' }))).status).toBe(400);
});

describe('the edit runs in a worker after the answer, never in the request', () => {
  beforeEach(() => { process.env.AGENT_G_MEDIA_EXEC = 'on'; });

  test('run answers "queued" at once and hands the job to a worker after the response', async () => {
    (enqueueEditJob as jest.Mock).mockResolvedValueOnce({ ok: true, jobId: 'j9', status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false });
    (workEditJob as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
    const res = await POST(req({ action: 'run', request: {}, token: 't' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, jobId: 'j9', status: 'queued' });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect((workEditJob as jest.Mock).mock.calls[0][1]).toEqual({ jobId: 'j9', worker: 'w-1' });
  });

  test('a replay of a delivered job starts nothing', async () => {
    (enqueueEditJob as jest.Mock).mockResolvedValueOnce({ ok: true, jobId: 'j9', status: 'completed', output: 'mp4', url: 'u', name: 'a.mp4', durationSec: 5, width: 1080, height: 1920, edits: [], replay: true });
    expect((await POST(req({ action: 'run', request: {}, token: 't' }))).status).toBe(200);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  test("the owner's status read: the view, and a worker only when the job has none", async () => {
    (editJobStatus as jest.Mock).mockResolvedValueOnce({ view: { ok: true, jobId: 'j9', status: 'running', stage: 'render', pct: 10, attempt: 1 }, needsWorker: false });
    expect(await (await GET(req(undefined, '?jobId=j9'))).json()).toMatchObject({ status: 'running', stage: 'render' });
    expect((editJobStatus as jest.Mock).mock.calls[0][1]).toEqual({ userId: 'user-1', jobId: 'j9' });
    expect(waitUntil).not.toHaveBeenCalled();
    (editJobStatus as jest.Mock).mockResolvedValueOnce({ view: { ok: true, jobId: 'j9', status: 'queued', stage: 'queued', pct: 0, attempt: 0 }, needsWorker: true });
    await GET(req(undefined, '?jobId=j9'));
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
});

describe('how the user said yes (lib/agent/approval)', () => {
  beforeEach(() => { process.env.AGENT_G_MEDIA_EXEC = 'on'; });

  test('no approval is the card\'s Start tap', async () => {
    await POST(req({ action: 'run', request: {}, token: 't' }));
    expect((enqueueEditJob as jest.Mock).mock.calls[0][1]).toMatchObject({ userId: 'user-1', approval: { channel: 'tap' } });
  });

  test('a voice yes reaches the executor with the user\'s words', async () => {
    await POST(req({ action: 'run', request: {}, token: 't', approval: { channel: 'voice-transcript', said: 'კი, დაიწყე' } }));
    expect((enqueueEditJob as jest.Mock).mock.calls[0][1].approval).toEqual({ channel: 'voice-transcript', said: 'კი, დაიწყე' });
  });

  test('words that are not a clear yes start nothing, and the refusal is audited', async () => {
    const res = await POST(req({ action: 'run', request: {}, token: 't', approval: { channel: 'voice-transcript', said: 'wait' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: 'approval_unclear' });
    expect(enqueueEditJob).not.toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith({ userId: 'user-1', op: 'media_edit', phase: 'run', outcome: 'refused', detail: 'approval_unclear' });
    expect((await POST(req({ action: 'run', request: {}, token: 't', approval: { channel: 'model' } }))).status).toBe(400);
    expect(enqueueEditJob).not.toHaveBeenCalled();
  });
});
