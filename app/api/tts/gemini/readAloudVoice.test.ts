/** @jest-environment node */
/**
 * READ_ALOUD_VOICE_V2 (GG 2026-11-13, picked Algieba from the five Georgian samples): the plain read-aloud request gets
 * Algieba only when the flag is on; personas, gender, explicit voices and the flag-off default are unchanged.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: { id: '11111111-2222-4333-8444-555555555555' } })),
}));
jest.mock('../../../../lib/api/rate-limit', () => {
  const realSetInterval = global.setInterval;
  global.setInterval = ((fn: () => void, ms?: number) => {
    const handle = realSetInterval(fn, ms);
    (handle as unknown as { unref?: () => void }).unref?.();
    return handle;
  }) as unknown as typeof setInterval;
  try {
    const actual = jest.requireActual('../../../../lib/api/rate-limit');
    return { ...actual, checkRateLimit: jest.fn(async () => null), checkRateLimitByKey: jest.fn(async () => null) };
  } finally {
    global.setInterval = realSetInterval;
  }
});
jest.mock('../../../../lib/veo/vertexAuth', () => ({
  ...jest.requireActual('../../../../lib/veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));
jest.mock('../../../../lib/auth/adminGuard', () => ({ isAdminIdentity: jest.fn(async () => false) }));
jest.mock('../../../../lib/services/billing/chatBudget', () => {
  const actual = jest.requireActual('../../../../lib/services/billing/chatBudget');
  return { ...actual, chatBudgetAllows: jest.fn(async () => true), bookChatUsage: jest.fn(async () => undefined) };
});

import { NextRequest } from 'next/server';
import { POST } from './route';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/tts/gemini', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const PCM_B64 = Buffer.alloc(48_000).toString('base64');
const okAudio = () =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: PCM_B64, mimeType: 'audio/L16;codec=pcm;rate=24000' } }] } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;
const voiceSent = (i = 0): string =>
  (JSON.parse(String((fetchSpy.mock.calls[i]![1] as RequestInit).body)) as {
    generationConfig: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } } };
  }).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName;

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of ['GEMINI_TTS_MODEL', 'GEMINI_TTS_LANGUAGE_CODE', 'GEMINI_TRANSPORT', 'READ_ALOUD_VOICE_V2']) delete process.env[k];
  Object.assign(process.env, {
    GCP_PROJECT_ID: 'gen-lang-client-0671348730',
    GCP_PROJECT_NUMBER: '467145118875',
    GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
    GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
    GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
  });
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => okAudio());
});
afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

test('flag off (the default): plain read-aloud stays Aoede', async () => {
  const res = await POST(post({ text: 'გამარჯობა', locale: 'ka' }));
  expect(res.status).toBe(200);
  expect(voiceSent()).toBe('Aoede');
  expect(res.headers.get('x-voice-name')).toBe('Aoede');
});

test.each(['1', 'true', 'on'])('flag %s: plain read-aloud (Georgian, English) speaks with Algieba', async (v) => {
  process.env.READ_ALOUD_VOICE_V2 = v;
  const res = await POST(post({ text: 'გამარჯობა', locale: 'ka' }));
  expect(res.status).toBe(200);
  expect(voiceSent(0)).toBe('Algieba');
  expect(res.headers.get('x-voice-name')).toBe('Algieba');
  await POST(post({ text: 'hello', locale: 'en' }));
  expect(voiceSent(1)).toBe('Algieba');
});

test('flag on: an explicit voice, a gender or a persona keeps today’s rule', async () => {
  process.env.READ_ALOUD_VOICE_V2 = '1';
  await POST(post({ text: 'hello', locale: 'en', voice: 'Kore' }));
  expect(voiceSent(0)).toBe('Kore');
  await POST(post({ text: 'გამარჯობა', locale: 'ka', gender: 'female' }));
  expect(voiceSent(1)).toBe('Aoede');
  await POST(post({ text: 'გამარჯობა', locale: 'ka', gender: 'male' }));
  expect(voiceSent(2)).toBe('Charon');
  const customPersona = { id: 'custom:narrator', name: 'Narrator', directive: 'Speak like a calm narrator.', voice: 'Charon' };
  await POST(post({ text: 'hello', locale: 'en', customPersona }));
  expect(voiceSent(3)).toBe('Charon');
});

test('a client cannot ask for Algieba by name: an explicit voice is still only one of the persona voices', async () => {
  await POST(post({ text: 'hello', locale: 'en', voice: 'Algieba' }));
  expect(voiceSent()).toBe('Aoede');
});
