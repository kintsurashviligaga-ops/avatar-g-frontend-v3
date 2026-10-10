/** @jest-environment node */
/**
 * POST /api/ai/upscale — who may run an upscale and how much of it one account may take. The engine itself is a stub.
 * An upscale bills no credits (gap C3, the price is the owner's call), so after the sign-in gate and the per-IP burst
 * guard, a per-account daily ceiling is what bounds one person's spend; a malformed request spends none of it.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = { id: 'user-1' };
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: mockUser })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: jest.fn(async () => null),
  RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 }, UPSCALE_USER: { maxRequests: 30, windowMs: 86_400_000 } },
}));
jest.mock('../../../../lib/ai/replicate', () => ({ upscaleImage: jest.fn(async () => 'https://provider.test/out.png') }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => null) }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedAsset: jest.fn(async () => undefined) }));

import { NextRequest } from 'next/server';
import { checkRateLimitByKey, RATE_LIMITS } from '../../../../lib/api/rate-limit';
import { upscaleImage } from '../../../../lib/ai/replicate';
import { recordCompletedAsset } from '../../../../lib/orchestrator/jobs';
import { POST } from './route';

const ENV = { ...process.env };
const post = (body: unknown) =>
  POST(new NextRequest('https://myavatar.ge/api/ai/upscale', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV };
  delete process.env.MEDIA_GOOGLE_ONLY;
  mockUser = { id: 'user-1' };
  // The re-host fetch of the provider's file is not under test: it fails open and keeps the provider URL.
  global.fetch = jest.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
});
afterAll(() => { process.env = ENV; });

test('signed out: refused before any limit is spent or the engine runs', async () => {
  mockUser = null;
  expect((await post({ imageUrl: 'https://cdn.test/a.png' })).status).toBe(401);
  expect(checkRateLimitByKey).not.toHaveBeenCalled();
  expect(upscaleImage).not.toHaveBeenCalled();
});

test('a valid request is counted against the session user before the engine runs, and filed under that user', async () => {
  const res = await post({ imageUrl: 'https://cdn.test/a.png', scale: 4 });
  expect(res.status).toBe(200);
  expect(checkRateLimitByKey).toHaveBeenCalledWith('user-1', RATE_LIMITS.UPSCALE_USER);
  expect((checkRateLimitByKey as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((upscaleImage as jest.Mock).mock.invocationCallOrder[0]);
  expect(recordCompletedAsset).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', serviceType: 'image' }));
});

test('over the daily ceiling the limiter answers and the engine is not called', async () => {
  (checkRateLimitByKey as jest.Mock).mockResolvedValueOnce(new Response('{"error":"rate_limited"}', { status: 429 }));
  expect((await post({ imageUrl: 'https://cdn.test/a.png' })).status).toBe(429);
  expect(upscaleImage).not.toHaveBeenCalled();
});

test('a request with no image spends none of the allowance', async () => {
  expect((await post({ imageUrl: 'not a url' })).status).toBe(400);
  expect(checkRateLimitByKey).not.toHaveBeenCalled();
});

test('MEDIA_GOOGLE_ONLY refuses the outside engine before the session is read', async () => {
  process.env.MEDIA_GOOGLE_ONLY = '1';
  const res = await post({ imageUrl: 'https://cdn.test/a.png' });
  expect(res.status).not.toBe(200);
  expect(upscaleImage).not.toHaveBeenCalled();
  expect(checkRateLimitByKey).not.toHaveBeenCalled();
});
