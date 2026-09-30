/** @jest-environment node */
/**
 * POST /api/ai/magic-wand — signed-in only, thinking off, budget-gated, fail-soft (the user keeps their text).
 * Gemini, the session, the rate limiter and the budget are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
const mockCapByKey = jest.fn(async (_id: string, _cfg: unknown): Promise<unknown> => null);
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: (id: string, cfg: unknown) => mockCapByKey(id, cfg),
  RATE_LIMITS: { WRITE: {}, HELPER_USER: { keyPrefix: 'rl:helper:user' } },
}));
const mockGemini = jest.fn();
jest.mock('../../../../lib/gemini/client', () => ({ generateWithGemini: (...a: unknown[]) => mockGemini(...a) }));
const mockAllows = jest.fn(async () => true);
const mockBook = jest.fn(async () => undefined);
jest.mock('../../../../lib/services/billing/chatBudget', () => ({
  chatBudgetAllows: (...a: unknown[]) => (mockAllows as (...x: unknown[]) => Promise<boolean>)(...a),
  bookChatUsage: (...a: unknown[]) => (mockBook as (...x: unknown[]) => Promise<void>)(...a),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

const USER = '11111111-2222-4333-8444-555555555555';
const ENV = { ...process.env };

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/ai/magic-wand', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: USER };
  mockAllows.mockResolvedValue(true);
  delete process.env.FILM_ALLOW_ANONYMOUS;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

test('a guest gets the canonical 401 body (no `enhanced`, so the composer keeps its text) and no Gemini call', async () => {
  mockUser = null;
  const res = await POST(post({ prompt: 'a cat in Tbilisi' }));
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body).toEqual(expect.objectContaining({ success: false, error: 'auth_required', authRequired: true }));
  expect(body.enhanced).toBeUndefined();
  expect(mockGemini).not.toHaveBeenCalled();
});

test('FILM_ALLOW_ANONYMOUS=1 re-opens it for a demo deployment (the single switch)', async () => {
  mockUser = null;
  process.env.FILM_ALLOW_ANONYMOUS = '1';
  mockGemini.mockResolvedValueOnce({ text: 'A cinematic cat', model: 'gemini-2.5-flash', tier: 'flash' });
  const res = await POST(post({ prompt: 'a cat' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ enhanced: 'A cinematic cat' });
});

test('signed in: thinking off, request-level timeout, usage booked for the user', async () => {
  mockGemini.mockResolvedValueOnce({ text: '  A golden-hour cat on a Tbilisi balcony  ', model: 'gemini-2.5-flash', tier: 'flash', tokensIn: 90, tokensOut: 30 });
  const res = await POST(post({ prompt: 'a cat in Tbilisi' }));
  expect(await res.json()).toEqual({ enhanced: 'A golden-hour cat on a Tbilisi balcony' });
  const req = mockGemini.mock.calls[0][0];
  expect(req).toMatchObject({ thinkingBudget: 0, tier: 'flash', timeoutMs: 25_000 });
  expect(mockBook).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-2.5-flash', inputTokens: 90, outputTokens: 30, userId: USER }));
});

test('the per-account daily cap is keyed on the verified uid and refuses before Gemini', async () => {
  const { NextResponse } = await import('next/server');
  mockCapByKey.mockResolvedValueOnce(NextResponse.json({ error: 'rate_limited' }, { status: 429 }));
  const res = await POST(post({ prompt: 'a cat' }));
  expect(res.status).toBe(429);
  expect(mockCapByKey).toHaveBeenCalledWith(USER, expect.objectContaining({ keyPrefix: 'rl:helper:user' }));
  expect(mockGemini).not.toHaveBeenCalled();
});

test('fail-soft: a Gemini error, an empty reply and a budget refusal all return the original prompt', async () => {
  mockGemini.mockRejectedValueOnce(new Error('Gemini API error 402'));
  expect(await (await POST(post({ prompt: 'idea one' }))).json()).toEqual({ enhanced: 'idea one' });

  mockGemini.mockResolvedValueOnce({ text: '   ', model: 'gemini-2.5-flash', tier: 'flash' });
  expect(await (await POST(post({ prompt: 'idea two' }))).json()).toEqual({ enhanced: 'idea two' });

  mockAllows.mockResolvedValueOnce(false);
  expect(await (await POST(post({ prompt: 'idea three' }))).json()).toEqual({ enhanced: 'idea three', reason: 'budget_exhausted' });
  expect(mockGemini).toHaveBeenCalledTimes(2);
});

test('an empty prompt is a 400', async () => {
  const res = await POST(post({ prompt: '  ' }));
  expect(res.status).toBe(400);
  expect(mockGemini).not.toHaveBeenCalled();
});
