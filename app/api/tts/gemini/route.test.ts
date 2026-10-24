/** @jest-environment node */
/**
 * POST /api/tts/gemini — Gemini read-aloud, pinned with every provider mocked (no network, no spend).
 *
 *   · the TTS bucket (not WRITE) throttles it; a guest is refused before Google is touched;
 *   · the "Read aloud verbatim:" directive and the 3-attempt retry are kept;
 *   · the voice follows voice > gender > persona > Aoede, and Georgian only ever gets a verified voice;
 *   · locale → speechConfig.languageCode for en/ru only (never ka), dropped after a 400, switchable off;
 *   · usage is booked (real usageMetadata when Google reports it) and a budget refusal spends nothing;
 *   · v3.1: the call goes to Vertex AI with a Workload Identity token; an AI Studio key is never read or sent.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: mockUser })),
}));

jest.mock('../../../../lib/api/rate-limit', () => {
  // rate-limit.ts starts a 5-minute cleanup setInterval when it is imported; unref it so it cannot hold jest open.
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

jest.mock('../../../../lib/services/billing/chatBudget', () => {
  const actual = jest.requireActual('../../../../lib/services/billing/chatBudget');
  return { ...actual, chatBudgetAllows: jest.fn(async () => true), bookChatUsage: jest.fn(async () => undefined) };
});

import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '../../../../lib/api/rate-limit';
import { bookChatUsage, chatBudgetAllows } from '../../../../lib/services/billing/chatBudget';
import { inspectWav } from '../../../../lib/speech/wav';
import { MONO_16K, geminiAudioResponse } from '../../../../tests/fixtures/speechAudio';

const USER_ID = '11111111-2222-4333-8444-555555555555';
const limitMock = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;
const budgetMock = chatBudgetAllows as jest.MockedFunction<typeof chatBudgetAllows>;
const bookMock = bookChatUsage as jest.MockedFunction<typeof bookChatUsage>;

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/tts/gemini', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** One second of 24 kHz 16-bit mono silence, as Gemini returns it. */
const PCM_B64 = Buffer.alloc(48_000).toString('base64');
const okAudio = (usage?: Record<string, number>) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { data: PCM_B64, mimeType: 'audio/L16;codec=pcm;rate=24000' } }] } }],
      ...(usage ? { usageMetadata: usage } : {}),
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

type SentBody = {
  contents: Array<{ parts: Array<{ text: string }> }>;
  generationConfig: { responseModalities: string[]; speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } }; languageCode?: string } };
};

const ENV = { ...process.env };
const VERTEX_ENV = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const VERTEX_TTS_URL =
  'https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/global/publishers/google/models/gemini-2.5-flash-preview-tts:generateContent';
let fetchSpy: jest.SpyInstance;
const sent = (i = 0): SentBody => JSON.parse(String((fetchSpy.mock.calls[i]![1] as RequestInit).body)) as SentBody;
const sentUrl = (i = 0) => String(fetchSpy.mock.calls[i]![0]);
const sentHeaders = (i = 0) => (fetchSpy.mock.calls[i]![1] as RequestInit).headers as Record<string, string>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockUser = { id: USER_ID };
  delete process.env.FILM_ALLOW_ANONYMOUS;
  delete process.env.GEMINI_TTS_MODEL;
  delete process.env.GEMINI_TTS_LANGUAGE_CODE;
  delete process.env.GEMINI_API_KEYS;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.GEMINI_TRANSPORT;
  delete process.env.GCP_GEMINI_LOCATION;
  delete process.env.GCP_VEO_LOCATION;
  Object.assign(process.env, VERTEX_ENV);
  // A leftover AI Studio key must change nothing (asserted on every request below).
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  budgetMock.mockResolvedValue(true);
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => okAudio());
});

afterEach(() => {
  for (const [url] of fetchSpy.mock.calls) expect(String(url)).not.toContain('generativelanguage.googleapis.com');
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

test('throttled by the dedicated TTS bucket (not the shared WRITE one), and a 429 spends nothing', async () => {
  limitMock.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
  const res = await POST(post({ text: 'hello', locale: 'en' }));
  expect(res.status).toBe(429);
  expect(limitMock).toHaveBeenCalledWith(expect.anything(), RATE_LIMITS.TTS);
  expect(fetchSpy).not.toHaveBeenCalled();
  // The bucket must hold a long reply (~14 chunks) several times over.
  expect(RATE_LIMITS.TTS.maxRequests).toBeGreaterThanOrEqual(42);
  expect(RATE_LIMITS.TTS.windowMs).toBe(60_000);
});

test('a per-ACCOUNT daily cap (keyed on the verified uid) refuses before Google — rotating IPs buys nothing', async () => {
  const byKey = checkRateLimitByKey as jest.MockedFunction<typeof checkRateLimitByKey>;
  byKey.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
  const res = await POST(post({ text: 'hello', locale: 'en' }));
  expect(res.status).toBe(429);
  expect(byKey).toHaveBeenCalledWith(USER_ID, RATE_LIMITS.TTS_USER);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a guest is refused (401 auth_required) before Google is called', async () => {
  mockUser = null;
  const res = await POST(post({ text: 'გამარჯობა', locale: 'ka' }));
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ success: false, error: 'auth_required', authRequired: true });
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(bookMock).not.toHaveBeenCalled();
});

