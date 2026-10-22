/** @jest-environment node */
/**
 * POST /api/elevenlabs/tts — signed in only, and spoken by Google Cloud TTS alone (MASTER TASK v3.1 PR 5d).
 *
 * ⚠️ No guest screen calls this route any more (read-aloud moved to /api/tts/gemini), yet an anonymous POST once reached
 * ElevenLabs, then Azure, then Google Cloud TTS on the GEMINI key. Pinned here: a guest is refused before any engine is
 * touched, a session lookup that throws is not a session, and a signed-in caller gets audio from Cloud TTS alone — its
 * miss is the route's explicit 502 (R7), never ElevenLabs (global fetch, answering audio here) or Azure (mocked to
 * SUCCEED). No network, no spend.
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
jest.mock('../../../../lib/audio/google-tts', () => ({
  ...jest.requireActual('../../../../lib/audio/google-tts'),
  synthesizeGoogleTts: jest.fn(async () => new ArrayBuffer(2048)),
}));
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
  // A working ElevenLabs key: the route must not reach for it.
  process.env.ELEVENLABS_API_KEY = 'el-test-key';
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array(4096), { status: 200 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

test('a guest is refused (401 auth_required) and no engine is called', async () => {
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

test('a signed-in caller passes the gate and gets audio — from Cloud TTS, in the language and gender asked', async () => {
  mockUser = { id: 'user-1' };
  const res = await POST(post({ text: 'გამარჯობა', locale: 'ka', gender: 'male' }));
  expect(res.status).toBe(200);
  expect(res.headers.get('X-Voice-Provider')).toBe('google-cloud-tts');
  expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
  expect((await res.arrayBuffer()).byteLength).toBe(2048);
  expect(googleMock).toHaveBeenCalledWith('გამარჯობა', { languageCode: 'ka-GE', gender: 'MALE' });
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(azureMock).not.toHaveBeenCalled();
});

test('Georgian digits are read as Georgian words; English keeps its own', async () => {
  mockUser = { id: 'user-1' };
  await POST(post({ text: 'ფასი 190 ლარი', locale: 'ka' }));
  await POST(post({ text: 'It costs 190 lari', locale: 'en' }));
  expect(googleMock.mock.calls[0]![0]).not.toMatch(/\d/);
  expect(googleMock.mock.calls[1]![0]).toBe('It costs 190 lari');
  expect(googleMock.mock.calls.map((c) => c[1])).toEqual([
    { languageCode: 'ka-GE', gender: 'FEMALE' },
    { languageCode: 'en-US', gender: 'FEMALE' },
  ]);
});

/**
 * ⚠️ PROJECT_MASTER R7 — NO SILENT FALLBACK. A request uses ONE engine; when Cloud TTS fails the route answers its
 * explicit 502. ElevenLabs (fetch) and Azure stay ready to answer, so a fallback put back would be caught here.
 */
describe('a Cloud TTS miss is the explicit error — no ElevenLabs, no Azure', () => {
  beforeEach(() => { mockUser = { id: 'user-1' }; });
  const NO_TTS = { error: 'No TTS provider available' };

  test.each([
    ['no audio (no config, a refusal, an outage)', null],
    ['a body too short to be audio', new ArrayBuffer(200)],
  ])('%s → 502, and nothing else is asked', async (_name, answer) => {
    googleMock.mockResolvedValueOnce(answer);
    const res = await POST(post({ text: 'გამარჯობა, როგორ ხარ?', locale: 'ka' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual(NO_TTS);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(azureMock).not.toHaveBeenCalled();
  });
});
