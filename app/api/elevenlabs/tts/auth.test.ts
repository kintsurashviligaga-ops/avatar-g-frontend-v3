/** @jest-environment node */
/**
 * POST /api/elevenlabs/tts — signed in only.
 *
 * ⚠️ No guest screen calls this route any more (read-aloud moved to /api/tts/gemini), yet an anonymous POST still
 * reached ElevenLabs, then Azure, then Google Cloud TTS on the GEMINI key. Pinned here: a guest is refused before any
 * of the three is touched, a session lookup that throws is not a session, and a signed-in caller still gets audio —
 * from ElevenLabs alone (R7: its failure is the route's explicit 502, never Azure or Google).
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

test('a signed-in caller passes the gate and gets audio — from ElevenLabs', async () => {
  mockUser = { id: 'user-1' };
  const res = await POST(post({ text: 'გამარჯობა', locale: 'ka' }));
  expect(res.status).toBe(200);
  expect(res.headers.get('X-Voice-Provider')).toBe('elevenlabs');
  expect(String(fetchSpy.mock.calls[0][0])).toMatch(/^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\//);
  expect(azureMock).not.toHaveBeenCalled();
  expect(googleMock).not.toHaveBeenCalled();
});

/**
 * ⚠️ PROJECT_MASTER R7 — NO SILENT FALLBACK. ElevenLabs used to be followed by Azure (Georgian) and then Google Cloud TTS
 * (any language), so a caller who chose a cloned Georgian voice could be answered by another provider's voice. A request
 * now uses ONE provider; when ElevenLabs fails the route answers its explicit 502. The Azure / Google modules stay mocked
 * (to SUCCEED) so a fallback put back would be caught here.
 */
describe('ElevenLabs failure is the explicit error — no Azure, no Google TTS', () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    mockUser = { id: 'user-1' };
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); // the route logs each EL miss
  });
  afterEach(() => errSpy.mockRestore());
  const NO_TTS = { error: 'No TTS provider available' };

  test('Georgian: ElevenLabs answers 5xx → 502, Azure and Google are never asked', async () => {
    fetchSpy.mockResolvedValue(new Response('upstream down', { status: 503 }));
    const res = await POST(post({ text: 'გამარჯობა, როგორ ხარ?', locale: 'ka' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual(NO_TTS);
    expect(azureMock).not.toHaveBeenCalled();
    expect(googleMock).not.toHaveBeenCalled();
  });

  test('English: both ElevenLabs endpoints (stream, then buffered) fail → 502, Google is never asked', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNRESET'));
    const res = await POST(post({ text: 'hello there, how are you?', locale: 'en' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual(NO_TTS);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // /stream → buffered: the same provider, never a second one
    for (const [url] of fetchSpy.mock.calls) expect(String(url)).toMatch(/^https:\/\/api\.elevenlabs\.io\//);
    expect(googleMock).not.toHaveBeenCalled();
  });

  test('no ElevenLabs key: 502 — not a quiet switch to Azure or Google', async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const res = await POST(post({ text: 'გამარჯობა', locale: 'ka' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual(NO_TTS);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(azureMock).not.toHaveBeenCalled();
    expect(googleMock).not.toHaveBeenCalled();
  });
});
