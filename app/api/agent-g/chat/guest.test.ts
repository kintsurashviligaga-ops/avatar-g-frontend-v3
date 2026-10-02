/** @jest-environment node */
/**
 * POST /api/agent-g/chat — who is asking decides what it costs.
 *
 * ⚠️ It answered every caller on the platform's model keys with only a per-IP-per-minute limit, so a signed-out visitor
 * of /services/* had unlimited turns, around the guest policy /api/chat/gemini enforces. Pinned here:
 *   · a guest spends ONE turn of the shared guest allowance (same bucket prefixes as /api/chat/gemini);
 *   · a guest whose allowance is spent gets the sign-in offer as the reply, and the model is NOT called;
 *   · a signed-in caller is charged to the per-account CHAT_USER bucket, never the guest buckets;
 *   · Agent G's own server-to-server dispatch (valid AGENT_G_INTERNAL_SECRET) is not capped again.
 * The model and memory are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: mockUser })),
}));

/** Which limiter buckets were asked, and whether the guest per-IP bucket is spent. */
const asked: string[] = [];
let guestSpent = false;
jest.mock('../../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: {
    AI: { maxRequests: 10, windowMs: 60_000, keyPrefix: 'rl:ai' },
    CHAT_USER: { maxRequests: 500, windowMs: 86_400_000, keyPrefix: 'rl:chat:user' },
  },
  checkRateLimit: jest.fn(async (_req: unknown, cfg: { keyPrefix?: string }) => {
    asked.push(`ip:${cfg.keyPrefix}`);
    if (cfg.keyPrefix === 'rl:chat:guest' && guestSpent) return new Response('{}', { status: 429 });
    return null;
  }),
  checkRateLimitByKey: jest.fn(async (id: string, cfg: { keyPrefix?: string }) => {
    asked.push(`key:${cfg.keyPrefix}:${id}`);
    return null;
  }),
}));
jest.mock('../../../../lib/agentg/personality', () => ({
  generateAgentGPersonalityReply: jest.fn(async () => ({ replyText: 'გამარჯობა!', tone: 'friendly', meta: { detectedEmotion: 'neutral' } })),
}));
jest.mock('../../../../lib/agentg/memory', () => ({
  readAgentGMemory: jest.fn(async () => null),
  writeAgentGMemory: jest.fn(async () => undefined),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateAgentGPersonalityReply } from '../../../../lib/agentg/personality';

const model = generateAgentGPersonalityReply as jest.Mock;

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('https://myavatar.ge/api/agent-g/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const ENV = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  asked.length = 0;
  mockUser = null;
  guestSpent = false;
  delete process.env.FILM_ALLOW_ANONYMOUS;
  delete process.env.CHAT_GUEST_ENABLED;
  delete process.env.AGENT_G_INTERNAL_SECRET;
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => { process.env = { ...ENV }; jest.restoreAllMocks(); });

test('a guest within the allowance is answered, spending one turn of the SHARED guest buckets', async () => {
  const res = await POST(post({ message: 'რა შეგიძლია?', locale: 'ka' }));
  expect(res.status).toBe(200);
  expect(model).toHaveBeenCalledTimes(1);
  expect(asked).toEqual(expect.arrayContaining(['ip:rl:chat:guest', 'key:rl:chat:guest:global:all']));
});

test('a guest whose allowance is spent gets the sign-in offer — and the model is never called', async () => {
  guestSpent = true;
  const res = await POST(post({ message: 'რა შეგიძლია?', locale: 'en' }));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { reply: string; meta: { authRequired?: boolean } };
  expect(body.meta.authRequired).toBe(true);
  expect(body.reply).toMatch(/Sign in or create a free account/);
  expect(model).not.toHaveBeenCalled();
});

test('CHAT_GUEST_ENABLED=0 refuses a guest outright (sign in), without calling the model', async () => {
  process.env.CHAT_GUEST_ENABLED = '0';
  const res = await POST(post({ message: 'hi', locale: 'ru' }));
  const body = (await res.json()) as { reply: string; meta: { authRequired?: boolean } };
  expect(body.meta.authRequired).toBe(true);
  expect(body.reply).toMatch(/Войдите/);
  expect(model).not.toHaveBeenCalled();
});

test('a signed-in caller is charged to the per-account CHAT_USER bucket, never the guest buckets', async () => {
  mockUser = { id: 'user-7' };
  const res = await POST(post({ message: 'hello', locale: 'en' }));
  expect(res.status).toBe(200);
  expect(asked).toContain('key:rl:chat:user:user-7');
  expect(asked.some((a) => a.includes('rl:chat:guest'))).toBe(false);
  expect(model).toHaveBeenCalledTimes(1);
});

test("Agent G's own dispatch (valid internal secret) is not capped again; a wrong secret is just a guest", async () => {
  process.env.AGENT_G_INTERNAL_SECRET = 'internal-secret-123';
  await POST(post({ message: 'plan a launch', locale: 'en' }, { 'x-agent-g-secret': 'internal-secret-123' }));
  expect(asked.some((a) => a.includes('rl:chat:'))).toBe(false);

  asked.length = 0;
  await POST(post({ message: 'plan a launch', locale: 'en' }, { 'x-agent-g-secret': 'guessed' }));
  expect(asked).toContain('ip:rl:chat:guest');
});
