/** @jest-environment node */
/**
 * /api/agent/sandbox/run over HTTP: closed (404 before the session is read) unless AGENT_G_SANDBOX opens it; `admin`
 * lets only admins in; signed-out callers get 401; the user id comes from the session, never the body; a run is
 * behind the per-account daily ceiling. The rules of the quote and the run are tested in lib/agent/sandbox/codeQuote.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string; email?: string } | null = null;
jest.mock('../../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: mockUser })),
}));
const mockDaily = jest.fn(async (): Promise<Response | null> => null);
jest.mock('../../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: (...a: unknown[]) => (mockDaily as (...x: unknown[]) => Promise<Response | null>)(...a),
  RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 }, CODE_RUN_USER: { maxRequests: 50, windowMs: 86_400_000 } },
}));
jest.mock('../../../../../lib/admin/guard', () => ({ isAdminUser: (u: { email?: string } | null) => u?.email === 'admin@example.com' }));
jest.mock('../../../../../lib/agent/sandbox', () => ({ liveCodeDeps: async () => ({}) }));
jest.mock('../../../../../lib/agent/sandbox/codeQuote', () => ({
  quoteCodeRun: jest.fn((_d: unknown, input: { userId: string }) => ({ ok: true, quote: { jobId: 'c1' }, request: {}, token: 't', who: input.userId })),
  runCodeQuote: jest.fn(async () => ({ ok: false, error: 'quote_used', message: 'This plan already ran.' })),
}));

import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '../../../../../lib/supabase/server';
import { quoteCodeRun, runCodeQuote } from '../../../../../lib/agent/sandbox/codeQuote';
import { GET, POST } from './route';

const ENV = { ...process.env };
const req = (body?: unknown) => new NextRequest('http://localhost/api/agent/sandbox/run', body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV };
  delete process.env.AGENT_G_SANDBOX;
  mockUser = { id: 'u-1', email: 'admin@example.com' };
});
afterAll(() => { process.env = ENV; });

test('closed by default, a Preview included: 404 before the session is read, and GET says not enabled', async () => {
  process.env.VERCEL_ENV = 'preview';
  expect((await POST(req({ action: 'quote' }))).status).toBe(404);
  expect(authedClientFromRequest).not.toHaveBeenCalled();
  expect(await (await GET(req())).json()).toEqual({ enabled: false });
});

test('admin: an admin is in, anyone else gets 404, a guest 401', async () => {
  process.env.AGENT_G_SANDBOX = 'admin';
  expect(await (await GET(req())).json()).toEqual({ enabled: true });
  mockUser = { id: 'u-2', email: 'someone@example.com' };
  expect((await POST(req({ action: 'quote' }))).status).toBe(404);
  mockUser = null;
  expect((await POST(req({ action: 'quote' }))).status).toBe(401);
});

test('the quote is made for the session user, whatever the body says', async () => {
  process.env.AGENT_G_SANDBOX = 'admin';
  const res = await POST(req({ action: 'quote', userId: 'evil', request: { language: 'python', code: 'print(1)' } }));
  expect(res.status).toBe(200);
  expect(quoteCodeRun).toHaveBeenCalledWith({}, { userId: 'u-1', request: { language: 'python', code: 'print(1)' } });
});

test('a run is behind the daily ceiling, and a used quote is a 409', async () => {
  process.env.AGENT_G_SANDBOX = 'on';
  const res = await POST(req({ action: 'run', request: {}, token: 't' }));
  expect(res.status).toBe(409);
  expect(mockDaily).toHaveBeenCalledWith('u-1', { maxRequests: 50, windowMs: 86_400_000 });
  mockDaily.mockResolvedValueOnce(NextResponse.json({ error: 'rate_limited' }, { status: 429 }));
  expect((await POST(req({ action: 'run', request: {}, token: 't' }))).status).toBe(429);
  expect(runCodeQuote).toHaveBeenCalledTimes(1);
});

test('an unknown action is a 400', async () => {
  process.env.AGENT_G_SANDBOX = 'on';
  expect((await POST(req({ action: 'delete' }))).status).toBe(400);
});
