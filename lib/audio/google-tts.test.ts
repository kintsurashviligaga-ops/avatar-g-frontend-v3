/** @jest-environment node */
/**
 * google-tts.ts against a scripted global fetch — no network. Cloud TTS runs on the Vertex Workload Identity token
 * (MASTER TASK v3.1 PR 5d): both calls (voices list + synthesize) carry the bearer token ONLY in the Authorization
 * header and never follow a redirect with it, no API key is read or sent (GEMINI_API_KEY and the old TTS keys are set
 * here and must be ignored), and a missing config or token answers null before any request.
 *
 * Cloud TTS lists no ka-GE voice (the production list came back empty), so Georgian is read by Gemini-TTS: one
 * synthesize call naming GEMINI_TTS_MODEL and a prebuilt voice, no voices list. English and Russian keep the best
 * listed voice.
 */
jest.mock('server-only', () => ({}));
jest.mock('../veo/vertexAuth', () => ({
  vertexAiConfig: jest.fn(() => ({ projectId: 'proj-1', location: 'global', auth: { mode: 'wif' } })),
  getVertexAccessToken: jest.fn(async () => 'ya29.test-token'),
}));

import * as tts from './google-tts';
import { getVertexAccessToken, vertexAiConfig } from '../veo/vertexAuth';

type Init = RequestInit & { headers: Record<string, string> };

const KEY_VARS = ['GOOGLE_TTS_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'] as const;
const saved: Record<string, string | undefined> = {};
const realFetch = global.fetch;
const fetchMock = jest.fn();

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const audio = (n = 512, fill = 7) => json(200, { audioContent: Buffer.alloc(n, fill).toString('base64') });
const VOICES = {
  voices: [
    { name: 'en-US-Standard-C', ssmlGender: 'FEMALE', languageCodes: ['en-US'] },
    { name: 'en-US-Chirp3-HD-Leda', ssmlGender: 'FEMALE', languageCodes: ['en-US'] },
    { name: 'en-US-Chirp3-HD-Aoede', ssmlGender: 'FEMALE', languageCodes: ['en-US'] },
    { name: 'en-US-Chirp3-HD-Charon', ssmlGender: 'MALE', languageCodes: ['en-US'] },
  ],
};

