/** @jest-environment node */
/**
 * POST /api/chat/orchestrate — an anonymous TEXT turn spends the shared guest allowance.
 *
 * ⚠️ The /services/* chat shell posts here, and a signed-out caller used to get unlimited text answers on the platform's
 * model keys (only a per-IP-per-minute limit), around the guest policy /api/chat/gemini enforces. Paid media intents
 * are already refused for anonymous callers inside orchestrate(). Pinned:
 *   · a guest's text turn charges the guest buckets; once spent, the sign-in offer comes back and orchestrate() is
 *     NOT called;
 *   · a guest's media request does not spend a turn (orchestrate() refuses it for free);
 *   · a signed-in caller never touches the guest buckets;
 *   · a failure never carries the raw error text back in the response.
 */
jest.mock('server-only', () => ({}));

let mockAuthUserId: string | null = null;
jest.mock('../../../../lib/api/guard', () => ({
  applyApiGuards: jest.fn(async () => ({ response: null, auth: mockAuthUserId ? { userId: mockAuthUserId } : null, budgetRemaining: null })),
}));
const mockAsked: string[] = [];
let mockGuestSpent = false;
jest.mock('../../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: { READ: { maxRequests: 60, windowMs: 60_000 }, WRITE: { maxRequests: 30, windowMs: 60_000 } },
  checkRateLimit: jest.fn(async (_req: unknown, cfg: { keyPrefix?: string }) => {
    mockAsked.push(`ip:${cfg.keyPrefix}`);
    return cfg.keyPrefix === 'rl:chat:guest' && mockGuestSpent ? new Response('{}', { status: 429 }) : null;
  }),
  checkRateLimitByKey: jest.fn(async (id: string, cfg: { keyPrefix?: string }) => {
    mockAsked.push(`key:${cfg.keyPrefix}:${id}`);
    return null;
  }),
}));
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: mockAuthUserId ? { id: mockAuthUserId } : null, supabase: {} })),
  createRouteHandlerClient: jest.fn(),
}));
jest.mock('../../../../lib/chat/providerRouter', () => ({
  orchestrate: jest.fn(async () => ({ success: true, intent: 'text_chat', responseType: 'text', message: 'answer' })),
  pollOrchestrationTask: jest.fn(),
}));
jest.mock('../../../../lib/chat/userMemory', () => ({
  getUserProfileFacts: jest.fn(async () => []),
  buildProfilePreamble: jest.fn(() => ''),
  extractProfileFacts: jest.fn(() => []),
  saveUserProfileFacts: jest.fn(async () => undefined),
}));
jest.mock('../../../../lib/rag/retrieve', () => ({ retrieveContext: jest.fn(async () => '') }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { orchestrate } from '../../../../lib/chat/providerRouter';

const orch = orchestrate as jest.Mock;
const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/chat/orchestrate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const ENV = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  mockAsked.length = 0;
  mockGuestSpent = false;
  mockAuthUserId = null;
  delete process.env.FILM_ALLOW_ANONYMOUS;
  delete process.env.CHAT_GUEST_ENABLED;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { process.env = { ...ENV }; jest.restoreAllMocks(); });

test("a guest's text turn spends the shared guest allowance and is answered", async () => {
  const res = await POST(post({ message: 'რა ამინდია თბილისში?', serviceContext: 'global', locale: 'ka' }));
  expect(res.status).toBe(200);
  expect(orch).toHaveBeenCalledTimes(1);
  expect(mockAsked).toEqual(expect.arrayContaining(['ip:rl:chat:guest', 'key:rl:chat:guest:global:all']));
});

test('a guest whose allowance is spent gets the sign-in offer and orchestrate() is never called', async () => {
  mockGuestSpent = true;
  const res = await POST(post({ message: 'tell me a joke', serviceContext: 'global', locale: 'en' }));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { success: boolean; message: string; metadata: { authRequired?: boolean } };
  expect(body).toMatchObject({ success: false, metadata: { authRequired: true } });
  expect(body.message).toMatch(/Sign in or create a free account/);
  expect(orch).not.toHaveBeenCalled();
});

test("a guest's MEDIA request does not spend a guest turn (orchestrate() refuses it for anonymous, at no cost)", async () => {
  await POST(post({ message: 'generate an image of a red fox in the snow', serviceContext: 'image', locale: 'en' }));
  expect(mockAsked.some((a) => a.includes('rl:chat:guest'))).toBe(false);
  expect(orch).toHaveBeenCalledTimes(1);
});

test('a signed-in caller never touches the guest buckets', async () => {
  mockAuthUserId = 'user-1';
  await POST(post({ message: 'tell me a joke', serviceContext: 'global', locale: 'en' }));
  expect(mockAsked.some((a) => a.includes('rl:chat:guest'))).toBe(false);
  expect(orch).toHaveBeenCalledTimes(1);
});

test("a failure never sends the raw error text back (metadata.error is gone)", async () => {
  mockAuthUserId = 'user-1';
  orch.mockRejectedValueOnce(new Error('Replicate API 402: {"title":"Insufficient credit","detail":"Go to https://replicate.com/account/billing"}'));
  const res = await POST(post({ message: 'tell me a joke', serviceContext: 'global', locale: 'en' }));
  const raw = JSON.stringify(await res.json());
  expect(raw).not.toMatch(/Replicate|replicate\.com|Insufficient credit/);
});
