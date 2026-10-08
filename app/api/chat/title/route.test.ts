/** @jest-environment node */
/**
 * POST /api/chat/title — signed-in only, thinking OFF with a sane token cap (the old 24-token cap was eaten by
 * the flash tier's default thinking → empty titles), booked for the user. Gemini, the guard, the session and
 * the budget are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockGuardUser: { userId: string } | null = null;
let mockBearerUser: { id: string } | null = null;
jest.mock('../../../../lib/api/guard', () => ({
  applyApiGuards: jest.fn(async () => ({ response: null, auth: mockGuardUser, budgetRemaining: null })),
}));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockBearerUser })) }));
// ⚠️ Mocked even though applyApiGuards is: the real module starts an un-unref'd cleanup setInterval at import, and
// that open handle keeps jest from exiting after the suite passes.
const mockCapByKey = jest.fn(async (_id: string, _cfg: unknown): Promise<unknown> => null);
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimitByKey: (id: string, cfg: unknown) => mockCapByKey(id, cfg),
  RATE_LIMITS: { READ: {}, HELPER_USER: { keyPrefix: 'rl:helper:user' } },
}));
const mockGemini = jest.fn();
jest.mock('../../../../lib/gemini/client', () => ({ generateWithGemini: (...a: unknown[]) => mockGemini(...a) }));
// "Configured" is the Google transport's answer (lib/ai/google/transport googleAiConfigured): on the default Developer API
// transport that is the canonical GEMINI_API_KEY, set per test below — never a deprecated alias.
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
  new NextRequest('https://myavatar.ge/api/chat/title', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockGuardUser = { userId: USER };
  mockBearerUser = null;
  delete process.env.GEMINI_TRANSPORT;
  process.env.GEMINI_API_KEY = 'test-key';
  mockAllows.mockResolvedValue(true);
  delete process.env.FILM_ALLOW_ANONYMOUS;
});
afterEach(() => {
  process.env = { ...ENV };
});

test('a guest gets the canonical 401 body and Gemini is never called', async () => {
  mockGuardUser = null;
  const res = await POST(post({ prompt: 'გამარჯობა, მინდა ვიდეო', locale: 'ka' }));
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual(expect.objectContaining({ success: false, error: 'auth_required', authRequired: true }));
  expect(mockGemini).not.toHaveBeenCalled();
  expect(mockAllows).not.toHaveBeenCalled();
});

test('signed in: thinking off, a token cap with room for a title, and a clean one-line title', async () => {
  mockGemini.mockResolvedValueOnce({ text: '"Tbilisi Travel Video"\nsecond line', model: 'gemini-2.5-flash', tier: 'flash', tokensIn: 40, tokensOut: 5 });
  const res = await POST(post({ prompt: 'make a travel video about Tbilisi', locale: 'en' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ title: 'Tbilisi Travel Video' });

  const req = mockGemini.mock.calls[0][0];
  expect(req.thinkingBudget).toBe(0);
  expect(req.maxTokens).toBeGreaterThanOrEqual(64);
  expect(req.tier).toBe('flash');
  expect(mockBook).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-2.5-flash', inputTokens: 40, outputTokens: 5, userId: USER }));
});

test('a bearer-token session (no cookie) is accepted too', async () => {
  mockGuardUser = null;
  mockBearerUser = { id: USER };
  mockGemini.mockResolvedValueOnce({ text: 'ვიდეო თბილისზე', model: 'gemini-2.5-flash', tier: 'flash' });
  const res = await POST(post({ prompt: 'ვიდეო თბილისზე', locale: 'ka' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ title: 'ვიდეო თბილისზე' });
});

test('best-effort: a Gemini failure answers 200 with an empty title', async () => {
  mockGemini.mockRejectedValueOnce(new Error('Gemini API error 429'));
  const res = await POST(post({ prompt: 'hello there', locale: 'en' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ title: '' });
});

test('budget refusal and a missing key never call Gemini', async () => {
  mockAllows.mockResolvedValueOnce(false);
  expect(await (await POST(post({ prompt: 'x', locale: 'en' }))).json()).toEqual({ title: null, reason: 'budget_exhausted' });
  delete process.env.GEMINI_API_KEY;
  // A deprecated alias is not a key (MyAvatar v32): the title stays empty and Gemini is not called.
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'legacy-alias';
  expect(await (await POST(post({ prompt: 'x', locale: 'en' }))).json()).toEqual({ title: '' });
  expect(mockGemini).not.toHaveBeenCalled();
});