beforeEach(() => {
  for (const k of KEY_VARS) { saved[k] = process.env[k]; process.env[k] = `AIza-${k}-should-never-be-sent`; }
  jest.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  // The module memoises the best voices and a refused credential — every test starts fresh.
  tts.__resetGoogleTtsForTests();
});
afterEach(() => {
  global.fetch = realFetch;
  for (const k of KEY_VARS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const noKeyAnywhere = () => {
  for (const [url, init] of fetchMock.mock.calls as [string, Init][]) {
    expect(url).not.toMatch(/[?&]key=/);
    expect(JSON.stringify(init)).not.toMatch(/AIza/);
    expect(Object.keys(init.headers).map((h) => h.toLowerCase())).not.toContain('x-goog-api-key');
  }
};

test('voices list: the bearer token in the Authorization header, no key anywhere, redirect: manual', async () => {
  fetchMock.mockResolvedValueOnce(json(200, VOICES));

  expect(await tts.pickBestGoogleVoice('en-US', 'FEMALE')).toBe('en-US-Chirp3-HD-Aoede');
  const [url, init] = fetchMock.mock.calls[0] as [string, Init];
  expect(url).toBe('https://texttospeech.googleapis.com/v1/voices?languageCode=en-US');
  expect(init.headers.Authorization).toBe('Bearer ya29.test-token');
  expect(init.redirect).toBe('manual');
  expect(getVertexAccessToken).toHaveBeenCalledWith(false);
  noKeyAnywhere();
});

test('synthesize: POST with the bearer token, the best voice for the language and gender, MP3', async () => {
  fetchMock.mockResolvedValueOnce(json(200, VOICES)).mockResolvedValueOnce(audio());

  const out = await tts.synthesizeGoogleTts('hello there', { gender: 'FEMALE' });

  expect(out?.byteLength).toBe(512);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [url, init] = fetchMock.mock.calls[1] as [string, Init];
  expect(url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize');
  expect(init.method).toBe('POST');
  expect(init.headers.Authorization).toBe('Bearer ya29.test-token');
  expect(init.headers['Content-Type']).toBe('application/json');
  expect(init.redirect).toBe('manual');
  const body = JSON.parse(String(init.body));
  expect(body.voice).toEqual({ languageCode: 'en-US', name: 'en-US-Chirp3-HD-Aoede' });
  expect(body.audioConfig).toEqual({ audioEncoding: 'MP3', speakingRate: 1, pitch: 0 });
  noKeyAnywhere();
});

describe('Georgian reads with Gemini-TTS (Cloud TTS lists no ka-GE voice)', () => {
  test('one synthesize call naming the model and a prebuilt voice, MP3 only; no voices list, bearer token only', async () => {
    fetchMock.mockResolvedValueOnce(audio());

    const out = await tts.synthesizeGoogleTts('გამარჯობა', { gender: 'FEMALE' });

    expect(out?.byteLength).toBe(512);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, Init];
    expect(url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer ya29.test-token');
    expect(init.redirect).toBe('manual');
    const body = JSON.parse(String(init.body));
    expect(body.input).toEqual({ text: 'გამარჯობა' });
    expect(body.voice).toEqual({ languageCode: 'ka-GE', name: 'Kore', modelName: 'gemini-2.5-flash-tts' });
    expect(body.audioConfig).toEqual({ audioEncoding: 'MP3' });
    expect(tts.GEMINI_TTS_MODEL).toBe('gemini-2.5-flash-tts');
    noKeyAnywhere();
  });

  test('the declared locale decides, even for Latin text; gender and variant pick the voice, wrapping round', async () => {
    fetchMock.mockImplementation(async () => audio());
    await tts.synthesizeGoogleTts('Gamarjoba', { languageCode: 'ka-GE', gender: 'MALE', variant: 1 });
    await tts.synthesizeGoogleTts('გამარჯობა', { gender: 'MALE', variant: tts.GEMINI_TTS_VOICES.MALE.length });
    await tts.synthesizeGoogleTts('გამარჯობა');
    const voices = (fetchMock.mock.calls as [string, Init][]).map(([, i]) => JSON.parse(String(i.body)).voice);
    expect(voices.map((v) => v.name)).toEqual(['Puck', 'Charon', 'Kore']);
    expect(new Set(voices.map((v) => v.modelName))).toEqual(new Set(['gemini-2.5-flash-tts']));
    expect(tts.readsWithGeminiTts('ka-GE')).toBe(true);
    expect(tts.readsWithGeminiTts('en-US')).toBe(false);
    expect(tts.readsWithGeminiTts('ru-RU')).toBe(false);
  });

  test('a 403 on Gemini-TTS stops Georgian reads only: English still reads with its listed voice', async () => {
    const heard: number[] = [];
    fetchMock.mockResolvedValueOnce(json(403, { error: { message: 'Permission aiplatform.endpoints.predict denied' } }));
    expect(await tts.synthesizeGoogleTts('გამარჯობა', { onRefusal: (s) => heard.push(s) })).toBeNull();
    expect(await tts.synthesizeGoogleTts('გამარჯობა')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(heard).toEqual([403]);

    fetchMock.mockResolvedValueOnce(json(200, VOICES)).mockResolvedValueOnce(audio());
    expect(await tts.synthesizeGoogleTts('hello', { gender: 'FEMALE' })).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('a classic 403 (the API off) stops every read, Georgian included', async () => {
    fetchMock.mockResolvedValueOnce(json(403, {}));
    expect(await tts.synthesizeGoogleTts('hello')).toBeNull();
    expect(await tts.synthesizeGoogleTts('გამარჯობა')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('no Vertex config or no token → null before any request', async () => {
    (vertexAiConfig as jest.Mock).mockReturnValueOnce(null);
    expect(await tts.synthesizeGoogleTts('გამარჯობა')).toBeNull();
    (getVertexAccessToken as jest.Mock).mockRejectedValueOnce(new Error('token_failed'));
    expect(await tts.synthesizeGoogleTts('გამარჯობა')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

test('no Vertex config → null before any request, whatever API keys are set', async () => {
  (vertexAiConfig as jest.Mock).mockReturnValue(null);
  expect(tts.cloudTtsConfigured()).toBe(false);
  expect(await tts.synthesizeGoogleTts('hello')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  (vertexAiConfig as jest.Mock).mockReturnValue({ projectId: 'proj-1', location: 'global', auth: { mode: 'wif' } });
});

test('no token → null before any request', async () => {
  (getVertexAccessToken as jest.Mock).mockRejectedValueOnce(new Error('token_failed'));
  expect(await tts.synthesizeGoogleTts('hello')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test(`a text over GOOGLE_TTS_MAX_CHARS is null before any request (it used to be cut without a word); exactly the limit is read`, async () => {
  expect(await tts.synthesizeGoogleTts('a'.repeat(tts.GOOGLE_TTS_MAX_CHARS + 1), { languageCode: 'en-US' })).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();

  fetchMock.mockImplementation(async (url: string) => (url.includes('/voices') ? json(200, VOICES) : audio()));
  const atLimit = `${'word '.repeat(tts.GOOGLE_TTS_MAX_CHARS / 5 - 1)}ends.`;
  expect(atLimit.length).toBe(tts.GOOGLE_TTS_MAX_CHARS);
  expect(await tts.synthesizeGoogleTts(`  ${atLimit}  `, { languageCode: 'en-US' })).not.toBeNull();
  const read = (fetchMock.mock.calls as [string, Init][])
    .filter(([u]) => u.endsWith(':synthesize'))
    .map(([, i]) => JSON.parse(String(i.body)).input.text as string);
  expect(read.join(' ')).toBe(atLimit);
});

test('a 403 (the API off on the project, or the account not allowed) is heard once, then nothing is asked again', async () => {
  fetchMock.mockResolvedValueOnce(json(403, { error: { message: 'Cloud Text-to-Speech API has not been used in project' } }));
  const heard: number[] = [];

  expect(await tts.synthesizeGoogleTts('hello', { onRefusal: (s) => heard.push(s) })).toBeNull();
  expect(await tts.synthesizeGoogleTts('hello again')).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(heard).toEqual([403]);
  expect(tts.isLastingTtsRefusal(403)).toBe(true);
});

describe('checkCloudTts — the free health check', () => {
  test('ok: the voices list answers on the bearer token only and says Georgian is on Gemini-TTS; nothing is synthesised', async () => {
    fetchMock.mockResolvedValueOnce(json(200, VOICES));
    expect(await tts.checkCloudTts()).toEqual({ state: 'ok', detail: 'Cloud TTS answers (4 en-US voices) · Georgian on gemini-2.5-flash-tts' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, Init];
    expect(url).toBe('https://texttospeech.googleapis.com/v1/voices?languageCode=en-US');
    expect(init.headers.Authorization).toBe('Bearer ya29.test-token');
    expect(init.redirect).toBe('manual');
    noKeyAnywhere();
  });

  test('no config is unconfigured and no token is down, both before any request', async () => {
    (vertexAiConfig as jest.Mock).mockReturnValueOnce(null);
    expect((await tts.checkCloudTts()).state).toBe('unconfigured');
    (getVertexAccessToken as jest.Mock).mockRejectedValueOnce(new Error('token_failed'));
    expect(await tts.checkCloudTts()).toEqual({ state: 'down', detail: 'no Vertex access token' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a refusal is down and says why; it is asked again next time, even after synthesis stopped asking', async () => {
    fetchMock.mockResolvedValue(json(403, {}));
    expect(await tts.synthesizeGoogleTts('hello')).toBeNull(); // the module now remembers the refusal
    const check = await tts.checkCloudTts();
    expect(check.state).toBe('down');
    expect(check.detail).toMatch(/HTTP 403 \(the Cloud Text-to-Speech API is off/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('an empty list is degraded; no answer is down', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { voices: [] }));
    expect(await tts.checkCloudTts()).toEqual({ state: 'degraded', detail: 'the voices list answered with no en-US voice' });
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await tts.checkCloudTts()).toEqual({ state: 'down', detail: 'voices list did not answer' });
  });
});

test('an outage is not remembered: the next request asks again', async () => {
  fetchMock.mockResolvedValueOnce(json(503, {})).mockResolvedValueOnce(json(200, VOICES)).mockResolvedValueOnce(audio());
  const heard: number[] = [];

  expect(await tts.synthesizeGoogleTts('hello', { onRefusal: (s) => heard.push(s) })).toBeNull();
  expect(await tts.synthesizeGoogleTts('hello')).not.toBeNull();
  expect(heard).toEqual([503]);
  expect(tts.isLastingTtsRefusal(503)).toBe(false);
  expect(tts.isLastingTtsRefusal(429)).toBe(false);
});

test('variant picks among the best-tier voices of the gender (wrapping round); the list is asked once', async () => {
  fetchMock.mockResolvedValueOnce(json(200, VOICES));
  expect(await tts.pickBestGoogleVoice('en-US', 'FEMALE', undefined, 0)).toBe('en-US-Chirp3-HD-Aoede');
  expect(await tts.pickBestGoogleVoice('en-US', 'FEMALE', undefined, 1)).toBe('en-US-Chirp3-HD-Leda');
  expect(await tts.pickBestGoogleVoice('en-US', 'FEMALE', undefined, 2)).toBe('en-US-Chirp3-HD-Aoede');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a long Georgian text is read in Gemini-TTS-sized parts in one voice and joined in order; one part missing fails the whole read', async () => {
  const sentence = 'წარმოგიდგენთ ახალ ქართულ სტუდიას, სადაც ერთი ფანჯრიდან ქმნით ვიდეოს, ხმას და მუსიკას.';
  const long = Array.from({ length: 40 }, (_, i) => `${i + 1}. ${sentence}`).join(' ');
  expect(long.length).toBeGreaterThan(tts.GEMINI_TTS_PART_CHARS);
  fetchMock.mockImplementation(async (url: string, init: Init) => {
    if (url.includes('/voices')) return json(200, VOICES);
    const text = JSON.parse(String(init.body)).input.text as string;
    return audio(300 + Math.min(text.length, 100));
  });

  const out = await tts.synthesizeGoogleTts(long, { gender: 'MALE' });
  const parts = (fetchMock.mock.calls as [string, Init][]).filter(([u]) => u.endsWith(':synthesize')).map(([, i]) => JSON.parse(String(i.body)));
  expect(parts.length).toBeGreaterThanOrEqual(2);
  for (const p of parts) {
    expect(p.input.text.length).toBeLessThanOrEqual(tts.GEMINI_TTS_PART_CHARS);
    // Gemini-TTS takes up to 4,000 bytes of text in one call.
    expect(Buffer.byteLength(p.input.text, 'utf8')).toBeLessThanOrEqual(4000);
  }
  expect(parts.map((p) => p.input.text).join(' ')).toBe(long);
  expect(new Set(parts.map((p) => `${p.voice.modelName}/${p.voice.name}`))).toEqual(new Set(['gemini-2.5-flash-tts/Charon']));
  expect((fetchMock.mock.calls as [string][]).some(([u]) => u.includes('/voices'))).toBe(false);
  expect(out?.byteLength).toBe(parts.reduce((n, p) => n + 300 + Math.min(p.input.text.length, 100), 0));

  fetchMock.mockImplementation(async (url: string, init: Init) => {
    if (url.includes('/voices')) return json(200, VOICES);
    return String(init.body).includes('7. ') ? json(500, {}) : audio();
  });
  expect(await tts.synthesizeGoogleTts(long, { gender: 'MALE' })).toBeNull();
});

test('the language: the declared locale, else the script', () => {
  expect(tts.ttsLanguageCode('hello', 'ka')).toBe('ka-GE');
  expect(tts.ttsLanguageCode('გამარჯობა')).toBe('ka-GE');
  expect(tts.ttsLanguageCode('Привет')).toBe('ru-RU');
  expect(tts.ttsLanguageCode('hello')).toBe('en-US');
});
