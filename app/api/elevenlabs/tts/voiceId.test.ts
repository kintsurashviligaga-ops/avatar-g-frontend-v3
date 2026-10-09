/** @jest-environment node */
/**
 * POST /api/elevenlabs/tts — the caller's voice id goes into the ElevenLabs URL path with the platform key.
 *
 * ⚠️ Unchecked, `../` or `?` in `voiceId` moved the POST to another ElevenLabs endpoint (fetch resolves the dot
 * segments) and the route streamed the answer back. Pinned here: only a 1–64 character alphanumeric id is sent; anything
 * else is a 400 before any provider call; a blank one means "no voice named" (the default voice). Provider mocked.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { WRITE: { maxRequests: 20, windowMs: 60_000 } },
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { KA_VOICE_FEMALE } from '../../../../lib/audio/georgian-voice';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/elevenlabs/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  process.env = { ...ENV, ELEVENLABS_API_KEY: 'el-test-key' };
  delete process.env.ELEVENLABS_GEORGIAN_VOICE_ID;
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array(4096), { status: 200 }));
});
afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

test.each([
  ['voiceId', '../voices/21m00Tcm4TlvDq8ikWAM/settings/edit?x='],
  ['voiceId', 'abc#frag'],
  ['voice_id', 'abc/../../user'],
  ['voiceId', 12345],
  ['voice_id', { id: 'abc' }],
])('%s %p → 400, and ElevenLabs is never called', async (key, value) => {
  const res = await POST(post({ text: 'hello there', locale: 'en', [key]: value }));
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: 'voiceId is not a valid voice id' });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a well-formed id is the one in the provider URL', async () => {
  const res = await POST(post({ text: 'hello there', locale: 'en', voiceId: '21m00Tcm4TlvDq8ikWAM' }));
  expect(res.status).toBe(200);
  expect(String(fetchSpy.mock.calls[0][0])).toMatch(
    /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/21m00Tcm4TlvDq8ikWAM\/stream\?/,
  );
});

test('voice_id is honoured the same way (the onboarding preview sends it)', async () => {
  await POST(post({ text: 'hello there', locale: 'en', voice_id: 'EXAVITQu4vr4xnSDxMaL' }));
  expect(String(fetchSpy.mock.calls[0][0])).toContain('/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL/');
});

test('a blank id means no voice named: Georgian text gets the native Georgian voice', async () => {
  const res = await POST(post({ text: 'გამარჯობა', locale: 'ka', voiceId: '  ' }));
  expect(res.status).toBe(200);
  expect(String(fetchSpy.mock.calls[0][0])).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${KA_VOICE_FEMALE}`);
});

test('the configured English voice still works when its env value ends in a newline', async () => {
  process.env.ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM\n';
  const res = await POST(post({ text: 'hello there', locale: 'en' }));
  expect(res.status).toBe(200);
  expect(String(fetchSpy.mock.calls[0][0])).toContain('/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream?');
});
