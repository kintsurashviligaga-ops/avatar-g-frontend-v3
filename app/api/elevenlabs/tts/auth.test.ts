/** @jest-environment node */
/**
 * POST /api/elevenlabs/tts — signed in only.
 *
 * ⚠️ No guest screen calls this route any more (read-aloud moved to /api/tts/gemini), yet an anonymous POST still
 * reached ElevenLabs, then Azure, then Google Cloud TTS on the GEMINI key. Pinned here: a guest is refused before any
 * of the three is touched, a session lookup that throws is not a session, and a signed-in caller still gets audio.
 * Every provider is mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
let lookupThrows = false;
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => {
    if (lookupThrows) throw new Error('auth backend unreachable');
    return { user: mockUser };
  }),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { WRITE: { maxRequests: 20, windowMs: 60_000 } },
}));
jest.mock('../../../../lib/audio/google-tts', () => ({ synthesizeGoogleTts: jest.fn(async () => new ArrayBuffer(2048)) }));
jest.mock('../../../../lib/audio/azure-tts', () => ({
  azureTtsConfigured: jest.fn(() => true),
  synthesizeAzureGeorgian: jest.fn(async () => new ArrayBuffer(2048)),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { synthesizeGoogleTts } from '../../../../lib/audio/google-tts';
import { synthesizeAzureGeorgian } from '../../../../lib/audio/azure-tts';

const googleMock = synthesizeGoogleTts as jest.MockedFunction<typeof synthesizeGoogleTts>;
const azureMock = synthesizeAzureGeorgian as jest.MockedFunction<typeof synthesizeAzureGeorgian>;

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/elevenlabs/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  lookupThrows = false;
  delete process.env.FILM_ALLOW_ANONYMOUS;
  process.env.ELEVENLABS_API_KEY = 'el-test-key';
  // ElevenLabs is reached through global fetch; any call at all is a provider call.
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array(4096), { status: 200 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

test('a guest is refused (401 auth_required) and no TTS provider is called — not ElevenLabs, Azure or Google', async () => {
  const res = await POST(post({ text: 'გამარჯობა, როგორ ხარ?', locale: 'ka' }));
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ success: false, error: 'auth_required', authRequired: true });
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(azureMock).not.toHaveBeenCalled();
  expect(googleMock).not.toHaveBeenCalled();
});

test('a session lookup that throws is refused, never treated as a caller', async () => {
  lookupThrows = true;
  mockUser = { id: 'user-1' };
  await expect(POST(post({ text: 'hello there', locale: 'en' }))).rejects.toThrow('auth backend unreachable');
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(googleMock).not.toHaveBeenCalled();
});

test('a signed-in caller passes the gate and gets audio', async () => {
  mockUser = { id: 'user-1' };
  delete process.env.ELEVENLABS_API_KEY; // skip the EL leg → the fallback chain answers
  const res = await POST(post({ text: 'გამარჯობა', locale: 'ka' }));
  expect(res.status).toBe(200);
  expect(res.headers.get('X-Voice-Provider')).toBe('azure-ka');
  expect(azureMock).toHaveBeenCalledTimes(1);
});
