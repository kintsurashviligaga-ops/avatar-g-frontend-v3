/** @jest-environment node */
/**
 * google-tts.ts against a scripted global fetch — no network. Cloud TTS runs on the Vertex Workload Identity token
 * (MASTER TASK v3.1 PR 5d): both calls (voices list + synthesize) carry the bearer token ONLY in the Authorization
 * header and never follow a redirect with it, no API key is read or sent (GEMINI_API_KEY and the old TTS keys are set
 * here and must be ignored), and a missing config or token answers null before any request.
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
    { name: 'ka-GE-Standard-A', ssmlGender: 'FEMALE', languageCodes: ['ka-GE'] },
    { name: 'ka-GE-Chirp3-HD-Leda', ssmlGender: 'FEMALE', languageCodes: ['ka-GE'] },
    { name: 'ka-GE-Chirp3-HD-Aoede', ssmlGender: 'FEMALE', languageCodes: ['ka-GE'] },
    { name: 'ka-GE-Chirp3-HD-Charon', ssmlGender: 'MALE', languageCodes: ['ka-GE'] },
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

  expect(await tts.pickBestGoogleVoice('ka-GE', 'FEMALE')).toBe('ka-GE-Chirp3-HD-Aoede');
  const [url, init] = fetchMock.mock.calls[0] as [string, Init];
  expect(url).toBe('https://texttospeech.googleapis.com/v1/voices?languageCode=ka-GE');
  expect(init.headers.Authorization).toBe('Bearer ya29.test-token');
  expect(init.redirect).toBe('manual');
  expect(getVertexAccessToken).toHaveBeenCalledWith(false);
  noKeyAnywhere();
});

test('synthesize: POST with the bearer token, the best voice for the language and gender, MP3', async () => {
  fetchMock.mockResolvedValueOnce(json(200, VOICES)).mockResolvedValueOnce(audio());

  const out = await tts.synthesizeGoogleTts('გამარჯობა', { gender: 'FEMALE' });

  expect(out?.byteLength).toBe(512);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [url, init] = fetchMock.mock.calls[1] as [string, Init];
  expect(url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize');
  expect(init.method).toBe('POST');
  expect(init.headers.Authorization).toBe('Bearer ya29.test-token');
  expect(init.headers['Content-Type']).toBe('application/json');
  expect(init.redirect).toBe('manual');
  const body = JSON.parse(String(init.body));
  expect(body.voice).toEqual({ languageCode: 'ka-GE', name: 'ka-GE-Chirp3-HD-Aoede' });
  expect(body.audioConfig).toEqual({ audioEncoding: 'MP3', speakingRate: 0.97, pitch: 0 });
  noKeyAnywhere();
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

test('a 403 (the API off on the project, or the account not allowed) is heard once, then nothing is asked again', async () => {
  fetchMock.mockResolvedValueOnce(json(403, { error: { message: 'Cloud Text-to-Speech API has not been used in project' } }));
  const heard: number[] = [];

  expect(await tts.synthesizeGoogleTts('hello', { onRefusal: (s) => heard.push(s) })).toBeNull();
  expect(await tts.synthesizeGoogleTts('hello again')).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(heard).toEqual([403]);
  expect(tts.isLastingTtsRefusal(403)).toBe(true);
});

test('an outage is not remembered: the next request asks again', async () => {
  fetchMock.mockResolvedValueOnce(json(503, {})).mockResolvedValueOnce(json(200, VOICES)).mockResolvedValueOnce(audio());
  const heard: number[] = [];

  expect(await tts.synthesizeGoogleTts('გამარჯობა', { onRefusal: (s) => heard.push(s) })).toBeNull();
  expect(await tts.synthesizeGoogleTts('გამარჯობა')).not.toBeNull();
  expect(heard).toEqual([503]);
  expect(tts.isLastingTtsRefusal(503)).toBe(false);
  expect(tts.isLastingTtsRefusal(429)).toBe(false);
});

test('variant picks among the best-tier voices of the gender (wrapping round); the list is asked once', async () => {
  fetchMock.mockResolvedValueOnce(json(200, VOICES));
  expect(await tts.pickBestGoogleVoice('ka-GE', 'FEMALE', undefined, 0)).toBe('ka-GE-Chirp3-HD-Aoede');
  expect(await tts.pickBestGoogleVoice('ka-GE', 'FEMALE', undefined, 1)).toBe('ka-GE-Chirp3-HD-Leda');
  expect(await tts.pickBestGoogleVoice('ka-GE', 'FEMALE', undefined, 2)).toBe('ka-GE-Chirp3-HD-Aoede');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a long Georgian text is read in parts in one voice and joined in order; one part missing fails the whole read', async () => {
  const sentence = 'წარმოგიდგენთ ახალ ქართულ სტუდიას, სადაც ერთი ფანჯრიდან ქმნით ვიდეოს, ხმას და მუსიკას.';
  const long = Array.from({ length: 40 }, (_, i) => `${i + 1}. ${sentence}`).join(' ');
  expect(long.length).toBeGreaterThan(tts.GOOGLE_TTS_PART_CHARS);
  fetchMock.mockImplementation(async (url: string, init: Init) => {
    if (url.includes('/voices')) return json(200, VOICES);
    const text = JSON.parse(String(init.body)).input.text as string;
    return audio(300 + Math.min(text.length, 100));
  });

  const out = await tts.synthesizeGoogleTts(long, { gender: 'MALE' });
  const parts = (fetchMock.mock.calls as [string, Init][]).filter(([u]) => u.endsWith(':synthesize')).map(([, i]) => JSON.parse(String(i.body)));
  expect(parts.length).toBeGreaterThanOrEqual(2);
  for (const p of parts) expect(p.input.text.length).toBeLessThanOrEqual(tts.GOOGLE_TTS_PART_CHARS);
  expect(parts.map((p) => p.input.text).join(' ')).toBe(long);
  expect(new Set(parts.map((p) => p.voice.name))).toEqual(new Set(['ka-GE-Chirp3-HD-Charon']));
  expect(out?.byteLength).toBe(parts.length * 400);

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
