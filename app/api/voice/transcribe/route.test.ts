/** @jest-environment node */
/**
 * POST /api/voice/transcribe — pinned with every provider mocked (no network, no spend).
 *
 *   · a guest is refused before the upload is parsed or any engine runs; the per-user STT cap applies;
 *   · the default engine is Chirp 3 for everyone (GG card 2026-11-01 05:33Z), with Gemini on Vertex AI taking a clip
 *     Chirp cannot answer (the last block below); every other test pins STT_ENGINE=gemini, the Gemini-only engine;
 *   · Google-only: never Replicate, OpenAI or Deepgram — with the container fix;
 *   · no env value restores the legacy cascade (MASTER TASK v3.1, audit F-04);
 *   · ?diag=1 is admin-only (the email allowlist), and never carries a credential;
 *   · Gemini usage is booked with the user id; a Latin "transcript" of Georgian is still rejected;
 *   · v3.1: Gemini is reached on Vertex AI with a Workload Identity token; an AI Studio key is never read or sent.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/veo/vertexAuth', () => ({
  ...jest.requireActual('../../../../lib/veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));

let mockUser: { id: string; email?: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ supabase: {}, user: mockUser })),
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

jest.mock('../../../../lib/services/billing/chatBudget', () => {
  const actual = jest.requireActual('../../../../lib/services/billing/chatBudget');
  return {
    ...actual,
    chatBudgetAllows: jest.fn(async () => true),
    bookChatUsage: jest.fn(async () => undefined),
    bookSpeechUsage: jest.fn(async () => undefined),
  };
});

jest.mock('../../../../lib/auth/adminGuard', () => ({
  effectiveAdminAllowlist: jest.fn(async () => ['admin@example.com']),
}));

// The non-Google engines the route used to cascade to. Any call to these is a failure. (Replicate Whisper's client is gone,
// PR 20: the afterEach checks no request reached Replicate.)
jest.mock('../../../../lib/voice-v2v/providers', () => ({
  transcribeRealtimePcmChunk: jest.fn(async () => ({ text: 'from openai', provider: 'openai' })),
}));

import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';
import { checkRateLimitByKey, RATE_LIMITS } from '../../../../lib/api/rate-limit';
import { bookChatUsage, bookSpeechUsage } from '../../../../lib/services/billing/chatBudget';
import { transcribeRealtimePcmChunk } from '../../../../lib/voice-v2v/providers';
import { effectiveAdminAllowlist } from '../../../../lib/auth/adminGuard';

const USER_ID = '11111111-2222-4333-8444-555555555555';
const perUserMock = checkRateLimitByKey as jest.MockedFunction<typeof checkRateLimitByKey>;
const bookMock = bookChatUsage as jest.MockedFunction<typeof bookChatUsage>;
const bookSpeechMock = bookSpeechUsage as jest.MockedFunction<typeof bookSpeechUsage>;
const openaiMock = transcribeRealtimePcmChunk as jest.MockedFunction<typeof transcribeRealtimePcmChunk>;
const adminListMock = effectiveAdminAllowlist as jest.MockedFunction<typeof effectiveAdminAllowlist>;

/** A tiny but real WAV header + a little silence. */
function wavBytes(): Uint8Array {
  const b = Buffer.alloc(44 + 320);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + 320, 4);
  b.write('WAVE', 8);
  return new Uint8Array(b);
}
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

function upload(opts: { bytes?: Uint8Array; type?: string; language?: string; diag?: boolean; model?: string } = {}) {
  const form = new FormData();
  const data = opts.bytes ?? wavBytes();
  form.append('audio', new Blob([data as unknown as BlobPart], { type: opts.type ?? 'audio/wav' }), 'clip');
  if (opts.language) form.append('language', opts.language);
  if (opts.model) form.append('model', opts.model);
  return new NextRequest(`https://myavatar.ge/api/voice/transcribe${opts.diag ? '?diag=1' : ''}`, { method: 'POST', body: form });
}

const geminiOk = (text: string) =>
  new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 4, totalTokenCount: 44 },
  }), { status: 200 });

