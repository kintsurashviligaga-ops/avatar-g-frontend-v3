/** @jest-environment node */
/**
 * POST /api/orbit/[service] — signed in before ANY branch; the direct ElevenLabs voice branch is capped and bounded.
 *
 * ⚠️ 'voice-synthesis' called ElevenLabs on the platform key for anyone: no session, no rate limit, no length cap.
 * Pinned: a guest is refused before the provider is touched, an over-long text is refused, the per-account
 * AUDIO_GEN_USER bucket is charged, and a provider failure never reaches the caller as the provider's own text.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: mockUser })),
}));
let mockCapped = false;
jest.mock('../../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: {
    WRITE: { maxRequests: 20, windowMs: 60_000, keyPrefix: 'rl:write' },
    AUDIO_GEN_USER: { maxRequests: 60, windowMs: 86_400_000, keyPrefix: 'rl:audiogen:user' },
  },
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: jest.fn(async () => (mockCapped ? new Response('{"error":"Too many requests"}', { status: 429 }) : null)),
}));
jest.mock('../../../../lib/ai/elevenlabs', () => ({
  generateVoice: jest.fn(async () => ({ audioBuffer: new Uint8Array([1, 2, 3]).buffer, duration: 1.2, voiceId: 'voice-1' })),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateVoice } from '../../../../lib/ai/elevenlabs';
import { checkRateLimitByKey } from '../../../../lib/api/rate-limit';

const voiceMock = generateVoice as jest.MockedFunction<typeof generateVoice>;

const call = (body: unknown, service = 'voice') =>
  POST(
    new NextRequest(`https://myavatar.ge/api/orbit/${service}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ service }) },
  );

const ENV = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  mockCapped = false;
  delete process.env.FILM_ALLOW_ANONYMOUS;
  process.env.ELEVENLABS_VOICE_ID = 'voice-1';
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { process.env = { ...ENV }; jest.restoreAllMocks(); });

test('a guest is refused (401 auth_required) and ElevenLabs is never called', async () => {
  const res = await call({ text: 'გამარჯობა' });
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ error: 'auth_required', authRequired: true });
  expect(voiceMock).not.toHaveBeenCalled();
});

test('the gate covers every branch, not just voice (image is refused before its proxy call)', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('no network in tests'));
  const res = await call({ prompt: 'a cat' }, 'image');
  expect(res.status).toBe(401);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a signed-in caller gets audio, charged to the per-account AUDIO_GEN_USER bucket', async () => {
  mockUser = { id: 'user-1' };
  const res = await call({ text: 'გამარჯობა' });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { audioUrl?: string };
  expect(body.audioUrl).toMatch(/^data:audio\/mpeg;base64,/);
  expect(checkRateLimitByKey).toHaveBeenCalledWith('user-1', expect.objectContaining({ keyPrefix: 'rl:audiogen:user' }));
});

test('an over-long text is refused before the provider (ElevenLabs bills per character)', async () => {
  mockUser = { id: 'user-1' };
  const res = await call({ text: 'ა'.repeat(2501) });
  expect(res.status).toBe(413);
  expect(voiceMock).not.toHaveBeenCalled();
});

test('a spent per-account allowance answers 429 before the provider', async () => {
  mockUser = { id: 'user-1' };
  mockCapped = true;
  const res = await call({ text: 'hello' });
  expect(res.status).toBe(429);
  expect(voiceMock).not.toHaveBeenCalled();
});

test("a provider failure is answered with the sanitised class, never the provider's own text", async () => {
  mockUser = { id: 'user-1' };
  voiceMock.mockRejectedValueOnce(new Error('ElevenLabs 401: {"detail":"invalid_api_key sk_live_abc"}'));
  const res = await call({ text: 'hello' });
  const raw = JSON.stringify(await res.json());
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(raw).not.toMatch(/ElevenLabs|invalid_api_key|sk_live/);
});
