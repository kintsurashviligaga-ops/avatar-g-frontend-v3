/** @jest-environment node */
/**
 * /api/agent/media/audio over HTTP: closed (404, before the session is read) unless AGENT_G_MEDIA_EXEC opens it,
 * `admin` lets only admins in, signed-out callers get 401; the user id always comes from the session, never the body;
 * a refused source is a 422 that names the platform; the extraction runs in a worker after the answer. The executor
 * is tested in lib/agent/media/audioExtract.test.ts and audioWorker.test.ts.
 */
jest.mock('server-only', () => ({}));

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
jest.mock('../../../../../lib/agent/media/audioLive', () => ({ liveAudioDeps: () => ({}) }));
jest.mock('../../../../../lib/agent/media/audioExtract', () => ({
  quoteAudioExtract: jest.fn(async (_d: unknown, input: { userId: string }) => ({ ok: true, quote: { jobId: 'j1' }, request: {}, token: 't', who: input.userId })),
  enqueueAudioJob: jest.fn(async () => ({ ok: false, error: 'quote_expired', message: 'expired' })),
  audioJobStatus: jest.fn(async () => ({ ok: false, error: 'not_found', message: 'No such job.' })),
  cancelAudioJob: jest.fn(async () => ({ ok: false, error: 'not_found', message: 'No such job.' })),
}));
jest.mock('../../../../../lib/agent/media/audioWorker', () => ({ workAudioJob: jest.fn(async () => ({ ran: true, outcome: 'delivered', audioUrl: 'x' })) }));

import { NextRequest } from 'next/server';
import { authedClientFromRequest } from '../../../../../lib/supabase/server';
import { audioJobStatus, enqueueAudioJob, quoteAudioExtract } from '../../../../../lib/agent/media/audioExtract';
import { workAudioJob } from '../../../../../lib/agent/media/audioWorker';
import { GET, POST } from './route';

const ENV = { ...process.env };
const CTX = Symbol.for('@vercel/request-context');
let waitUntil: jest.Mock;
const req = (body?: unknown, query = '') =>
  new NextRequest(`https://myavatar.ge/api/agent/media/audio${query}`, {
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
  expect((await POST(req({ action: 'quote', url: 'https://example.com/a.mp4' }))).status).toBe(404);
  expect((await GET(req(undefined, '?jobId=j1'))).status).toBe(404);
  expect(authedClientFromRequest).not.toHaveBeenCalled();
  expect(await (await GET(req())).json()).toEqual({ enabled: false });
});

test('admin: admins only; signed out is 401; Production with the flag unset is closed', async () => {
  process.env.AGENT_G_MEDIA_EXEC = 'admin';
  expect(await (await GET(req())).json()).toEqual({ enabled: true });
  mockUser = { id: 'user-2', email: 'someone@example.com' };
  expect((await POST(req({ action: 'quote', url: 'https://example.com/a.mp4' }))).status).toBe(404);
  mockUser = null;
  expect((await POST(req({ action: 'quote', url: 'https://example.com/a.mp4' }))).status).toBe(401);
  delete process.env.AGENT_G_MEDIA_EXEC;
  process.env.VERCEL_ENV = 'production';
  mockUser = { id: 'user-1', email: 'admin@example.com' };
  expect((await POST(req({ action: 'quote', url: 'https://example.com/a.mp4' }))).status).toBe(404);
});

test('the user id is the session, not the body; a platform refusal is a 422 naming the platform', async () => {
  process.env.AGENT_G_MEDIA_EXEC = 'on';
  expect((await POST(req({ action: 'quote', url: 'https://example.com/a.mp4', userId: 'someone-else' }))).status).toBe(200);
  expect((quoteAudioExtract as jest.Mock).mock.calls[0][1]).toEqual({ userId: 'user-1', url: 'https://example.com/a.mp4', file: undefined, name: undefined });
  (quoteAudioExtract as jest.Mock).mockResolvedValueOnce({ ok: false, error: 'platform', platform: 'YouTube', message: 'm' });
  const yt = await POST(req({ action: 'quote', url: 'https://youtu.be/x' }));
  expect(yt.status).toBe(422);
  expect(await yt.json()).toMatchObject({ error: 'platform', platform: 'YouTube' });
  (quoteAudioExtract as jest.Mock).mockResolvedValueOnce({ ok: false, error: 'too_large', message: 'm' });
  expect((await POST(req({ action: 'quote', url: 'https://example.com/big.mp4' }))).status).toBe(413);
  expect((await POST(req({ action: 'run', request: {}, token: 't' }))).status).toBe(409);
  expect((await POST(req({ action: 'cancel', jobId: 'j' }))).status).toBe(404);
  expect((await POST(req({ action: 'nope' }))).status).toBe(400);
});

describe('the extraction runs in a worker after the answer, never in the request', () => {
  beforeEach(() => { process.env.AGENT_G_MEDIA_EXEC = 'on'; });

  test('run answers "queued" at once and hands the job to a worker after the response', async () => {
    (enqueueAudioJob as jest.Mock).mockResolvedValueOnce({ ok: true, jobId: 'j9', status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false });
    (workAudioJob as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
    const res = await POST(req({ action: 'run', request: {}, token: 't' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, jobId: 'j9', status: 'queued' });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect((workAudioJob as jest.Mock).mock.calls[0][1]).toEqual({ jobId: 'j9', worker: 'w-1' });
  });

  test('a replay of a delivered job starts nothing', async () => {
    (enqueueAudioJob as jest.Mock).mockResolvedValueOnce({ ok: true, jobId: 'j9', status: 'completed', audioUrl: 'a', name: 'a.mp3', durationSec: 5, bytes: 9, bitrateKbps: 192, rights: null, replay: true });
    expect((await POST(req({ action: 'run', request: {}, token: 't' }))).status).toBe(200);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  test("the owner's status read: the view, and a worker only when the job has none", async () => {
    (audioJobStatus as jest.Mock).mockResolvedValueOnce({ view: { ok: true, jobId: 'j9', status: 'running', stage: 'extract', pct: 10, attempt: 1 }, needsWorker: false });
    expect(await (await GET(req(undefined, '?jobId=j9'))).json()).toMatchObject({ status: 'running', stage: 'extract' });
    expect((audioJobStatus as jest.Mock).mock.calls[0][1]).toEqual({ userId: 'user-1', jobId: 'j9' });
    expect(waitUntil).not.toHaveBeenCalled();
    (audioJobStatus as jest.Mock).mockResolvedValueOnce({ view: { ok: true, jobId: 'j9', status: 'queued', stage: 'queued', pct: 0, attempt: 0 }, needsWorker: true });
    await GET(req(undefined, '?jobId=j9'));
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
});
