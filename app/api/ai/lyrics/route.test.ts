/** @jest-environment node */
/**
 * POST /api/ai/lyrics — signed-in only, per-IP + per-account capped, budget-gated, every completed call booked.
 * Gemini, the session, the rate limiter and the budget are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
const mockCapByIp = jest.fn(async (_req: unknown, _cfg: unknown): Promise<unknown> => null);
const mockCapByKey = jest.fn(async (_id: string, _cfg: unknown): Promise<unknown> => null);
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: (req: unknown, cfg: unknown) => mockCapByIp(req, cfg),
  checkRateLimitByKey: (id: string, cfg: unknown) => mockCapByKey(id, cfg),
  RATE_LIMITS: { WRITE: { keyPrefix: 'rl:write' }, HELPER_USER: { keyPrefix: 'rl:helper:user' } },
}));
const mockGemini = jest.fn();
jest.mock('../../../../lib/gemini/client', () => ({ generateWithGemini: (...a: unknown[]) => mockGemini(...a) }));
const mockAllows = jest.fn(async () => true);
const mockBook = jest.fn(async () => undefined);
jest.mock('../../../../lib/services/billing/chatBudget', () => ({
  chatBudgetAllows: (...a: unknown[]) => (mockAllows as (...x: unknown[]) => Promise<boolean>)(...a),
  bookChatUsage: (...a: unknown[]) => (mockBook as (...x: unknown[]) => Promise<void>)(...a),
}));

import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';

const USER = '11111111-2222-4333-8444-555555555555';
const ENV = { ...process.env };

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/ai/lyrics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: USER };
  mockAllows.mockResolvedValue(true);
  delete process.env.FILM_ALLOW_ANONYMOUS;
});
afterEach(() => {
  process.env = { ...ENV };
});

test('a guest gets 401 and no Gemini call', async () => {
  mockUser = null;
  const res = await POST(post({ theme: 'Tbilisi rain' }));
  expect(res.status).toBe(401);
  expect(mockGemini).not.toHaveBeenCalled();
});

test('the per-IP limit refuses before anything else', async () => {
  mockCapByIp.mockResolvedValueOnce(NextResponse.json({ error: 'rate_limited' }, { status: 429 }));
  const res = await POST(post({ theme: 'Tbilisi rain' }));
  expect(res.status).toBe(429);
  expect(mockGemini).not.toHaveBeenCalled();
});

test('the per-account daily cap is keyed on the verified uid and refuses before Gemini', async () => {
  mockCapByKey.mockResolvedValueOnce(NextResponse.json({ error: 'rate_limited' }, { status: 429 }));
  const res = await POST(post({ theme: 'Tbilisi rain' }));
  expect(res.status).toBe(429);
  expect(mockCapByKey).toHaveBeenCalledWith(USER, expect.objectContaining({ keyPrefix: 'rl:helper:user' }));
  expect(mockGemini).not.toHaveBeenCalled();
});

test('an exhausted platform budget refuses before the first call', async () => {
  mockAllows.mockResolvedValueOnce(false);
  const res = await POST(post({ theme: 'Tbilisi rain' }));
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ success: false, error: 'budget_exhausted' });
  expect(mockGemini).not.toHaveBeenCalled();
});

test('a good first take returns lyrics, runs Flash with thinking off, and books the usage for the user', async () => {
  mockGemini.mockResolvedValueOnce({ text: 'Rain on Rustaveli\nlights in the puddles', model: 'gemini-2.5-flash', tier: 'flash', tokensIn: 120, tokensOut: 40 });
  const res = await POST(post({ theme: 'Tbilisi rain', language: 'en' }));
  expect(await res.json()).toEqual({ success: true, lyrics: 'Rain on Rustaveli\nlights in the puddles' });
  expect(mockGemini).toHaveBeenCalledTimes(1);
  expect(mockGemini.mock.calls[0][0]).toMatchObject({ tier: 'flash', thinkingBudget: 0 });
  expect(mockBook).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-2.5-flash', inputTokens: 120, outputTokens: 40, userId: USER }));
});

test('an empty take is still booked before the retry', async () => {
  mockGemini
    .mockResolvedValueOnce({ text: '', model: 'gemini-2.5-flash', tier: 'flash', tokensIn: 100, tokensOut: 0 })
    .mockResolvedValueOnce({ text: 'Second take', model: 'gemini-2.5-flash', tier: 'flash', tokensIn: 100, tokensOut: 10 });
  const res = await POST(post({ theme: 'Tbilisi rain' }));
  expect(await res.json()).toEqual({ success: true, lyrics: 'Second take' });
  expect(mockBook).toHaveBeenCalledTimes(2);
});
