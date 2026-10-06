/** @jest-environment node */
/**
 * POST /api/chat/stream — the widgets' streaming chat follows the product chat's rules: sign-in, the per-account
 * daily allowance, Google only by default, and no provider wording in the browser. Every provider, the session,
 * the limiter and the budget are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockAuth: { userId: string } | null = null;
jest.mock('../../../../lib/security/apiGuard', () => ({
  getAuthContext: jest.fn(async () => mockAuth),
  checkDailyBudget: jest.fn(() => ({ allowed: true, limit: 1000 })),
  sanitizePrompt: (s: string) => s,
}));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: null })) }));
const mockCapByKey = jest.fn(async (_id: string, _cfg: unknown): Promise<unknown> => null);
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: (id: string, cfg: unknown) => mockCapByKey(id, cfg),
  RATE_LIMITS: { READ: {}, CHAT_USER: { keyPrefix: 'rl:chat:user' } },
}));
const mockBook = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('../../../../lib/services/billing/chatBudget', () => ({
  chatBudgetAllows: jest.fn(async () => true),
  bookChatUsage: (...a: unknown[]) => mockBook(...a),
  BUDGET_EXHAUSTED_MESSAGE: 'budget',
}));
type Frame = { text?: string };
const mockGemini = jest.fn();
jest.mock('../../../../lib/ai/google/chatStream', () => ({
  streamGeminiChat: (i: unknown) => mockGemini(i),
  unbookedAttempts: jest.requireActual('../../../../lib/ai/google/chatStream').unbookedAttempts,
}));
jest.mock('../../../../lib/orchestrator/gemini-guard', () => ({ resolveGeminiKey: () => 'test-key' }));
const mockAnthropic = jest.fn();
jest.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => (id: string) => mockAnthropic(id) }));
jest.mock('ai', () => ({
  streamText: () => ({ textStream: (async function* gen() { yield 'claude says hi'; })() }),
}));
jest.mock('../../../../lib/chat/providerRouter', () => ({ orchestrate: jest.fn(), pollOrchestrationTask: jest.fn() }));
jest.mock('../../../../lib/agent-g-orchestrator', () => ({ AGENT_G_SYSTEM_PROMPT: 'SYSTEM' }));

import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';

const USER = '11111111-2222-4333-8444-555555555555';
const ENV = { ...process.env };

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/chat/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept-language': 'en-US' },
    body: JSON.stringify(body),
  });
const turn = { messages: [{ role: 'user', content: 'hello' }] };
const events = async (res: Response) =>
  (await res.text()).split('\n\n').filter(Boolean).map((l) => JSON.parse(l.replace(/^data: /, '')) as Record<string, unknown>);

const ok = (text: string) => async (input: { onFrame: (f: Frame) => void }) => {
  input.onFrame({ text });
  return { ok: true, model: 'gemini-3.8-flash', text, sources: [], attempts: [], usage: { inputTokens: 10, outputTokens: 5 } };
};
const failed = async () => ({
  ok: false, model: 'gemini-3.8-flash', text: '', sources: [], attempts: [],
  error: { code: 'quota', retryable: false, message: 'RESOURCE_EXHAUSTED: prepayment credits are depleted' },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { userId: USER };
  delete process.env.FILM_ALLOW_ANONYMOUS;
  delete process.env.AI_GOOGLE_ONLY;
  process.env.ANTHROPIC_API_KEY = 'anthropic-test';
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

test('a guest is refused with the canonical 401 body before any provider is called', async () => {
  mockAuth = null;
  const res = await POST(post(turn));
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ authRequired: true, error: 'auth_required' });
  expect(mockGemini).not.toHaveBeenCalled();
});

test('the per-account daily allowance (CHAT_USER, keyed on the verified uid) refuses before Gemini', async () => {
  mockCapByKey.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
  const res = await POST(post(turn));
  expect(res.status).toBe(429);
  expect(mockCapByKey).toHaveBeenCalledWith(USER, expect.objectContaining({ keyPrefix: 'rl:chat:user' }));
  expect(mockGemini).not.toHaveBeenCalled();
});

test('signed in: tokens stream from the product Gemini chain and the usage is booked for the user', async () => {
  mockGemini.mockImplementationOnce(ok('Hi there'));
  const ev = await events(await POST(post(turn)));
  expect(ev).toEqual(expect.arrayContaining([{ token: 'Hi there' }, expect.objectContaining({ done: true, provider: 'gemini', model: 'gemini-3.8-flash' })]));
  expect(mockBook).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.8-flash', userId: USER }));
});

test('Google-only (the default): a Gemini failure never falls to Anthropic, and the browser gets no provider wording', async () => {
  mockGemini.mockImplementationOnce(failed);
  const body = await (await POST(post(turn))).text();
  expect(mockAnthropic).not.toHaveBeenCalled();
  expect(body).not.toMatch(/RESOURCE_EXHAUSTED|prepayment|quota/);
  expect(body).toContain('temporarily unavailable');
});

test('AI_GOOGLE_ONLY=0 cannot restore the Anthropic leg', async () => {
  process.env.AI_GOOGLE_ONLY = '0';
  mockGemini.mockImplementationOnce(failed);
  const body = await (await POST(post(turn))).text();
  expect(mockAnthropic).not.toHaveBeenCalled();
  expect(body).toContain('temporarily unavailable');
});
