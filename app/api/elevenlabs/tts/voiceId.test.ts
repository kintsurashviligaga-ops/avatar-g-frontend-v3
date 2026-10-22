/** @jest-environment node */
/**
 * POST /api/elevenlabs/tts — a named voice (MASTER TASK v3.1 PR 5d).
 *
 * A voice id named an ElevenLabs voice (a catalogue or cloned one; the onboarding preview sends them). Cloud TTS cannot
 * speak in it, and answering in another voice than the one chosen is the silent swap R7 forbids, so a well-formed id is
 * refused with the studio's google_only body before any engine is called. A malformed id stays the 400 it was (it once
 * moved the POST to another ElevenLabs endpoint), and a blank one still means "no voice named". Engines mocked.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { WRITE: { maxRequests: 20, windowMs: 60_000 } },
}));
jest.mock('../../../../lib/audio/google-tts', () => ({
  ...jest.requireActual('../../../../lib/audio/google-tts'),
  synthesizeGoogleTts: jest.fn(async () => new ArrayBuffer(2048)),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { synthesizeGoogleTts } from '../../../../lib/audio/google-tts';

const google = synthesizeGoogleTts as jest.MockedFunction<typeof synthesizeGoogleTts>;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('https://myavatar.ge/api/elevenlabs/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, ELEVENLABS_API_KEY: 'el-test-key' };
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
])('%s %p → 400, and no engine is called', async (key, value) => {
  const res = await POST(post({ text: 'hello there', locale: 'en', [key]: value }));
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: 'voiceId is not a valid voice id' });
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(google).not.toHaveBeenCalled();
});

test.each([
  ['voiceId', '21m00Tcm4TlvDq8ikWAM'],
  ['voice_id', 'EXAVITQu4vr4xnSDxMaL'], // the onboarding preview's field
])('a named voice (%s) is refused with google_only — never read in a different voice', async (key, value) => {
  const res = await POST(post({ text: 'hello there', locale: 'en', [key]: value }, { cookie: 'NEXT_LOCALE=en' }));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ success: false, code: 'google_only', error: 'google_only', url: null });
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(google).not.toHaveBeenCalled();
});

test('a blank id means no voice named: Georgian text is read by Cloud TTS in Georgian', async () => {
  const res = await POST(post({ text: 'გამარჯობა', locale: 'ka', voiceId: '  ' }));
  expect(res.status).toBe(200);
  expect(google).toHaveBeenCalledWith('გამარჯობა', { languageCode: 'ka-GE', gender: 'FEMALE' });
  expect(fetchSpy).not.toHaveBeenCalled();
});
