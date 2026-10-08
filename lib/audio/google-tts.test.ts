/** @jest-environment node */
/**
 * google-tts.ts against a scripted global fetch — no network. Both Cloud TTS calls (voices list + synthesize) carry
 * the key ONLY in the x-goog-api-key header (never `?key=`: a URL lands in logs, traces and error reports) and never
 * follow a redirect with it; the fail-open behaviour (dead key → no further calls) is unchanged. On the default
 * (Developer API) transport the key is the canonical GEMINI_API_KEY only — MyAvatar v32 retired the old aliases.
 */
jest.mock('server-only', () => ({}));

type GoogleTts = typeof import('./google-tts');
type Init = RequestInit & { headers: Record<string, string> };

const KEY = 'AIza-test-tts-key-0123456789abcdef';
const KEY_VARS = ['GOOGLE_TTS_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_TRANSPORT'] as const;
const saved: Record<string, string | undefined> = {};
const realFetch = global.fetch;
const fetchMock = jest.fn();
let tts: GoogleTts;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const VOICES = {
  voices: [
    { name: 'ka-GE-Standard-A', ssmlGender: 'FEMALE', languageCodes: ['ka-GE'] },
    { name: 'ka-GE-Chirp3-HD-Aoede', ssmlGender: 'FEMALE', languageCodes: ['ka-GE'] },
  ],
};

beforeEach(async () => {
  for (const k of KEY_VARS) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.GEMINI_API_KEY = KEY;
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  // The module memoises the best voice and a dead key — every test starts from a fresh copy.
  jest.resetModules();
  tts = await import('./google-tts');
});
afterEach(() => {
  global.fetch = realFetch;
  for (const k of KEY_VARS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

test('voices list: no key in the URL, the key in the header, redirect: manual', async () => {
  fetchMock.mockResolvedValueOnce(json(200, VOICES));

  expect(await tts.pickBestGoogleVoice('ka-GE', 'FEMALE')).toBe('ka-GE-Chirp3-HD-Aoede');
  const [url, init] = fetchMock.mock.calls[0] as [string, Init];
  expect(url).toBe('https://texttospeech.googleapis.com/v1/voices?languageCode=ka-GE');
  expect(url).not.toMatch(/[?&]key=/);
  expect(url).not.toContain(KEY);
  expect(init.headers['x-goog-api-key']).toBe(KEY);
  expect(init.redirect).toBe('manual');
});

test('synthesize: no key in the URL, the key in the header, redirect: manual', async () => {
  const audio = Buffer.alloc(512, 7);
  fetchMock.mockResolvedValueOnce(json(200, VOICES)).mockResolvedValueOnce(json(200, { audioContent: audio.toString('base64') }));

  const out = await tts.synthesizeGoogleTts('გამარჯობა', { gender: 'FEMALE' });

  expect(out?.byteLength).toBe(512);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [url, init] = fetchMock.mock.calls[1] as [string, Init];
  expect(url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize');
  expect(url).not.toContain(KEY);
  expect(init.method).toBe('POST');
  expect(init.headers['x-goog-api-key']).toBe(KEY);
  expect(init.headers['Content-Type']).toBe('application/json');
  expect(init.redirect).toBe('manual');
  expect(JSON.parse(String(init.body)).voice).toEqual({ languageCode: 'ka-GE', name: 'ka-GE-Chirp3-HD-Aoede' });
  for (const [u] of fetchMock.mock.calls as [string][]) expect(u).not.toMatch(/[?&]key=/);
});

test('unchanged fail-open: a 403 on the voices list marks the key dead and stops further calls', async () => {
  fetchMock.mockResolvedValueOnce(json(403, { error: { message: 'API key not valid' } }));

  expect(await tts.synthesizeGoogleTts('hello')).toBeNull();
  expect(await tts.synthesizeGoogleTts('hello again')).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a deprecated key alias alone is not a credential: nothing is called', async () => {
  delete process.env.GEMINI_API_KEY;
  process.env.GOOGLE_TTS_API_KEY = KEY;
  process.env.GOOGLE_API_KEY = KEY;
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = KEY;

  expect(await tts.pickBestGoogleVoice('ka-GE', 'FEMALE')).toBeNull();
  expect(await tts.synthesizeGoogleTts('hello')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
