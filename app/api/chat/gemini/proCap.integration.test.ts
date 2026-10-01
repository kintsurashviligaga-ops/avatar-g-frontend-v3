/** @jest-environment node */
/**
 * The Pro allowance end to end with the REAL limiter (route.test.ts mocks it): one account's first 20 Pro turns run on
 * the Pro chain; the 21st is answered by Fast — no refusal, no crash — with the reason in `{meta}`; the Fast chain
 * never consumes the Pro allowance; another account keeps its own 20. Only the model call, Supabase, memory and the
 * budget are mocked.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ supabase: { rpc: jest.fn(async () => ({ data: [], error: null })) }, user: mockUser })),
}));
jest.mock('../../../../lib/ai/google/chatStream', () => ({
  streamGeminiChat: jest.fn(),
  unbookedAttempts: jest.requireActual('../../../../lib/ai/google/chatStream').unbookedAttempts,
}));
jest.mock('../../../../lib/services/billing/chatBudget', () => {
  const actual = jest.requireActual('../../../../lib/services/billing/chatBudget');
  return { ...actual, chatBudgetAllows: jest.fn(async () => true), bookChatUsage: jest.fn(async () => undefined) };
});
jest.mock('../../../../lib/api/rate-limit', () => {
  // The REAL limiter — only its 5-minute sweep timer is unref'd so jest can exit.
  const realSetInterval = global.setInterval;
  global.setInterval = ((handler: () => void, ms?: number) => realSetInterval(handler, ms).unref()) as unknown as typeof setInterval;
  try {
    return jest.requireActual('../../../../lib/api/rate-limit');
  } finally {
    global.setInterval = realSetInterval;
  }
});
jest.mock('../../../../lib/memory/embed', () => ({ embed: jest.fn(async () => null) }));
jest.mock('../../../../lib/chat/userMemory', () => ({
  getUserProfileFacts: jest.fn(async () => []),
  buildProfilePreamble: jest.fn(() => null),
  extractProfileFacts: jest.fn(() => []),
  saveUserProfileFacts: jest.fn(async () => undefined),
}));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { streamGeminiChat, type StreamGeminiChatInput, type StreamGeminiChatResult } from '../../../../lib/ai/google/chatStream';
import { decodeFrames, type ChatFrame } from '../../../../lib/chat/sse';

const mockStream = streamGeminiChat as jest.MockedFunction<typeof streamGeminiChat>;
const ENV = { ...process.env };

const turn = (mode: string, ip: string) =>
  new NextRequest('https://myavatar.ge/api/chat/gemini', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': ip, referer: 'https://myavatar.ge/ka/dashboard' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'გამარჯობა' }], mode, protocol: 2 }),
  });

/** Answers from the first model of whatever chain the route chose, and records that chain. */
const chains: string[][] = [];
function answer() {
  mockStream.mockImplementation(async (input: StreamGeminiChatInput): Promise<StreamGeminiChatResult> => {
    chains.push([...input.models]);
    const model = input.models[0]!;
    await input.onFrame({ meta: { provider: 'gemini', model } });
    await input.onFrame({ text: 'OK' });
    return { ok: true, model, text: 'OK', sources: [], attempts: [{ model }], usage: { inputTokens: 5, outputTokens: 1 } };
  });
}
const metaOf = (frames: Array<ChatFrame | 'DONE'>) =>
  frames.filter((f): f is Extract<ChatFrame, { meta: unknown }> => typeof f === 'object' && 'meta' in f).map((f) => f.meta);

beforeEach(() => {
  jest.clearAllMocks();
  chains.length = 0;
  process.env = { ...ENV };
  // No Redis: the limiter runs on its in-memory store.
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.CHAT_PRO_DAILY_LIMIT;
  delete process.env.GEMINI_CHAT_MODELS;
  delete process.env.GEMINI_CHAT_PRO_MODELS;
  delete process.env.FILM_ALLOW_ANONYMOUS;
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  answer();
});
afterAll(() => { process.env = { ...ENV }; });

test('20 Pro turns run on Pro; the 21st is answered by Fast with the pro_cap reason — never refused, never a crash', async () => {
  mockUser = { id: '11111111-aaaa-4bbb-8ccc-000000000001' };
  for (let i = 1; i <= 20; i++) {
    const res = await POST(turn('pro', `203.0.113.${i}`)); // rotating IPs: the allowance is per ACCOUNT
    expect(res.status).toBe(200);
    const frames = decodeFrames(await res.text());
    expect(metaOf(frames)[0]).toMatchObject({ model: 'gemini-3.1-pro-preview', mode: 'pro' });
    expect(metaOf(frames).some((m) => m.reason === 'pro_cap')).toBe(false);
  }
  const res = await POST(turn('pro', '203.0.113.99'));
  expect(res.status).toBe(200);
  const frames = decodeFrames(await res.text());
  const meta = metaOf(frames)[0]!;
  expect(meta).toMatchObject({ model: 'gemini-3.8-flash', mode: 'fast', requestedMode: 'pro', reason: 'pro_cap' });
  expect(typeof meta.resetAt === 'string' && !Number.isNaN(Date.parse(meta.resetAt))).toBe(true);
  expect(frames).toContainEqual({ text: 'OK' });
  expect(frames.some((f) => typeof f === 'object' && 'error' in f)).toBe(false);
  expect(chains[20]!.some((m) => /pro/.test(m))).toBe(false); // the downgraded turn never touches a Pro model

  // Fast turns neither need nor spend the Pro allowance.
  const fast = decodeFrames(await (await POST(turn('fast', '203.0.113.100'))).text());
  expect(metaOf(fast)[0]).toMatchObject({ model: 'gemini-3.8-flash', mode: 'fast' });
  expect(metaOf(fast)[0]!.reason).toBeUndefined();

  // Another account has its own allowance.
  mockUser = { id: '11111111-aaaa-4bbb-8ccc-000000000002' };
  const other = decodeFrames(await (await POST(turn('pro', '203.0.113.101'))).text());
  expect(metaOf(other)[0]).toMatchObject({ model: 'gemini-3.1-pro-preview', mode: 'pro' });
});

test('CHAT_PRO_DAILY_LIMIT=0 turns Pro off gracefully: every Pro request is answered by Fast with the reason', async () => {
  process.env.CHAT_PRO_DAILY_LIMIT = '0';
  mockUser = { id: '11111111-aaaa-4bbb-8ccc-000000000003' };
  const frames = decodeFrames(await (await POST(turn('pro', '198.51.100.7'))).text());
  expect(metaOf(frames)[0]).toMatchObject({ model: 'gemini-3.8-flash', mode: 'fast', requestedMode: 'pro', reason: 'pro_cap' });
  expect(frames).toContainEqual({ text: 'OK' });
});

test('switching modes turn by turn sends each turn down its own chain (payload → chain, no model id from the client)', async () => {
  mockUser = { id: '11111111-aaaa-4bbb-8ccc-000000000004' };
  for (const mode of ['fast', 'thinking', 'pro', 'lite', 'fast']) {
    await (await POST(turn(mode, '192.0.2.1'))).text();
  }
  expect(chains.map((c) => c[0])).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-3.8-flash']);
});
