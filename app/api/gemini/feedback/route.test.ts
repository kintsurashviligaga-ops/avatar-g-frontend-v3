/** @jest-environment node */
/**
 * POST /api/gemini/feedback — the rater is the SESSION user, never a body `userId`; a guest writes nothing; a
 * row owned by another account is not overwritten; supabase `{ error }` returns are not reported as success.
 * The session, rate limiter and service-role client are mocked — no network.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
let existing: { user_id: string | null } | null = null;
let readError: { message: string } | null = null;
let writeError: { message: string } | null = null;
const upsert = jest.fn(async () => ({ error: writeError }));
const maybeSingle = jest.fn(async () => ({ data: existing, error: readError }));
const from = jest.fn(() => ({
  select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle })) })),
  upsert,
}));
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: mockUser })),
  createServiceRoleClient: jest.fn(() => ({ from })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { READ: {} } }));

import { NextRequest } from 'next/server';
import { POST } from './route';

const USER = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
const ENV = { ...process.env };

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/gemini/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: USER };
  existing = null;
  readError = null;
  writeError = null;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

test('a guest is refused (401) and nothing is written — even with a body userId', async () => {
  mockUser = null;
  const res = await POST(post({ messageId: 'msg-1', rating: 1, userId: OTHER }));
  expect(res.status).toBe(401);
  expect(from).not.toHaveBeenCalled();
});

test('a signed-in rating is stored under the SESSION user; a body userId is ignored', async () => {
  const res = await POST(post({ messageId: 'msg-1', rating: -1, userId: OTHER }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(upsert).toHaveBeenCalledWith({ message_id: 'msg-1', rating: -1, user_id: USER }, { onConflict: 'message_id' });
});

test('re-rating your own message updates it', async () => {
  existing = { user_id: USER };
  const res = await POST(post({ messageId: 'msg-1', rating: 1 }));
  expect(res.status).toBe(200);
  expect(upsert).toHaveBeenCalledTimes(1);
});

test("another account's rating (or an ownerless legacy row) is not overwritten", async () => {
  existing = { user_id: OTHER };
  expect((await POST(post({ messageId: 'msg-1', rating: 1 }))).status).toBe(409);
  existing = { user_id: null };
  expect((await POST(post({ messageId: 'msg-1', rating: 1 }))).status).toBe(409);
  expect(upsert).not.toHaveBeenCalled();
});

test('a supabase { error } return (e.g. the table is missing) is a 500, not a silent ok — and the DB text is not echoed', async () => {
  readError = { message: 'relation "gemini_message_feedback" does not exist' };
  const res = await POST(post({ messageId: 'msg-1', rating: 1 }));
  expect(res.status).toBe(500);
  expect(JSON.stringify(await res.json())).not.toContain('relation');

  readError = null;
  writeError = { message: 'permission denied' };
  expect((await POST(post({ messageId: 'msg-1', rating: 1 }))).status).toBe(500);
});

test('invalid input is a 400', async () => {
  expect((await POST(post({ messageId: 'msg-1', rating: 5 }))).status).toBe(400);
  expect((await POST(post({ messageId: '../../etc', rating: 1 }))).status).toBe(400);
  expect((await POST(post({ rating: 1 }))).status).toBe(400);
  expect(from).not.toHaveBeenCalled();
});
