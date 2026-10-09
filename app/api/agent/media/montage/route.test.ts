/** @jest-environment node */
/**
 * /api/agent/media/montage over HTTP: closed (404, before the session is read) unless AGENT_G_MEDIA_EXEC opens it,
 * `admin` lets only admins in, signed-out callers get 401; the user id always comes from the session, never the body;
 * the executor's refusals map to HTTP statuses. The executor itself is tested in lib/agent/media/montageExec.test.ts.
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
jest.mock('../../../../../lib/agent/media/montageLive', () => ({ liveMontageDeps: () => ({}) }));
jest.mock('../../../../../lib/agent/media/montageExec', () => ({
  quoteMontage: jest.fn(async (_d: unknown, input: { userId: string }) => ({ ok: true, quote: { jobId: 'j1' }, request: {}, token: 't', who: input.userId })),
  runMontageJob: jest.fn(async () => ({ ok: false, error: 'quote_expired', message: 'expired' })),
  cancelMontageJob: jest.fn(async () => ({ ok: false, error: 'not_found', message: 'No such edit.' })),
}));

import { NextRequest } from 'next/server';
import { authedClientFromRequest } from '../../../../../lib/supabase/server';
import { quoteMontage } from '../../../../../lib/agent/media/montageExec';
import { GET, POST } from './route';

const ENV = { ...process.env };
const req = (body?: unknown) =>
  new NextRequest('https://myavatar.ge/api/agent/media/montage', {
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
});
afterAll(() => {
  process.env = ENV;
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