test('empty text is a 400 and nothing is called', async () => {
  const res = await POST(post({ text: '   ' }));
  expect(res.status).toBe(400);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a signed-in caller gets a WAV from Vertex AI (bearer token, no key); the directive is kept, Aoede is the default', async () => {
  const res = await POST(post({ text: 'გამარჯობა, როგორ ხარ?', locale: 'ka' }));
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('audio/wav');
  const wav = Buffer.from(await res.arrayBuffer());
  expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(wav.readUInt32LE(24)).toBe(24_000);
  expect(wav.byteLength).toBe(44 + 48_000);

  expect(sentUrl()).toBe(VERTEX_TTS_URL);
  expect(sentUrl()).not.toContain('key=');
  expect(sentHeaders().Authorization).toBe('Bearer vertex-token');
  expect(sentHeaders()['x-goog-api-key']).toBeUndefined();
  const b = sent();
  expect(b.contents[0]!.parts[0]!.text).toBe('Read aloud verbatim: გამარჯობა, როგორ ხარ?');
  expect(b.generationConfig.responseModalities).toEqual(['AUDIO']);
  expect(b.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
  // Georgian never carries a languageCode (ka-GE is not a documented SpeechConfig language).
  expect(b.generationConfig.speechConfig.languageCode).toBeUndefined();
});

test('the WAV it answers passes the speech contract: rate, channels and frame count are the ones Google sent', async () => {
  fetchSpy.mockImplementation(async () => geminiAudioResponse([{ pcm: MONO_16K, mimeType: 'audio/L16;codec=pcm;rate=16000' }]));
  const res = await POST(post({ text: 'hello', locale: 'en' }));
  const r = inspectWav(new Uint8Array(await res.arrayBuffer()));
  expect(r).toEqual({ ok: true, info: expect.objectContaining({ sampleRate: 16000, channels: 1, frames: MONO_16K.length / 2, durationMs: 500 }) });
});

test('gender=male → Charon (unchanged contract)', async () => {
  await POST(post({ text: 'hi', locale: 'ka', gender: 'male' }));
  expect(sent().generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Charon');
});

test('an explicit voice wins; Georgian maps the unverified Kore/Puck onto Aoede/Charon, en keeps them', async () => {
  await POST(post({ text: 'hello', locale: 'en', voice: 'kore', gender: 'male' }));
  expect(sent(0).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore');
  await POST(post({ text: 'გამარჯობა', locale: 'ka', voice: 'Puck' }));
  expect(sent(1).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Charon');
  await POST(post({ text: 'hello', locale: 'en', voice: 'Zephyr; drop table' }));
  expect(sent(2).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
});

test('a custom persona voice is used when no voice/gender is sent, and gender still overrides it', async () => {
  const customPersona = { id: 'custom:narrator', name: 'Narrator', directive: 'Speak like a calm narrator.', voice: 'Charon' };
  await POST(post({ text: 'hello', locale: 'en', personaId: 'custom:narrator', customPersona }));
  expect(sent(0).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Charon');
  await POST(post({ text: 'hello', locale: 'en', personaId: 'custom:narrator', customPersona, gender: 'female' }));
  expect(sent(1).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
});

test('en/ru carry speechConfig.languageCode; GEMINI_TTS_LANGUAGE_CODE=0 turns it off', async () => {
  await POST(post({ text: 'hello', locale: 'en' }));
  expect(sent(0).generationConfig.speechConfig.languageCode).toBe('en-US');
  await POST(post({ text: 'привет', locale: 'ru' }));
  expect(sent(1).generationConfig.speechConfig.languageCode).toBe('ru-RU');
  process.env.GEMINI_TTS_LANGUAGE_CODE = '0';
  await POST(post({ text: 'hello', locale: 'en' }));
  expect(sent(2).generationConfig.speechConfig.languageCode).toBeUndefined();
});

test('3 attempts on failure; a 400 with a languageCode drops it for the retries', async () => {
  fetchSpy
    .mockImplementationOnce(async () => new Response('bad languageCode', { status: 400 }))
    .mockImplementationOnce(async () => new Response('Model tried to generate text', { status: 400 }))
    .mockImplementationOnce(async () => okAudio());
  const res = await POST(post({ text: 'Is this read?', locale: 'en' }));
  expect(res.status).toBe(200);
  expect(fetchSpy).toHaveBeenCalledTimes(3);
  expect(sent(0).generationConfig.speechConfig.languageCode).toBe('en-US');
  expect(sent(1).generationConfig.speechConfig.languageCode).toBeUndefined();
  expect(sent(2).generationConfig.speechConfig.languageCode).toBeUndefined();
});

test('after 3 failed attempts → 502 tts_failed, and nothing is booked', async () => {
  fetchSpy.mockImplementation(async () => new Response('overloaded', { status: 503 }));
  const res = await POST(post({ text: 'hello', locale: 'en' }));
  expect(res.status).toBe(502);
  expect(await res.json()).toMatchObject({ error: 'tts_failed' });
  expect(fetchSpy).toHaveBeenCalledTimes(3);
  expect(bookMock).not.toHaveBeenCalled();
});

test('books the reported usage on the TTS model with the user id', async () => {
  fetchSpy.mockImplementation(async () => okAudio({ promptTokenCount: 12, candidatesTokenCount: 25, totalTokenCount: 37 }));
  await POST(post({ text: 'hello there', locale: 'en' }));
  expect(bookMock).toHaveBeenCalledTimes(1);
  expect(bookMock.mock.calls[0]![0]).toMatchObject({
    model: 'gemini-2.5-flash-preview-tts',
    inputTokens: 12,
    outputTokens: 25,
    totalTokens: 37,
    userId: USER_ID,
  });
});

test('without usageMetadata the output is estimated from the audio length (1 s of audio → 32 tokens)', async () => {
  await POST(post({ text: 'hello', locale: 'en' }));
  expect(bookMock.mock.calls[0]![0]).toMatchObject({ model: 'gemini-2.5-flash-preview-tts', outputTokens: 32 });
});

test('an allowlisted GEMINI_TTS_MODEL is used; an unknown one falls back to the verified default', async () => {
  process.env.GEMINI_TTS_MODEL = 'models/gemini-3.8-flash-tts';
  await POST(post({ text: 'hello', locale: 'en' }));
  expect(sentUrl(0)).toContain('/models/gemini-3.8-flash-tts:generateContent');
  process.env.GEMINI_TTS_MODEL = 'gemini-9-evil/../x';
  await POST(post({ text: 'hello', locale: 'en' }));
  expect(sentUrl(1)).toContain('/models/gemini-2.5-flash-preview-tts:generateContent');
});

test('a budget refusal is a 503 before Google is called', async () => {
  budgetMock.mockResolvedValueOnce(false);
  const res = await POST(post({ text: 'hello', locale: 'en' }));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ error: 'budget_exhausted' });
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(budgetMock).toHaveBeenCalledWith('hello', 'gemini-2.5-flash-preview-tts');
});

test('a spend ledger that cannot be read is a 503 before Google is called (the real guard, failing closed)', async () => {
  // The real gate and the real BillingGuard. This file gives the guard no service-role client, which is exactly an
  // unreadable ledger: it must refuse, never wave read-aloud through unmetered (MASTER TASK v3.1, audit F-05).
  const real = jest.requireActual('../../../../lib/services/billing/chatBudget') as typeof import('../../../../lib/services/billing/chatBudget');
  budgetMock.mockImplementationOnce(real.chatBudgetAllows);
  const err = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const res = await POST(post({ text: 'hello', locale: 'en' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'budget_exhausted' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(bookMock).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith('[BillingGuard] spend ledger unreadable → refusing chat (fails closed)');
  } finally {
    err.mockRestore();
  }
});

test('Vertex AI unconfigured → 503 gemini_key_missing, and an AI Studio key is not used instead', async () => {
  for (const k of Object.keys(VERTEX_ENV)) delete process.env[k];
  const res = await POST(post({ text: 'hello', locale: 'en' }));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ error: 'gemini_key_missing' });
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(bookMock).not.toHaveBeenCalled();
});

test('GEMINI_TRANSPORT=vertex is the same as unset: Vertex AI with a bearer token', async () => {
  process.env.GEMINI_TRANSPORT = 'vertex';
  const res = await POST(post({ text: 'hello', locale: 'en' }));
  expect(res.status).toBe(200);
  expect(sentUrl()).toBe(VERTEX_TTS_URL);
  expect(sentHeaders().Authorization).toBe('Bearer vertex-token');
  expect(sentHeaders()['x-goog-api-key']).toBeUndefined();
  expect(sent().generationConfig.responseModalities).toEqual(['AUDIO']);
});

test('GEMINI_TRANSPORT=gemini_api (the Developer API) → 503 before any provider I/O', async () => {
  for (const value of ['gemini_api', 'gemini']) {
    process.env.GEMINI_TRANSPORT = value;
    const res = await POST(post({ text: 'hello', locale: 'en' }));
    expect(res.status).toBe(503);
  }
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(bookMock).not.toHaveBeenCalled();
});
