/** @jest-environment node */
/**
 * POST /api/voice/transcribe — pinned with every provider mocked (no network, no spend).
 *
 *   · a guest is refused before the upload is parsed or any engine runs; the per-user STT cap applies;
 *   · Google-only (the default) calls Gemini ONLY — never Replicate, OpenAI or Deepgram — with the container fix;
 *   · the legacy cascade still runs under AI_GOOGLE_ONLY=0;
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
  return { ...actual, chatBudgetAllows: jest.fn(async () => true), bookChatUsage: jest.fn(async () => undefined) };
});

jest.mock('../../../../lib/auth/adminGuard', () => ({
  effectiveAdminAllowlist: jest.fn(async () => ['admin@example.com']),
}));

// The non-Google engines. Any call to these under AI_GOOGLE_ONLY is a failure.
jest.mock('../../../../lib/voice-v2v/providers', () => ({
  transcribeRealtimePcmChunk: jest.fn(async () => ({ text: 'from openai', provider: 'openai' })),
}));
jest.mock('../../../../lib/voice-v2v/replicateStt', () => ({
  hasReplicateSttKey: jest.fn(() => true),
  transcribeWithReplicateWhisper: jest.fn(async () => 'გამარჯობა replicate'),
}));

import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';
import { checkRateLimitByKey, RATE_LIMITS } from '../../../../lib/api/rate-limit';
import { bookChatUsage } from '../../../../lib/services/billing/chatBudget';
import { transcribeRealtimePcmChunk } from '../../../../lib/voice-v2v/providers';
import { transcribeWithReplicateWhisper } from '../../../../lib/voice-v2v/replicateStt';

const USER_ID = '11111111-2222-4333-8444-555555555555';
const perUserMock = checkRateLimitByKey as jest.MockedFunction<typeof checkRateLimitByKey>;
const bookMock = bookChatUsage as jest.MockedFunction<typeof bookChatUsage>;
const openaiMock = transcribeRealtimePcmChunk as jest.MockedFunction<typeof transcribeRealtimePcmChunk>;
const replicateMock = transcribeWithReplicateWhisper as jest.MockedFunction<typeof transcribeWithReplicateWhisper>;

/** A tiny but real WAV header + a little silence. */
function wavBytes(): Uint8Array {
  const b = Buffer.alloc(44 + 320);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + 320, 4);
  b.write('WAVE', 8);
  return new Uint8Array(b);
}
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

function upload(opts: { bytes?: Uint8Array; type?: string; language?: string; diag?: boolean } = {}) {
  const form = new FormData();
  const data = opts.bytes ?? wavBytes();
  form.append('audio', new Blob([data as unknown as BlobPart], { type: opts.type ?? 'audio/wav' }), 'clip');
  if (opts.language) form.append('language', opts.language);
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
  Object.assign(process.env, VERTEX_ENV);
  // A leftover AI Studio key changes nothing: it is never read, sent or echoed.
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => geminiOk('გამარჯობა'));
});

afterEach(() => {
  for (const [url] of fetchSpy.mock.calls) expect(String(url)).not.toContain('generativelanguage.googleapis.com');
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
  expect(replicateMock).not.toHaveBeenCalled();
});

test('the per-user STT cap applies to a signed-in caller, keyed on the user id', async () => {
  perUserMock.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
  const res = await POST(upload());
  expect(res.status).toBe(429);
  expect(perUserMock).toHaveBeenCalledWith(USER_ID, RATE_LIMITS.STT_USER);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('Google-only (default): WAV → Gemini on Vertex AI only (bearer token, no key), usage booked; no other vendor', async () => {
  const res = await POST(upload({ language: 'ka-GE' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ text: 'გამარჯობა', provider: 'gemini', language: 'ka-GE' });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  const [url, init] = fetchSpy.mock.calls[0]! as [string, RequestInit];
  expect(url).toBe(
    'https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/global/publishers/google/models/gemini-3.8-flash:generateContent',
  );
  expect(url).not.toContain('key=');
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer vertex-token');
  expect((init.headers as Record<string, string>)['x-goog-api-key']).toBeUndefined();
  const sent = JSON.parse(String(init.body)) as { contents: Array<{ parts: Array<{ inline_data?: { mime_type: string } }> }> };
  expect(sent.contents[0]!.parts[1]!.inline_data!.mime_type).toBe('audio/wav');
  expect(openaiMock).not.toHaveBeenCalled();
  expect(replicateMock).not.toHaveBeenCalled();
  expect(bookMock).toHaveBeenCalledWith(expect.objectContaining({
    model: 'gemini-3.8-flash', inputTokens: 40, outputTokens: 4, totalTokens: 44, userId: USER_ID,
  }));
});

test('Google-only: a browser WebM is sent as video/webm (best effort); a Gemini 400 → unsupported_format, still 200', async () => {
  fetchSpy.mockImplementationOnce(async () => new Response('Unsupported MIME type', { status: 400 }));
  const res = await POST(upload({ bytes: WEBM, type: 'audio/webm;codecs=opus', language: 'en-US' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ text: '', provider: 'none', code: 'unsupported_format' });
  const sent = JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body)) as { contents: Array<{ parts: Array<{ inline_data?: { mime_type: string } }> }> };
  expect(sent.contents[0]!.parts[1]!.inline_data!.mime_type).toBe('video/webm');
  expect(replicateMock).not.toHaveBeenCalled();
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
  expect(replicateMock).not.toHaveBeenCalled();
});

test('Google-only: Russian speech in a Georgian session is kept as spoken (Cyrillic), and the answer names it', async () => {
  fetchSpy.mockImplementationOnce(async () => geminiOk('привет, как дела'));
  const res = await POST(upload({ language: 'ka-GE' }));
  expect(await res.json()).toEqual({ text: 'привет, как дела', provider: 'gemini', language: 'ru-RU' });
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
  fetchSpy.mockImplementationOnce(async () => geminiOk('hello there'));
  const res = await POST(upload({ language: 'xx-YY' }));
  expect(await res.json()).toEqual({ text: '', provider: 'none' }); // Latin under the ka-GE default is still a miss
});

test('Google-only: a quota outage is an empty transcript with stt_unavailable, never a vendor swap', async () => {
  fetchSpy.mockImplementation(async () => new Response('prepay depleted', { status: 402 }));
  const res = await POST(upload({ language: 'en-US' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ text: '', provider: 'none', code: 'stt_unavailable' });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(openaiMock).not.toHaveBeenCalled();
  expect(replicateMock).not.toHaveBeenCalled();
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
  expect(replicateMock).not.toHaveBeenCalled();
  expect(openaiMock).not.toHaveBeenCalled();
});

test('AI_GOOGLE_ONLY=0 restores the legacy cascade (Georgian → Replicate first)', async () => {
  process.env.AI_GOOGLE_ONLY = '0';
  const res = await POST(upload({ language: 'ka-GE', type: 'audio/webm' }));
  expect(await res.json()).toEqual({ text: 'გამარჯობა replicate', provider: 'replicate-whisper', language: 'ka-GE' });
  expect(replicateMock).toHaveBeenCalledTimes(1);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('AI_GOOGLE_ONLY=0, English: the primary engine answers first', async () => {
  process.env.AI_GOOGLE_ONLY = '0';
  const res = await POST(upload({ language: 'en-US' }));
  expect(await res.json()).toEqual({ text: 'from openai', provider: 'openai', language: 'en-US' });
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

test('empty audio → 400 before any engine', async () => {
  const res = await POST(upload({ bytes: new Uint8Array(0) }));
  expect(res.status).toBe(400);
  expect(fetchSpy).not.toHaveBeenCalled();
});