const ENV = { ...process.env };
const VERTEX_ENV = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
let fetchSpy: jest.SpyInstance;
/** The Vertex AI models the route called, in order. */
const modelsCalled = () => fetchSpy.mock.calls.map(([url]) => /models\/([^:]+):/.exec(String(url))![1]);

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: USER_ID, email: 'user@example.com' };
  delete process.env.AI_GOOGLE_ONLY;
  delete process.env.FILM_ALLOW_ANONYMOUS;
  delete process.env.GEMINI_API_KEYS;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.GEMINI_STT_MODEL;
  delete process.env.VOICE_V2V_GEMINI_MODEL;
  delete process.env.GEMINI_TRANSPORT;
  delete process.env.GCP_GEMINI_LOCATION;
  delete process.env.GCP_VEO_LOCATION;
  // Gemini alone (the engine Chirp hands a clip to, and the mic before 2026-11-01); the Chirp default is pinned last.
  process.env.STT_ENGINE = 'gemini';
  Object.assign(process.env, VERTEX_ENV);
  // A leftover AI Studio key changes nothing: it is never read, sent or echoed.
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => geminiOk('გამარჯობა'));
});

afterEach(() => {
  for (const [url] of fetchSpy.mock.calls) {
    expect(String(url)).not.toContain('generativelanguage.googleapis.com');
    expect(String(url)).not.toContain('replicate.com');
  }
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

test('a guest is refused (401 auth_required) and no engine is touched', async () => {
  mockUser = null;
  const res = await POST(upload());
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ success: false, error: 'auth_required', authRequired: true });
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(openaiMock).not.toHaveBeenCalled();
});

test('the per-user STT cap applies to a signed-in caller, keyed on the user id', async () => {
  perUserMock.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
  const res = await POST(upload());
  expect(res.status).toBe(429);
  expect(perUserMock).toHaveBeenCalledWith(USER_ID, RATE_LIMITS.STT_USER);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('Google-only (STT_ENGINE=gemini): WAV → Gemini on Vertex AI only (bearer token, no key), usage booked; no other vendor', async () => {
  const res = await POST(upload({ language: 'ka-GE' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ text: 'გამარჯობა', provider: 'gemini', language: 'ka-GE' });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  const [url, init] = fetchSpy.mock.calls[0]! as [string, RequestInit];
  expect(url).toBe(
    'https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/global/publishers/google/models/gemini-3.6-flash:generateContent',
  );
  expect(url).not.toContain('key=');
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer vertex-token');
  expect((init.headers as Record<string, string>)['x-goog-api-key']).toBeUndefined();
  const sent = JSON.parse(String(init.body)) as { contents: Array<{ parts: Array<{ inlineData?: { mimeType: string } }> }> };
  expect(sent.contents[0]!.parts[1]!.inlineData!.mimeType).toBe('audio/wav');
  expect(openaiMock).not.toHaveBeenCalled();
  expect(bookMock).toHaveBeenCalledWith(expect.objectContaining({
    model: 'gemini-3.6-flash', inputTokens: 40, outputTokens: 4, totalTokens: 44, userId: USER_ID,
  }));
  // No trial model was named, so the admin list was never read for this dictation.
  expect(adminListMock).not.toHaveBeenCalled();
});

test('Google-only: a browser WebM is sent as video/webm (best effort); a Gemini 400 → unsupported_format, still 200', async () => {
  fetchSpy.mockImplementationOnce(async () => new Response('Unsupported MIME type', { status: 400 }));
  const res = await POST(upload({ bytes: WEBM, type: 'audio/webm;codecs=opus', language: 'en-US' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ text: '', provider: 'none', code: 'unsupported_format' });
  const sent = JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body)) as { contents: Array<{ parts: Array<{ inlineData?: { mimeType: string } }> }> };
  expect(sent.contents[0]!.parts[1]!.inlineData!.mimeType).toBe('video/webm');
  expect(openaiMock).not.toHaveBeenCalled();
});

test('Google-only: an unknown container never reaches Gemini', async () => {
  const res = await POST(upload({ bytes: new Uint8Array(32).fill(7), type: 'application/octet-stream', language: 'en-US' }));
  expect(await res.json()).toEqual({ text: '', provider: 'none', code: 'unsupported_format' });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('Google-only: a Latin rendering of Georgian speech is rejected (sttAccept) — but still booked', async () => {
  fetchSpy.mockImplementationOnce(async () => geminiOk('gamarjoba'));
  const res = await POST(upload({ language: 'ka-GE' }));
  expect(await res.json()).toEqual({ text: '', provider: 'none' });
  expect(bookMock).toHaveBeenCalledTimes(1);
});

test('Google-only: Russian speech in a Georgian session is kept as spoken (Cyrillic), and the answer names it', async () => {
  fetchSpy.mockImplementationOnce(async () => geminiOk('привет, как дела'));
  const res = await POST(upload({ language: 'ka-GE' }));
  expect(await res.json()).toEqual({ text: 'привет, как дела', provider: 'gemini', language: 'ru-RU' });
});

test('Russian speech answered in English: the retry is in Russian, and the answer says Russian (GG, Production 2026-10-25)', async () => {
  fetchSpy
    .mockImplementationOnce(async () => geminiOk('[ru] can you make a prompt for VEO 3'))
    .mockImplementationOnce(async () => geminiOk('[ru] сделай промпт для VEO 3'));
  const res = await POST(upload({ language: 'en-US' }));
  expect(await res.json()).toEqual({ text: 'сделай промпт для VEO 3', provider: 'gemini', language: 'ru-RU' });
  expect(modelsCalled()).toEqual(['gemini-3.6-flash', 'gemini-3.6-flash']);
});

test('an English answer that still comes back for Russian speech is remembered as Russian, never as English', async () => {
  fetchSpy.mockImplementation(async () => geminiOk('[ru] can you make a prompt for VEO 3'));
  const res = await POST(upload({ language: 'en-US' }));
  expect(await res.json()).toEqual({ text: 'can you make a prompt for VEO 3', provider: 'gemini', language: 'ru-RU' });
});

test("language 'auto': no hint in the prompt, any language accepted, and the language heard comes back", async () => {
  fetchSpy.mockImplementationOnce(async () => geminiOk('გამარჯობა, როგორ ხარ'));
  let res = await POST(upload({ language: 'auto' }));
  expect(await res.json()).toEqual({ text: 'გამარჯობა, როგორ ხარ', provider: 'gemini', language: 'ka-GE' });
  const prompt = JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body)).contents[0].parts[0].text as string;
  expect(prompt).not.toMatch(/most likely/);
  expect(prompt).toMatch(/NEVER translate/);
  fetchSpy.mockImplementationOnce(async () => geminiOk('what is the weather today'));
  res = await POST(upload({ language: 'auto' }));
  expect(await res.json()).toEqual({ text: 'what is the weather today', provider: 'gemini', language: 'en-US' });
});

test('an unknown language value is the Georgian default, as before', async () => {
  fetchSpy.mockImplementationOnce(async () => geminiOk('gamarjoba rogor xar'));
  const res = await POST(upload({ language: 'xx-YY' }));
  // Georgian in Latin letters under the ka-GE default is still a miss, and the prompt's hint is Georgian.
  expect(await res.json()).toEqual({ text: '', provider: 'none' });
  const prompt = JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body)).contents[0].parts[0].text as string;
  expect(prompt).toMatch(/most likely speaks Georgian/);
});

