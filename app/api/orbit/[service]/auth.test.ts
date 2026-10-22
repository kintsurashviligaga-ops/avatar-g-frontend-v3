/** @jest-environment node */
/**
 * POST /api/orbit/[service] — signed in before ANY branch; the voice branch is capped and bounded.
 *
 * ⚠️ 'voice-synthesis' called ElevenLabs on the platform key for anyone: no session, no rate limit, no length cap.
 * Pinned: a guest is refused before the provider is touched, an over-long text is refused, the per-account
 * AUDIO_GEN_USER bucket is charged, and a provider failure never reaches the caller as the provider's own text.
 * Since MASTER TASK v3.1 PR 5e the voice is Google Cloud TTS alone; a named (ElevenLabs) voice is refused with
 * google_only rather than read in another voice. Global fetch rejects, so an ElevenLabs call put back fails here.
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
jest.mock('../../../../lib/audio/google-tts', () => ({
  ...jest.requireActual('../../../../lib/audio/google-tts'),
  synthesizeGoogleTts: jest.fn(async () => new ArrayBuffer(2048)),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { synthesizeGoogleTts } from '../../../../lib/audio/google-tts';
import { checkRateLimitByKey } from '../../../../lib/api/rate-limit';

const voiceMock = synthesizeGoogleTts as jest.MockedFunction<typeof synthesizeGoogleTts>;

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
  process.env.ELEVENLABS_API_KEY = 'el-test-key';
  process.env.ELEVENLABS_VOICE_ID = 'voice-1';
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('no network in tests'));
});
afterEach(() => { process.env = { ...ENV }; jest.restoreAllMocks(); });

test('a guest is refused (401 auth_required) and no voice engine is called', async () => {
  const res = await call({ text: 'გამარჯობა' });
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ error: 'auth_required', authRequired: true });
  expect(voiceMock).not.toHaveBeenCalled();
});

test('the gate covers every branch, not just voice (image is refused before its proxy call)', async () => {
  const res = await call({ prompt: 'a cat' }, 'image');
  expect(res.status).toBe(401);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a signed-in caller gets audio from Cloud TTS in the text\'s language, charged to the per-account AUDIO_GEN_USER bucket', async () => {
  mockUser = { id: 'user-1' };
  const res = await call({ text: 'გამარჯობა', gender: 'male' });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { audioUrl?: string };
  expect(body.audioUrl).toMatch(/^data:audio\/mpeg;base64,/);
  expect(checkRateLimitByKey).toHaveBeenCalledWith('user-1', expect.objectContaining({ keyPrefix: 'rl:audiogen:user' }));
  expect(voiceMock).toHaveBeenCalledWith('გამარჯობა', { languageCode: 'ka-GE', gender: 'MALE' });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a Cloud TTS miss is the route\'s explicit 502, and nothing else is asked (R7)', async () => {
  mockUser = { id: 'user-1' };
  voiceMock.mockResolvedValueOnce(null);
  const res = await call({ text: 'hello there' });
  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({ error: 'Voice synthesis is unavailable' });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('an over-long text is refused before the provider (Cloud TTS bills per character)', async () => {
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
  voiceMock.mockRejectedValueOnce(new Error('Cloud TTS 403: {"error":"PERMISSION_DENIED ya29.secret-token"}'));
  const res = await call({ text: 'hello' });
  const raw = JSON.stringify(await res.json());
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(raw).not.toMatch(/Cloud TTS|PERMISSION_DENIED|ya29/);
});

test('a voice id that is not one is refused (400), and a named voice is refused with google_only, before the provider', async () => {
  mockUser = { id: 'user-1' };
  for (const body of [
    { text: 'hello', provider_voice_id: '../voices/abc/settings/edit?x=' },
    { text: 'hello', voiceId: 'abc#x' },
    { text: 'hello', voiceId: 42 },
  ]) {
    const res = await call(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'voiceId is not a valid voice id' });
  }
  expect(voiceMock).not.toHaveBeenCalled();

  for (const body of [{ text: 'hello', voiceId: '21m00Tcm4TlvDq8ikWAM' }, { text: 'hello', provider_voice_id: 'EXAVITQu4vr4xnSDxMaL' }]) {
    const named = await call(body);
    expect(named.status).toBe(503);
    expect(await named.json()).toMatchObject({ success: false, code: 'google_only', error: 'google_only' });
  }
  expect(voiceMock).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
});
