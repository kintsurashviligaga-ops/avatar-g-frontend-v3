/** @jest-environment node */
/**
 * lib/voice-v2v/chirpStt — the owner's Chirp 3 dictation trial, with fetch mocked (no network, no spend):
 *   · Speech-to-Text V2 recognize at `us`, the Vertex project, a Workload Identity bearer token and no API key;
 *   · told to expect the site's three languages, the one asked for first; a refused list is asked once with that one;
 *   · an unconfigured Vertex AI, or a clip over a minute, fails before any request;
 *   · the transcript, the language Chirp heard and the billed seconds come back; Google's reason on a refusal.
 */
jest.mock('server-only', () => ({}));

jest.mock('../veo/vertexAuth', () => ({
  ...jest.requireActual('../veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));

import {
  CHIRP_SYNC_MAX_SECONDS,
  chirpCostUsd,
  chirpLanguageCodes,
  durationSeconds,
  transcribeWithChirp,
  wavSeconds,
} from './chirpStt';
import { GeminiSttError } from './geminiStt';

const VERTEX_ENV = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const ENV = { ...process.env };

/** A WAV clip of `seconds` at 16 kHz mono 16-bit (32,000 bytes a second). */
function wav(seconds: number): Uint8Array {
  const data = Math.round(seconds * 32_000);
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + data, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16_000, 24);
  b.writeUInt32LE(32_000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(data, 40);
  return new Uint8Array(b);
}

const recognized = (results: unknown[], billed = '3s') =>
  new Response(JSON.stringify({ results, metadata: { requestId: 'r1', totalBilledDuration: billed } }), { status: 200 });

let fetchSpy: jest.SpyInstance;
const sentBody = (i = 0) => JSON.parse(String((fetchSpy.mock.calls[i]![1] as RequestInit).body)) as {
  config: { autoDecodingConfig: unknown; model: string; languageCodes: string[] };
  content: string;
};

beforeEach(() => {
  Object.assign(process.env, VERTEX_ENV);
  delete process.env.GCP_GEMINI_LOCATION;
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () =>
    recognized([{ alternatives: [{ transcript: 'გამარჯობა' }], languageCode: 'ka-ge' }]));
});

afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

test('the site three languages, the one asked for first; auto and unknown values start with Georgian', () => {
  expect(chirpLanguageCodes('ka-GE')).toEqual(['ka-GE', 'ru-RU', 'en-US']);
  expect(chirpLanguageCodes('ru-RU')).toEqual(['ru-RU', 'ka-GE', 'en-US']);
  expect(chirpLanguageCodes('en-US')).toEqual(['en-US', 'ka-GE', 'ru-RU']);
  expect(chirpLanguageCodes('auto')).toEqual(['ka-GE', 'ru-RU', 'en-US']);
  expect(chirpLanguageCodes('hy-AM')).toEqual(['ka-GE', 'ru-RU', 'en-US']);
});

test('durations, clip lengths and the price', () => {
  expect(durationSeconds('3s')).toBe(3);
  expect(durationSeconds('2.500s')).toBe(2.5);
  expect(durationSeconds('3')).toBeNull();
  expect(durationSeconds(undefined)).toBeNull();
  expect(wavSeconds(wav(2.5))).toBeCloseTo(2.5, 3);
  expect(wavSeconds(new Uint8Array(64))).toBeNull();
  // $0.016 a minute, whole seconds rounded up.
  expect(chirpCostUsd(60)).toBe(0.016);
  expect(chirpCostUsd(2.1)).toBe(Math.round((3 / 60) * 0.016 * 1e6) / 1e6);
  expect(chirpCostUsd(Number.NaN)).toBe(0);
});

test('V2 recognize at `us` on the Vertex project, with the bearer token and no API key', async () => {
  const audio = wav(1);
  const r = await transcribeWithChirp(audio, 'ka-GE');
  expect(r).toEqual({ text: 'გამარჯობა', model: 'chirp_3', spoken: 'ka', billedSeconds: 3 });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  const [url, init] = fetchSpy.mock.calls[0]! as [string, RequestInit];
  expect(url).toBe('https://us-speech.googleapis.com/v2/projects/gen-lang-client-0671348730/locations/us/recognizers/_:recognize');
  expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer vertex-token' });
  expect(init.redirect).toBe('manual');
  expect(sentBody()).toEqual({
    config: { autoDecodingConfig: {}, model: 'chirp_3', languageCodes: ['ka-GE', 'ru-RU', 'en-US'] },
    content: Buffer.from(audio).toString('base64'),
  });
  expect(url).not.toContain('key=');
  expect(String(init.body)).not.toContain('test-gemini-key');
});

test('several result pieces are joined; Russian heard is named; no billed duration falls back to the clip', async () => {
  fetchSpy.mockImplementation(async () => new Response(JSON.stringify({
    results: [
      { alternatives: [{ transcript: ' Привет, ' }], languageCode: 'ru-RU' },
      { alternatives: [{ transcript: 'как дела?' }] },
      { alternatives: [] },
    ],
  }), { status: 200 }));
  const r = await transcribeWithChirp(wav(4), 'ka-GE');
  expect(r.text).toBe('Привет, как дела?');
  expect(r.spoken).toBe('ru');
  expect(r.billedSeconds).toBeCloseTo(4, 3);
});

test('silence is an empty transcript; an unknown length is booked as a full minute (the safe direction)', async () => {
  fetchSpy.mockImplementation(async () => new Response(JSON.stringify({}), { status: 200 }));
  const r = await transcribeWithChirp(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0]), 'ka-GE');
  expect(r).toEqual({ text: '', model: 'chirp_3', billedSeconds: CHIRP_SYNC_MAX_SECONDS });
});

test('a 400 on the three languages is asked once more with the first alone', async () => {
  fetchSpy
    .mockImplementationOnce(async () => new Response(JSON.stringify({ error: { message: 'Invalid language list' } }), { status: 400 }))
    .mockImplementationOnce(async () => recognized([{ alternatives: [{ transcript: 'გამარჯობა' }] }]));
  const r = await transcribeWithChirp(wav(1), 'ka-GE');
  expect(r.text).toBe('გამარჯობა');
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  expect(sentBody(1).config.languageCodes).toEqual(['ka-GE']);
});

test("a refusal carries Google's reason and the status; the API off on the project is an auth miss", async () => {
  fetchSpy.mockImplementation(async () => new Response(JSON.stringify({
    error: { code: 403, message: 'Cloud Speech-to-Text API has not been used in project 467145118875 before or it is disabled.', status: 'PERMISSION_DENIED' },
  }), { status: 403 }));
  const err = await transcribeWithChirp(wav(1), 'ka-GE').catch((e: unknown) => e);
  expect(err).toBeInstanceOf(GeminiSttError);
  expect(err).toMatchObject({
    code: 'auth',
    status: 403,
    model: 'chirp_3',
    message: 'Chirp 3 STT failed (403): Cloud Speech-to-Text API has not been used in project 467145118875 before or it is disabled.',
  });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test('a timeout is a network miss', async () => {
  fetchSpy.mockImplementation(async () => { throw Object.assign(new Error('aborted'), { name: 'TimeoutError' }); });
  await expect(transcribeWithChirp(wav(1), 'ka-GE')).rejects.toMatchObject({ code: 'network', message: 'Chirp 3 network error: TimeoutError' });
});

test('no request at all: Vertex AI unconfigured, or a clip over a minute', async () => {
  await expect(transcribeWithChirp(wav(CHIRP_SYNC_MAX_SECONDS + 1), 'ka-GE')).rejects.toMatchObject({ code: 'bad_request' });
  for (const k of Object.keys(VERTEX_ENV)) delete process.env[k];
  await expect(transcribeWithChirp(wav(1), 'ka-GE')).rejects.toMatchObject({ code: 'auth', message: 'Vertex AI is not configured' });
  expect(fetchSpy).not.toHaveBeenCalled();
});