test('Google-only: English speech in a Georgian session is kept, and the answer names it (GG, production 2026-10-24)', async () => {
  fetchSpy.mockImplementationOnce(async () => geminiOk('How do I get to Batumi?'));
  const res = await POST(upload({ language: 'ka-GE' }));
  expect(await res.json()).toEqual({ text: 'How do I get to Batumi?', provider: 'gemini', language: 'en-US' });
});

test('Google-only: a quota outage is an empty transcript with stt_unavailable, never a vendor swap', async () => {
  fetchSpy.mockImplementation(async () => new Response('prepay depleted', { status: 402 }));
  const res = await POST(upload({ language: 'en-US' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ text: '', provider: 'none', code: 'stt_unavailable' });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(openaiMock).not.toHaveBeenCalled();
});

test("Google-only: a 429 on 3.6 Flash moves to the chat's next Flash model; the answer is booked on the model that gave it", async () => {
  fetchSpy.mockImplementationOnce(async () => new Response('Resource exhausted', { status: 429 }));
  const res = await POST(upload({ language: 'ka-GE' }));
  expect(await res.json()).toEqual({ text: 'გამარჯობა', provider: 'gemini', language: 'ka-GE' });
  expect(modelsCalled()).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash']);
  expect(bookMock).toHaveBeenCalledTimes(1);
  expect(bookMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.5-flash' }));
});

test('Google-only: a model that does not answer in time hands the dictation to the next one (GG, 2026-10-25 TimeoutError)', async () => {
  fetchSpy.mockImplementationOnce(async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); });
  const res = await POST(upload({ language: 'ka-GE' }));
  expect(await res.json()).toEqual({ text: 'გამარჯობა', provider: 'gemini', language: 'ka-GE' });
  expect(modelsCalled()).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash']);
  expect(bookMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.5-flash' }));
});

test("the owner's `?stt=` trial: an admin's allowlisted model is used ALONE (no step-downs), and the diag names it", async () => {
  mockUser = { id: USER_ID, email: 'admin@example.com' };
  let res = await POST(upload({ language: 'ka-GE', model: 'gemini-3.1-flash-lite' }));
  expect(await res.json()).toEqual({ text: 'გამარჯობა', provider: 'gemini', language: 'ka-GE' });
  expect(modelsCalled()).toEqual(['gemini-3.1-flash-lite']);
  expect(bookMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.1-flash-lite' }));
  // Its failure is its own: no other model answers for it.
  fetchSpy.mockClear();
  fetchSpy.mockImplementation(async () => new Response('Resource exhausted', { status: 429 }));
  res = await POST(upload({ language: 'ka-GE', model: 'gemini-3.1-flash-lite', diag: true }));
  const j = (await res.json()) as { code: string; diag: { geminiError: string; trialModel: string } };
  expect(modelsCalled()).toEqual(['gemini-3.1-flash-lite']);
  expect(j.code).toBe('stt_unavailable');
  expect(j.diag.trialModel).toBe('gemini-3.1-flash-lite');
  expect(j.diag.geminiError).toBe('Gemini STT failed (429) on gemini-3.1-flash-lite: Resource exhausted');
});

test("a trial model from anyone but an admin, or one outside STT_MODELS, is ignored: the usual chain answers", async () => {
  let res = await POST(upload({ language: 'ka-GE', model: 'gemini-3.1-pro-preview' }));
  expect(await res.json()).toEqual({ text: 'გამარჯობა', provider: 'gemini', language: 'ka-GE' });
  expect(modelsCalled()).toEqual(['gemini-3.6-flash']);
  expect(adminListMock).toHaveBeenCalledTimes(1);

  mockUser = { id: USER_ID, email: 'admin@example.com' };
  for (const model of ['gemini-9-ultra', 'gemini-flash-latest', 'gemini-2.0-flash']) {
    fetchSpy.mockClear();
    adminListMock.mockClear();
    res = await POST(upload({ language: 'ka-GE', model }));
    expect(await res.json()).toMatchObject({ text: 'გამარჯობა', provider: 'gemini' });
    expect(modelsCalled()).toEqual(['gemini-3.6-flash']);
    // Not an allowlisted id: the admin list is not even read.
    expect(adminListMock).not.toHaveBeenCalled();
  }

  // The admin check fails closed: an error reading the list is "not admin".
  fetchSpy.mockClear();
  adminListMock.mockRejectedValueOnce(new Error('panel down'));
  res = await POST(upload({ language: 'ka-GE', model: 'gemini-3.1-flash-lite' }));
  expect(await res.json()).toMatchObject({ text: 'გამარჯობა', provider: 'gemini' });
  expect(modelsCalled()).toEqual(['gemini-3.6-flash']);
});

const CHIRP_URL = 'https://us-speech.googleapis.com/v2/projects/gen-lang-client-0671348730/locations/us/recognizers/_:recognize';
const chirpOk = (transcript: string, languageCode: string) =>
  new Response(JSON.stringify({ results: [{ alternatives: [{ transcript }], languageCode }], metadata: { totalBilledDuration: '3s' } }), { status: 200 });

test("the owner's `?stt=chirp_3` trial: Cloud Speech-to-Text alone, booked by the audio billed, the language heard named", async () => {
  mockUser = { id: USER_ID, email: 'admin@example.com' };
  fetchSpy.mockImplementation(async () => chirpOk('Привет, как дела?', 'ru-ru'));
  const res = await POST(upload({ language: 'ka-GE', model: 'chirp_3' }));
  expect(await res.json()).toEqual({ text: 'Привет, как дела?', provider: 'chirp', language: 'ru-RU' });
  // The site's three languages, and Georgian alone at the same time (lib/voice-v2v/chirpStt pickChirpLeg).
  expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([CHIRP_URL, CHIRP_URL]);
  const sent = (i: number) => (JSON.parse(String((fetchSpy.mock.calls[i]![1] as RequestInit).body)) as { config: unknown }).config;
  expect(sent(0)).toEqual({ autoDecodingConfig: {}, model: 'chirp_3', languageCodes: ['ka-GE', 'ru-RU', 'en-US'] });
  expect(sent(1)).toEqual({ autoDecodingConfig: {}, model: 'chirp_3', languageCodes: ['ka-GE'] });
  // $0.016 a minute: 3 s billed on each request.
  expect(bookSpeechMock).toHaveBeenCalledWith({ model: 'chirp_3', usd: 0.0016, userId: USER_ID });
  expect(bookMock).not.toHaveBeenCalled();
});

test('Chirp 3 from anyone but an admin is ignored: the usual Gemini chain answers', async () => {
  const res = await POST(upload({ language: 'ka-GE', model: 'chirp_3' }));
  expect(await res.json()).toEqual({ text: 'გამარჯობა', provider: 'gemini', language: 'ka-GE' });
  expect(modelsCalled()).toEqual(['gemini-3.6-flash']);
  expect(bookSpeechMock).not.toHaveBeenCalled();
});

test("Chirp 3 refused (the API off on the project): no Gemini stands in, and the owner's diag gives Google's reason", async () => {
  mockUser = { id: USER_ID, email: 'admin@example.com' };
  fetchSpy.mockImplementation(async () => new Response(JSON.stringify({
    error: { code: 403, message: 'Cloud Speech-to-Text API has not been used in project 467145118875 before or it is disabled.' },
  }), { status: 403 }));
  const res = await POST(upload({ language: 'ka-GE', model: 'chirp_3', diag: true }));
  const j = (await res.json()) as { text: string; code: string; diag: { geminiError: string; trialModel: string } };
  expect(j.text).toBe('');
  expect(j.code).toBe('stt_unavailable');
  expect(j.diag.trialModel).toBe('chirp_3');
  expect(j.diag.geminiError).toBe('Chirp 3 STT failed (403): Cloud Speech-to-Text API has not been used in project 467145118875 before or it is disabled.');
  expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([CHIRP_URL, CHIRP_URL]);
  expect(bookSpeechMock).not.toHaveBeenCalled();
});

test('Chirp 3 hearing Georgian as Hindi (GG 2026-10-31): the Georgian-only answer is written; with none, nothing is, and the owner is told', async () => {
  mockUser = { id: USER_ID, email: 'admin@example.com' };
  const georgianOnly = (init?: RequestInit) =>
    (JSON.parse(String(init?.body)) as { config: { languageCodes: string[] } }).config.languageCodes.length === 1;
  fetchSpy.mockImplementation(async (_url: unknown, init?: RequestInit) =>
    georgianOnly(init) ? chirpOk('გესმის ჩემი?', 'ka-GE') : chirpOk('चमेली के इसमें', 'hi-IN'));
  let res = await POST(upload({ language: 'en-US', model: 'chirp_3' }));
  expect(await res.json()).toEqual({ text: 'გესმის ჩემი?', provider: 'chirp', language: 'ka-GE' });

  fetchSpy.mockImplementation(async (_url: unknown, init?: RequestInit) =>
    georgianOnly(init) ? new Response('{}', { status: 500 }) : chirpOk('चमेली के इसमें', 'hi-IN'));
  res = await POST(upload({ language: 'en-US', model: 'chirp_3', diag: true }));
  const j = (await res.json()) as { text: string; provider: string; diag: { geminiError: string } };
  expect(j.text).toBe('');
  expect(j.provider).toBe('none');
  expect(j.diag.geminiError).toBe('Chirp 3 gave no readable Georgian, Russian or English (heard hi-IN): nothing written');
});

test('Chirp 3 hearing Georgian as Latin noise (GG 2026-10-31 11:58Z, „G 7 6 0 0 0 0 0“): the Georgian-only answer is written', async () => {
  mockUser = { id: USER_ID, email: 'admin@example.com' };
  const georgianOnly = (init?: RequestInit) =>
    (JSON.parse(String(init?.body)) as { config: { languageCodes: string[] } }).config.languageCodes.length === 1;
  fetchSpy.mockImplementation(async (_url: unknown, init?: RequestInit) =>
    georgianOnly(init) ? chirpOk('გესმის ჩემი?', 'ka-GE') : chirpOk('G 7 6 0 0 0 0 0', 'en-US'));
  const res = await POST(upload({ language: 'ka-GE', model: 'chirp_3' }));
  expect(await res.json()).toEqual({ text: 'გესმის ჩემი?', provider: 'chirp', language: 'ka-GE' });
});

test('Chirp 3 on an unconfigured Vertex AI: no call at all, the same reason as for Gemini', async () => {
  mockUser = { id: USER_ID, email: 'admin@example.com' };
  for (const k of Object.keys(VERTEX_ENV)) delete process.env[k];
  const res = await POST(upload({ language: 'ka-GE', model: 'chirp_3', diag: true }));
  const j = (await res.json()) as { code: string; diag: Record<string, unknown> };
  expect(j.code).toBe('stt_unavailable');
  expect(j.diag).toMatchObject({ geminiKeyPresent: false, geminiError: 'Vertex AI is not configured', trialModel: 'chirp_3' });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('?diag=1 from the owner on an unconfigured Vertex AI names why (variable names only), with no call', async () => {
  mockUser = { id: USER_ID, email: 'admin@example.com' };
  for (const k of Object.keys(VERTEX_ENV)) delete process.env[k];
  const res = await POST(upload({ diag: true, language: 'en-US' }));
  const j = (await res.json()) as { code: string; diag: Record<string, unknown> };
  expect(j.code).toBe('stt_unavailable');
  expect(j.diag).toMatchObject({ geminiKeyPresent: false, geminiError: 'Vertex AI is not configured' });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('?diag=1 from the owner when every model fails: the reason lists each model and its status', async () => {
  mockUser = { id: USER_ID, email: 'admin@example.com' };
  fetchSpy.mockImplementation(async () => new Response('Resource exhausted', { status: 429 }));
  const res = await POST(upload({ diag: true, language: 'en-US' }));
  const j = (await res.json()) as { code: string; diag: { geminiError: string } };
  expect(j.code).toBe('stt_unavailable');
  expect(j.diag.geminiError).toMatch(/^gemini-3\.6-flash 429, gemini-3\.5-flash 429, gemini-3\.8-flash 429: /);
  expect(fetchSpy).toHaveBeenCalledTimes(3);
});

test('Google-only: Vertex AI unconfigured → stt_unavailable and no call at all, even with an AI Studio key', async () => {
  for (const k of Object.keys(VERTEX_ENV)) delete process.env[k];
  const res = await POST(upload({ language: 'en-US' }));
  expect(await res.json()).toEqual({ text: '', provider: 'none', code: 'stt_unavailable' });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('Google-only: GEMINI_TRANSPORT=gemini_api (the Developer API) → stt_unavailable and no call at all', async () => {
  process.env.GEMINI_TRANSPORT = 'gemini_api';
  const res = await POST(upload({ language: 'en-US' }));
  expect(await res.json()).toEqual({ text: '', provider: 'none', code: 'stt_unavailable' });
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(openaiMock).not.toHaveBeenCalled();
});

test.each([
  ['ka-GE', { AI_GOOGLE_ONLY: '0' }],
  ['ka-GE', { AI_GOOGLE_ONLY: '0', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-replicate' }],
  ['en-US', { AI_GOOGLE_ONLY: 'off', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-openai' }],
])('%s with %p: the legacy cascade stays gone, Gemini on Vertex AI answers alone', async (language, env) => {
  Object.assign(process.env, env);
  const res = await POST(upload({ language }));
  expect(await res.json()).toMatchObject({ text: 'გამარჯობა', provider: 'gemini' });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(openaiMock).not.toHaveBeenCalled();
});

test('?diag=1 from a non-admin is ignored (plain answer, no upstream detail)', async () => {
  const res = await POST(upload({ diag: true, language: 'en-US' }));
  const j = await res.json();
  expect(j.diag).toBeUndefined();
  expect(j).toEqual({ text: 'გამარჯობა', provider: 'gemini', language: 'ka-GE' });
});

test('?diag=1 from an allowlisted admin returns the breadcrumb, without any credential', async () => {
  mockUser = { id: USER_ID, email: 'Admin@Example.com' };
  fetchSpy.mockImplementationOnce(async () => new Response('Unsupported MIME type', { status: 400 }));
  const res = await POST(upload({ diag: true, bytes: WEBM, type: 'audio/webm', language: 'en-US' }));
  const raw = await res.text();
  const j = JSON.parse(raw) as { diag: Record<string, unknown> };
  expect(j.diag).toMatchObject({ googleOnly: true, container: 'webm', geminiMime: 'video/webm', geminiNative: false, geminiKeyPresent: true });
  expect(String(j.diag.geminiError)).toContain('400');
  expect(raw).not.toContain('test-gemini-key');
  expect(raw).not.toContain('vertex-token');
});

test('?diag=1 on a transcript that came back: the plain answer, nothing to diagnose', async () => {
  mockUser = { id: USER_ID, email: 'Admin@Example.com' };
  fetchSpy.mockImplementationOnce(async () => geminiOk('გამარჯობა'));
  const res = await POST(upload({ diag: true }));
  expect(await res.json()).toEqual({ text: 'გამარჯობა', provider: 'gemini', language: 'ka-GE' });
});

test('empty audio → 400 before any engine', async () => {
  const res = await POST(upload({ bytes: new Uint8Array(0) }));
  expect(res.status).toBe(400);
  expect(fetchSpy).not.toHaveBeenCalled();
});

describe('the default engine: Chirp 3 for everyone, Gemini when Chirp has no answer (GG card 2026-11-01 05:33Z)', () => {
  const isChirp = (url: unknown) => String(url).includes('speech.googleapis.com');
  const georgianOnly = (init?: RequestInit) =>
    (JSON.parse(String(init?.body)) as { config: { languageCodes: string[] } }).config.languageCodes.length === 1;
  const urls = () => fetchSpy.mock.calls.map(([url]) => (isChirp(url) ? 'chirp' : /models\/([^:]+):/.exec(String(url))![1]));
  /** A WAV whose header says it lasts `seconds` (the byte rate is what wavSeconds reads). */
  const wavOf = (seconds: number) => {
    const b = Buffer.from(wavBytes());
    b.writeUInt32LE(Math.ceil(320 / seconds), 28);
    return new Uint8Array(b);
  };

  beforeEach(() => {
    delete process.env.STT_ENGINE;
  });

  test('a WAV clip goes to Chirp 3 (both requests), booked by the audio billed; Gemini is not asked', async () => {
    fetchSpy.mockImplementation(async (url: unknown) => (isChirp(url) ? chirpOk('Can you hear me?', 'en-us') : geminiOk('nope')));
    const res = await POST(upload({ language: 'ka-GE' }));
    expect(await res.json()).toEqual({ text: 'Can you hear me?', provider: 'chirp', language: 'en-US' });
    expect(urls()).toEqual(['chirp', 'chirp']);
    expect(bookSpeechMock).toHaveBeenCalledWith({ model: 'chirp_3', usd: 0.0016, userId: USER_ID });
    expect(bookMock).not.toHaveBeenCalled();
    // Nobody named a trial model: the admin list is not read for an everyday dictation.
    expect(adminListMock).not.toHaveBeenCalled();
  });

  test("Georgian: the Georgian-only request's answer is written (GG 2026-11-01 05:30Z)", async () => {
    fetchSpy.mockImplementation(async (url: unknown, init?: RequestInit) =>
      !isChirp(url) ? geminiOk('nope') : georgianOnly(init) ? chirpOk('გესმის ჩემი ხმა?', 'ka-GE') : chirpOk('G 7 6 0 0 0 0 0', 'en-US'));
    const res = await POST(upload({ language: 'ka-GE' }));
    expect(await res.json()).toEqual({ text: 'გესმის ჩემი ხმა?', provider: 'chirp', language: 'ka-GE' });
    expect(urls()).toEqual(['chirp', 'chirp']);
  });

  test('Chirp refused (403): Gemini answers the same clip, and only Gemini is booked', async () => {
    fetchSpy.mockImplementation(async (url: unknown) =>
      isChirp(url) ? new Response(JSON.stringify({ error: { message: 'Permission denied' } }), { status: 403 }) : geminiOk('გამარჯობა'));
    const res = await POST(upload({ language: 'ka-GE' }));
    expect(await res.json()).toEqual({ text: 'გამარჯობა', provider: 'gemini', language: 'ka-GE' });
    expect(urls()).toEqual(['chirp', 'chirp', 'gemini-3.6-flash']);
    expect(bookSpeechMock).not.toHaveBeenCalled();
    expect(bookMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.6-flash', userId: USER_ID }));
  });

  test('Chirp not answering in time: Gemini answers', async () => {
    fetchSpy.mockImplementation(async (url: unknown) => {
      if (isChirp(url)) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      return geminiOk('привет');
    });
    const res = await POST(upload({ language: 'ru-RU' }));
    expect(await res.json()).toEqual({ text: 'привет', provider: 'gemini', language: 'ru-RU' });
    expect(urls()).toEqual(['chirp', 'chirp', 'gemini-3.6-flash']);
  });

  test('letters Chirp cannot write (Hindi, the Georgian-only request failing): Gemini answers, both are booked', async () => {
    fetchSpy.mockImplementation(async (url: unknown, init?: RequestInit) =>
      !isChirp(url) ? geminiOk('გესმის ჩემი?') : georgianOnly(init) ? new Response('{}', { status: 500 }) : chirpOk('चमेली के इसमें', 'hi-IN'));
    const res = await POST(upload({ language: 'en-US' }));
    expect(await res.json()).toEqual({ text: 'გესმის ჩემი?', provider: 'gemini', language: 'ka-GE' });
    expect(urls()).toEqual(['chirp', 'chirp', 'gemini-3.6-flash']);
    expect(bookSpeechMock).toHaveBeenCalledTimes(1);
    expect(bookMock).toHaveBeenCalledTimes(1);
  });

  test('Georgian in Latin letters under a Georgian hint (refused by sttAccept): Gemini answers', async () => {
    fetchSpy.mockImplementation(async (url: unknown) => (isChirp(url) ? chirpOk('gamarjoba rogor xar', 'ka-GE') : geminiOk('გამარჯობა, როგორ ხარ')));
    const res = await POST(upload({ language: 'ka-GE' }));
    expect(await res.json()).toEqual({ text: 'გამარჯობა, როგორ ხარ', provider: 'gemini', language: 'ka-GE' });
    expect(urls()).toEqual(['chirp', 'chirp', 'gemini-3.6-flash']);
  });

  test('silence from Chirp is an answer: nothing written, no warning, and Gemini is not asked again', async () => {
    fetchSpy.mockImplementation(async (url: unknown) =>
      isChirp(url) ? new Response(JSON.stringify({ metadata: { totalBilledDuration: '1s' } }), { status: 200 }) : geminiOk('გამარჯობა'));
    const res = await POST(upload({ language: 'ka-GE' }));
    expect(await res.json()).toEqual({ text: '', provider: 'none' });
    expect(urls()).toEqual(['chirp', 'chirp']);
  });

  test('a clip over a minute never reaches Chirp (its one-request limit): Gemini answers alone', async () => {
    const res = await POST(upload({ bytes: wavOf(80), language: 'ka-GE' }));
    expect(await res.json()).toEqual({ text: 'გამარჯობა', provider: 'gemini', language: 'ka-GE' });
    expect(urls()).toEqual(['gemini-3.6-flash']);
    expect(bookSpeechMock).not.toHaveBeenCalled();
  });

  test("both engines failing: stt_unavailable, and the owner's diag gives Chirp's reason and then Gemini's", async () => {
    mockUser = { id: USER_ID, email: 'admin@example.com' };
    fetchSpy.mockImplementation(async (url: unknown) =>
      isChirp(url)
        ? new Response(JSON.stringify({ error: { message: 'Permission denied' } }), { status: 403 })
        : new Response('Resource exhausted', { status: 429 }));
    const res = await POST(upload({ language: 'en-US', diag: true }));
    const j = (await res.json()) as { text: string; code: string; diag: { geminiError: string; engine: string } };
    expect(j.text).toBe('');
    expect(j.code).toBe('stt_unavailable');
    expect(j.diag.engine).toBe('chirp+gemini');
    expect(j.diag.geminiError).toMatch(/^Chirp 3 STT failed \(403\): Permission denied; Gemini: gemini-3\.6-flash 429, /);
  });

  test("Gemini finding silence after Chirp's error: an empty transcript with no outage warning", async () => {
    fetchSpy.mockImplementation(async (url: unknown) =>
      isChirp(url) ? new Response('{}', { status: 503 }) : geminiOk(''));
    const res = await POST(upload({ language: 'en-US' }));
    expect(await res.json()).toEqual({ text: '', provider: 'none' });
  });

  test("the owner's `?stt=chirp_3` still runs Chirp alone: no Gemini after a refusal", async () => {
    mockUser = { id: USER_ID, email: 'admin@example.com' };
    fetchSpy.mockImplementation(async (url: unknown) => (isChirp(url) ? new Response('{}', { status: 403 }) : geminiOk('გამარჯობა')));
    const res = await POST(upload({ language: 'ka-GE', model: 'chirp_3' }));
    expect(await res.json()).toEqual({ text: '', provider: 'none', code: 'stt_unavailable' });
    expect(urls()).toEqual(['chirp', 'chirp']);
  });

  test("the owner's `?stt=<Gemini model>` runs that model alone: Chirp is not asked", async () => {
    mockUser = { id: USER_ID, email: 'admin@example.com' };
    const res = await POST(upload({ language: 'ka-GE', model: 'gemini-3.1-flash-lite' }));
    expect(await res.json()).toEqual({ text: 'გამარჯობა', provider: 'gemini', language: 'ka-GE' });
    expect(urls()).toEqual(['gemini-3.1-flash-lite']);
  });

  test.each(['gemini', 'GEMINI', ' Gemini '])('STT_ENGINE=%p turns Chirp off: Gemini alone, as before', async (value) => {
    process.env.STT_ENGINE = value;
    const res = await POST(upload({ language: 'ka-GE' }));
    expect(await res.json()).toEqual({ text: 'გამარჯობა', provider: 'gemini', language: 'ka-GE' });
    expect(urls()).toEqual(['gemini-3.6-flash']);
  });

  test('Vertex AI unconfigured: no call to either engine', async () => {
    for (const k of Object.keys(VERTEX_ENV)) delete process.env[k];
    const res = await POST(upload({ language: 'ka-GE' }));
    expect(await res.json()).toEqual({ text: '', provider: 'none', code: 'stt_unavailable' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
