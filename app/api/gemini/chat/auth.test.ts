/** @jest-environment node */
/**
 * POST /api/gemini/chat — signed in only, and the persisted owner is the SESSION, never the body.
 *
 * ⚠️ This route trusted `body.userId` and wrote gemini_chat_sessions / gemini_chat_messages with the SERVICE-ROLE key
 * (RLS bypassed) — any caller could plant rows under any account — and it answered anonymous callers on the Gemini
 * balance (Pro tier with attachments). Pinned here:
 *   · a guest → 401 before Gemini;
 *   · a signed-in caller who sends someone else's `userId` is persisted as THEMSELVES;
 *   · a sessionId that already belongs to another account is not taken over (no upsert, no insert).
 * Gemini and the Supabase client are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
let mockCapped = false;
let mockBudgetOk = true;
jest.mock('../../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: {
    WRITE: { maxRequests: 20, windowMs: 60_000, keyPrefix: 'rl:write' },
    CHAT_USER: { maxRequests: 500, windowMs: 86_400_000, keyPrefix: 'rl:chat:user' },
  },
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: jest.fn(async () => (mockCapped ? new Response('{"error":"Too many requests"}', { status: 429 }) : null)),
}));
jest.mock('../../../../lib/services/billing/chatBudget', () => ({
  chatBudgetAllows: jest.fn(async () => mockBudgetOk),
  bookChatUsage: jest.fn(async () => undefined),
}));
jest.mock('../../../../lib/gemini/client', () => ({
  generateWithGemini: jest.fn(async () => ({ text: 'გამარჯობა!', model: 'gemini-2.5-flash', tokensIn: 3, tokensOut: 2 })),
}));

// The route's service-role client, recorded call by call.
let existingOwner: string | null = null;
const upsert = jest.fn(async () => ({ error: null }));
const insert = jest.fn(async () => ({ error: null }));
const maybeSingle = jest.fn(async () => ({ data: existingOwner ? { user_id: existingOwner } : null, error: null }));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle })) })),
      upsert,
      insert,
    })),
  })),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateWithGemini } from '../../../../lib/gemini/client';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/gemini/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  existingOwner = null;
  mockCapped = false;
  mockBudgetOk = true;
  delete process.env.FILM_ALLOW_ANONYMOUS;
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

test('a guest is refused (401 auth_required) before Gemini is called or anything is written', async () => {
  const res = await POST(post({ message: 'hi', userId: 'victim-user' }));
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ error: 'auth_required', authRequired: true });
  expect(generateWithGemini).not.toHaveBeenCalled();
  expect(upsert).not.toHaveBeenCalled();
  expect(insert).not.toHaveBeenCalled();
});

test('a signed-in caller is persisted as the session user — a body userId is ignored', async () => {
  mockUser = { id: 'user-1' };
  const res = await POST(post({ message: 'hi', sessionId: 'sess-1', userId: 'victim-user' }));
  expect(res.status).toBe(200);
  expect(generateWithGemini).toHaveBeenCalledTimes(1);
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'sess-1', user_id: 'user-1' }), { onConflict: 'id' });
  const rows = (insert.mock.calls[0] as unknown as [Array<{ user_id: string }>])[0];
  expect(rows.map((r) => r.user_id)).toEqual(['user-1', 'user-1']);
  expect(JSON.stringify([upsert.mock.calls, insert.mock.calls])).not.toContain('victim-user');
});

test("another account's sessionId is not taken over: the reply is returned, nothing is written", async () => {
  mockUser = { id: 'user-1' };
  existingOwner = 'victim-user';
  const res = await POST(post({ message: 'hi', sessionId: 'victims-session' }));
  expect(res.status).toBe(200);
  expect((await res.json()).text).toBe('გამარჯობა!');
  expect(upsert).not.toHaveBeenCalled();
  expect(insert).not.toHaveBeenCalled();
});

test('a signed-in caller is capped per ACCOUNT (CHAT_USER) — a spent allowance answers 429 before Gemini', async () => {
  mockUser = { id: 'user-1' };
  mockCapped = true;
  const res = await POST(post({ message: 'hello', locale: 'en' }));
  expect(res.status).toBe(429);
  expect(generateWithGemini).not.toHaveBeenCalled();
});

test('the platform budget gate refuses before Gemini, and an over-long message is refused too', async () => {
  mockUser = { id: 'user-1' };
  mockBudgetOk = false;
  expect((await POST(post({ message: 'hello', locale: 'en' }))).status).toBe(503);
  mockBudgetOk = true;
  expect((await POST(post({ message: 'x'.repeat(16_001), locale: 'en' }))).status).toBe(413);
  expect(generateWithGemini).not.toHaveBeenCalled();
});

test("a Gemini failure never reaches the caller as the provider's raw text", async () => {
  mockUser = { id: 'user-1' };
  (generateWithGemini as jest.Mock).mockRejectedValueOnce(new Error('Gemini 429: {"error":{"message":"Quota exceeded for key AQ.secret"}}'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const res = await POST(post({ message: 'hello', locale: 'en' }));
  expect(JSON.stringify(await res.json())).not.toMatch(/Quota exceeded|AQ\.secret|Gemini 429/);
});
