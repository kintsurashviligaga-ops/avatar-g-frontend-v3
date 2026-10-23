/** @jest-environment node */
/**
 * POST /api/chat — the widgets' JSON chat follows the product chat's rules: sign-in, the per-account daily allowance,
 * Google only whatever the env says (no request reaches OpenAI or OpenRouter, and Anthropic is never called), no provider wording
 * in the response, and no account ever served another account's answer. Everything external is mocked.
 */
jest.mock('server-only', () => ({}));

let mockAuth: { userId: string } | null = null;
jest.mock('../../../lib/security/apiGuard', () => ({
  getAuthContext: jest.fn(async () => mockAuth),
  checkDailyBudget: jest.fn(() => ({ allowed: true, limit: 1000 })),
  sanitizePrompt: (s: string) => s,
}));
jest.mock('../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: null })) }));
const mockCapByKey = jest.fn(async (_id: string, _cfg: unknown): Promise<unknown> => null);
jest.mock('../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: (id: string, cfg: unknown) => mockCapByKey(id, cfg),
  RATE_LIMITS: { WRITE: {}, CHAT_USER: { keyPrefix: 'rl:chat:user' } },
}));
jest.mock('../../../lib/services/billing/chatBudget', () => ({
  chatBudgetAllows: jest.fn(async () => true),
  bookChatUsage: jest.fn(async () => undefined),
  BUDGET_EXHAUSTED_MESSAGE: 'budget',
}));
const mockGemini = jest.fn();
jest.mock('../../../lib/ai/google/chatStream', () => ({
  streamGeminiChat: (i: unknown) => mockGemini(i),
  unbookedAttempts: jest.requireActual('../../../lib/ai/google/chatStream').unbookedAttempts,
}));
jest.mock('../../../lib/orchestrator/gemini-guard', () => ({ resolveGeminiKey: () => 'test-key' }));
jest.mock('../../../lib/agents/agentRegistry', () => ({ getAllAgents: () => [] }));
jest.mock('../../../lib/agent-g-orchestrator', () => ({ agentGSystemPrompt: () => 'SYSTEM' }));
const mockAnthropicCall = jest.fn();
jest.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => (id: string) => ({ id }) }));
jest.mock('ai', () => ({ generateText: (...a: unknown[]) => mockAnthropicCall(...a) }));

import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';

const USER = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
const ENV = { ...process.env };

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const reply = (text: string) => ({ ok: true, model: 'gemini-3.8-flash', text, sources: [], attempts: [], usage: { inputTokens: 9, outputTokens: 3 } });
const failed = {
  ok: false, model: 'gemini-3.8-flash', text: '', sources: [], attempts: [],
  error: { code: 'quota', retryable: false, message: 'RESOURCE_EXHAUSTED: prepayment credits are depleted' },
};
const data = async (res: Response) => ((await res.json()) as { data?: Record<string, unknown> } & Record<string, unknown>);

let fetchSpy: jest.SpyInstance;
/** Requests that went to OpenAI or OpenRouter: the chat engine that called them is gone, so the network is the only way left. */
const vendorCalls = () => fetchSpy.mock.calls.filter(([u]) => /\bapi\.openai\.com\b|\bopenrouter\.ai\b/.test(String(u instanceof Request ? u.url : u)));

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { userId: USER };
  delete process.env.FILM_ALLOW_ANONYMOUS;
  delete process.env.AI_GOOGLE_ONLY;
  process.env.ANTHROPIC_API_KEY = 'anthropic-test';
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('no network in this test'); });
});
afterEach(() => {
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

test('a guest is refused with the canonical 401 body before any provider is called', async () => {
  mockAuth = null;
  const res = await POST(post({ message: 'hello' }));
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ authRequired: true, error: 'auth_required' });
  expect(mockGemini).not.toHaveBeenCalled();
  expect(vendorCalls()).toEqual([]);
});

test('the per-account daily allowance refuses before any provider is called', async () => {
  mockCapByKey.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
  const res = await POST(post({ message: 'hello' }));
  expect(res.status).toBe(429);
  expect(mockCapByKey).toHaveBeenCalledWith(USER, expect.objectContaining({ keyPrefix: 'rl:chat:user' }));
  expect(mockGemini).not.toHaveBeenCalled();
});

test('Google-only (the default): the Gemini chain answers and no request reaches OpenAI or OpenRouter', async () => {
  mockGemini.mockResolvedValueOnce(reply('Tbilisi'));
  const body = await data(await POST(post({ message: 'capital of Georgia?' })));
  expect(JSON.stringify(body)).toContain('Tbilisi');
  expect(JSON.stringify(body)).toContain('gemini-3.8-flash');
  expect(vendorCalls()).toEqual([]);
});

test('Google-only failure: a generic localized notice, no provider wording, no diagnostics, no Anthropic', async () => {
  mockGemini.mockResolvedValueOnce(failed);
  const text = JSON.stringify(await data(await POST(post({ message: 'hello', language: 'en' }))));
  expect(text).toContain('temporarily unavailable');
  expect(text).not.toMatch(/RESOURCE_EXHAUSTED|prepayment|diagnostics/);
  expect(mockAnthropicCall).not.toHaveBeenCalled();
});

test.each([{ AI_GOOGLE_ONLY: '0' }, { AI_GOOGLE_ONLY: '0', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-anthropic' }])(
  'env %p re-opens nothing: Gemini answers each account, OpenAI, OpenRouter and Anthropic are never called (MASTER TASK v3.1)',
  async (env) => {
    Object.assign(process.env, env);
    mockGemini.mockResolvedValueOnce(reply('Your name is Nino'));
    const first = JSON.stringify(await data(await POST(post({ message: 'what is my name?' }))));
    expect(first).toContain('Nino');

    mockAuth = { userId: OTHER };
    mockGemini.mockResolvedValueOnce(failed);
    const second = JSON.stringify(await data(await POST(post({ message: 'what is my name?', language: 'en' }))));
    expect(second).not.toContain('Nino');
    expect(second).toContain('temporarily unavailable');
    expect(vendorCalls()).toEqual([]);
    expect(mockAnthropicCall).not.toHaveBeenCalled();
  },
);
