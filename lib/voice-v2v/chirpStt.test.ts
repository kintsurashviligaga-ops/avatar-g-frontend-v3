/** @jest-environment node */
/**
 * lib/voice-v2v/chirpStt — the owner's Chirp 3 dictation trial, with fetch mocked (no network, no spend):
 *   · Speech-to-Text V2 recognize at `us`, the Vertex project, a Workload Identity bearer token and no API key;
 *   · told to expect the site's three languages, the one asked for first, and at the same time Georgian alone: Cyrillic
 *     or Latin from the first is kept, else Georgian letters from the second; a script outside the three is dropped
 *     (Georgian once came back in Devanagari, GG 2026-10-31), and Latin that is not words is not English (once
 *     „G 7 6 0 0 0 0 0“); a clear Russian or English answer does not wait for Georgian alone; a refused list is asked
 *     once with its first language;
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
  chirpListedDecisive,
  chirpScript,
  chirpWordLike,
  durationSeconds,
  pickChirpLeg,
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

const LISTED = ['ka-GE', 'ru-RU', 'en-US'];
const GEORGIAN_ONLY = ['ka-GE'];
/** Answers by the languages a request lists (the two requests run at the same time). */
function byCodes(answer: (codes: string[]) => Response | Promise<Response>) {
  fetchSpy.mockImplementation(async (_url: unknown, init?: RequestInit) =>
    answer((JSON.parse(String(init?.body)) as { config: { languageCodes: string[] } }).config.languageCodes));
}
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const refused = (status: number, message: string) => new Response(JSON.stringify({ error: { message } }), { status });

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

test('V2 recognize at `us` on the Vertex project, with the bearer token and no API key; the listed and Georgian-only requests', async () => {
  const audio = wav(1);
  const r = await transcribeWithChirp(audio, 'ka-GE');
  // Georgian letters from both: the Georgian-only request's answer is kept. Both requests are billed.
  expect(r).toEqual({ text: 'გამარჯობა', model: 'chirp_3', spoken: 'ka', billedSeconds: 6, leg: 'georgian' });
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  for (const [i, codes] of [LISTED, GEORGIAN_ONLY].entries()) {
    const [url, init] = fetchSpy.mock.calls[i]! as [string, RequestInit];
    expect(url).toBe('https://us-speech.googleapis.com/v2/projects/gen-lang-client-0671348730/locations/us/recognizers/_:recognize');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer vertex-token' });
    expect(init.redirect).toBe('manual');
    expect(sentBody(i)).toEqual({
      config: { autoDecodingConfig: {}, model: 'chirp_3', languageCodes: codes },
      content: Buffer.from(audio).toString('base64'),
    });
    expect(url).not.toContain('key=');
    expect(String(init.body)).not.toContain('test-gemini-key');
  }
});

test('several result pieces are joined; Russian heard is named and kept over the Georgian-only request; no billed duration falls back to the clip', async () => {
  byCodes((codes) => new Response(JSON.stringify({
    results: same(codes, GEORGIAN_ONLY)
      // Georgian alone writes Russian speech in Georgian letters: never kept over the Cyrillic.
      ? [{ alternatives: [{ transcript: 'პრივეტ კაკ დელა' }], languageCode: 'ka-GE' }]
      : [
        { alternatives: [{ transcript: ' Привет, ' }], languageCode: 'ru-RU' },
        { alternatives: [{ transcript: 'как дела?' }] },
        { alternatives: [] },
      ],
  }), { status: 200 }));
  const r = await transcribeWithChirp(wav(4), 'en-US');
  expect(r.text).toBe('Привет, как дела?');
  expect(r.spoken).toBe('ru');
  expect(r.leg).toBe('listed');
  // 4 s each, rounded up per request.
  expect(r.billedSeconds).toBe(8);
  expect(sentBody(0).config.languageCodes).toEqual(['en-US', 'ka-GE', 'ru-RU']);
});

test('English heard on the listed request is kept', async () => {
  byCodes((codes) => same(codes, GEORGIAN_ONLY)
    ? recognized([{ alternatives: [{ transcript: 'ქენ იუ ჰიარ მი' }], languageCode: 'ka-GE' }])
    : recognized([{ alternatives: [{ transcript: 'Can you hear me?' }], languageCode: 'en-US' }]));
  const r = await transcribeWithChirp(wav(2), 'en-US');
  expect(r).toMatchObject({ text: 'Can you hear me?', spoken: 'en', leg: 'listed' });
});

test('GG 2026-10-31: Georgian speech came back in Devanagari on the listed request; the Georgian-only answer is written', async () => {
  byCodes((codes) => same(codes, GEORGIAN_ONLY)
    ? recognized([{ alternatives: [{ transcript: 'გესმის ჩემი?' }], languageCode: 'ka-GE' }])
    : recognized([{ alternatives: [{ transcript: 'चमेली के इसमें' }], languageCode: 'hi-IN' }]));
  const r = await transcribeWithChirp(wav(2), 'en-US');
  expect(r).toEqual({ text: 'გესმის ჩემი?', model: 'chirp_3', spoken: 'ka', billedSeconds: 6, leg: 'georgian' });
});

test('GG 2026-10-31 11:58Z: Georgian speech came back as Latin noise on the listed request; the Georgian-only answer is written', async () => {
  byCodes((codes) => same(codes, GEORGIAN_ONLY)
    ? recognized([{ alternatives: [{ transcript: 'გესმის ჩემი?' }], languageCode: 'ka-GE' }])
    : recognized([{ alternatives: [{ transcript: 'G 7 6 0 0 0 0 0' }], languageCode: 'en-US' }]));
  const r = await transcribeWithChirp(wav(2), 'ka-GE');
  expect(r).toEqual({ text: 'გესმის ჩემი?', model: 'chirp_3', spoken: 'ka', billedSeconds: 6, leg: 'georgian' });
});

test('Latin noise with nothing better is never written; English words Chirp calls Georgian wait for Georgian alone', async () => {
  byCodes((codes) => same(codes, GEORGIAN_ONLY)
    ? refused(500, 'Internal error')
    : recognized([{ alternatives: [{ transcript: 'G 7 6 0 0 0 0 0' }], languageCode: 'en-US' }]));
  let r = await transcribeWithChirp(wav(2), 'ka-GE');
  expect(r).toEqual({ text: '', model: 'chirp_3', billedSeconds: 3, leg: 'listed', foreign: 'en-US' });

  byCodes((codes) => same(codes, GEORGIAN_ONLY)
    ? recognized([{ alternatives: [{ transcript: 'გამარჯობა' }], languageCode: 'ka-GE' }])
    : recognized([{ alternatives: [{ transcript: 'Gamarjoba' }], languageCode: 'ka-GE' }]));
  r = await transcribeWithChirp(wav(1), 'ka-GE');
  expect(r).toMatchObject({ text: 'გამარჯობა', leg: 'georgian', billedSeconds: 6 });
});

test('a clear Russian or English answer is written without waiting for Georgian alone, booked as both requests', async () => {
  let fetchedGeorgianOnly = false;
  byCodes((codes) => {
    if (!same(codes, GEORGIAN_ONLY)) return recognized([{ alternatives: [{ transcript: 'Can you hear me?' }], languageCode: 'en-US' }], '2s');
    fetchedGeorgianOnly = true;
    return new Promise<Response>(() => undefined); // never answers
  });
  const r = await transcribeWithChirp(wav(2), 'en-US');
  expect(r).toEqual({ text: 'Can you hear me?', model: 'chirp_3', spoken: 'en', billedSeconds: 4, leg: 'listed' });
  expect(fetchedGeorgianOnly).toBe(true);

  // A refusal of the Georgian-only request that is no longer waited for is not an unhandled rejection.
  byCodes((codes) => same(codes, GEORGIAN_ONLY)
    ? refused(503, 'Service unavailable')
    : recognized([{ alternatives: [{ transcript: 'Ты меня слышишь?' }], languageCode: 'ru-RU' }]));
  await expect(transcribeWithChirp(wav(1), 'ru-RU')).resolves.toMatchObject({ text: 'Ты меня слышишь?', leg: 'listed', billedSeconds: 6 });
});

test('a foreign script with no Georgian answer to stand in is never written; what was heard is named', async () => {
  byCodes((codes) => same(codes, GEORGIAN_ONLY)
    ? refused(500, 'Internal error')
    : recognized([{ alternatives: [{ transcript: 'चमेली के इसमें' }], languageCode: 'hi-IN' }]));
  const r = await transcribeWithChirp(wav(2), 'ka-GE');
  expect(r).toEqual({ text: '', model: 'chirp_3', billedSeconds: 3, leg: 'listed', foreign: 'hi-IN' });
});

test('the listed request failing: the Georgian-only answer stands alone', async () => {
  byCodes((codes) => same(codes, GEORGIAN_ONLY)
    ? recognized([{ alternatives: [{ transcript: 'გამარჯობა' }], languageCode: 'ka-GE' }])
    : refused(503, 'Service unavailable'));
  const r = await transcribeWithChirp(wav(1), 'ka-GE');
  expect(r).toMatchObject({ text: 'გამარჯობა', leg: 'georgian', billedSeconds: 3 });
});

test('silence is an empty transcript; an unknown length is booked as a full minute per request (the safe direction)', async () => {
  fetchSpy.mockImplementation(async () => new Response(JSON.stringify({}), { status: 200 }));
  const r = await transcribeWithChirp(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0]), 'ka-GE');
  expect(r).toEqual({ text: '', model: 'chirp_3', billedSeconds: 2 * CHIRP_SYNC_MAX_SECONDS, leg: 'listed' });
});

test('a 400 on the listed languages: Georgian first is answered by the Georgian-only request; another first is asked alone once', async () => {
  byCodes((codes) => codes.length === 3
    ? refused(400, 'Invalid language list')
    : recognized([{ alternatives: [{ transcript: same(codes, GEORGIAN_ONLY) ? 'გამარჯობა' : 'Привет' }], languageCode: codes[0] }]));
  let r = await transcribeWithChirp(wav(1), 'ka-GE');
  expect(r).toMatchObject({ text: 'გამარჯობა', leg: 'georgian', billedSeconds: 3 });
  expect(fetchSpy).toHaveBeenCalledTimes(2);

  fetchSpy.mockClear();
  r = await transcribeWithChirp(wav(1), 'ru-RU');
  expect(r).toMatchObject({ text: 'Привет', leg: 'listed', spoken: 'ru', billedSeconds: 6 });
  expect(fetchSpy).toHaveBeenCalledTimes(3);
  expect(fetchSpy.mock.calls.map((_, i) => sentBody(i).config.languageCodes)).toEqual(
    expect.arrayContaining([['ru-RU', 'ka-GE', 'en-US'], ['ka-GE'], ['ru-RU']]));
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
  expect(fetchSpy).toHaveBeenCalledTimes(2);
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

test('which script a transcript is in', () => {
  expect(chirpScript('გამარჯობა, Instagram')).toBe('georgian');
  expect(chirpScript('Привет, как дела?')).toBe('cyrillic');
  expect(chirpScript('Can you hear me?')).toBe('latin');
  expect(chirpScript('Ça va? Größe')).toBe('latin');
  expect(chirpScript('चमेली के इसमें')).toBe('other');
  expect(chirpScript('Բարև ձեզ')).toBe('other');
  expect(chirpScript('… 123 ?')).toBe('none');
  expect(chirpScript('')).toBe('none');
});

test('Latin that reads as words, and when the listed answer is final', () => {
  expect(chirpWordLike('Can you hear me?')).toBe(true);
  expect(chirpWordLike('Meet at 5')).toBe(true);
  expect(chirpWordLike('OK')).toBe(true);
  expect(chirpWordLike('G 7 6 0 0 0 0 0')).toBe(false);
  expect(chirpWordLike('a b c d')).toBe(false);
  expect(chirpWordLike('')).toBe(false);
  const a = (text: string, heard?: string) => ({ text, billedSeconds: 1, ...(heard ? { heard } : {}) });
  expect(chirpListedDecisive(a('Привет', 'ka-GE'))).toBe(true);
  expect(chirpListedDecisive(a('Hello there', 'en-US'))).toBe(true);
  expect(chirpListedDecisive(a('Hello there'))).toBe(true);
  expect(chirpListedDecisive(a('Gamarjoba', 'ka-ge'))).toBe(false);
  expect(chirpListedDecisive(a('G 7 6 0 0 0 0 0', 'en-US'))).toBe(false);
  expect(chirpListedDecisive(a('გამარჯობა'))).toBe(false);
  expect(chirpListedDecisive(a(''))).toBe(false);
});

test('pickChirpLeg: Russian/English from the list, else Georgian letters from Georgian alone, never a foreign script', () => {
  const a = (text: string, heard?: string) => ({ text, billedSeconds: 1, ...(heard ? { heard, spoken: heard.slice(0, 2) } : {}) });
  expect(pickChirpLeg(a('Привет'), a('პრივეტ'))).toMatchObject({ leg: 'listed', answer: { text: 'Привет' } });
  expect(pickChirpLeg(a('Hello'), a('ჰელო'))).toMatchObject({ leg: 'listed', answer: { text: 'Hello' } });
  expect(pickChirpLeg(a('გამარჯობა'), a('გამარჯობათ'))).toMatchObject({ leg: 'georgian', answer: { text: 'გამარჯობათ' } });
  expect(pickChirpLeg(a('गामार'), a('გამარჯობა'))).toMatchObject({ leg: 'georgian', answer: { text: 'გამარჯობა' } });
  expect(pickChirpLeg(a('გამარჯობა'), undefined)).toMatchObject({ leg: 'listed', answer: { text: 'გამარჯობა' } });
  expect(pickChirpLeg(a(''), a(''))).toMatchObject({ leg: 'listed', answer: { text: '' } });
  expect(pickChirpLeg(undefined, a('გამარჯობა'))).toMatchObject({ leg: 'georgian' });
  // A foreign script with nothing better: nothing is written, and what was heard is named.
  expect(pickChirpLeg(a('चमेली', 'hi-IN'), a('Բարև'))).toEqual({
    leg: 'listed', answer: { text: '', billedSeconds: 1, heard: 'hi-IN', spoken: undefined }, foreign: 'hi-IN',
  });
  expect(pickChirpLeg(a('चमेली'), a(''))).toMatchObject({ answer: { text: '' }, foreign: 'other script' });
  // Latin noise: the Georgian answer when there is one, else nothing (GG 2026-10-31 11:58Z).
  expect(pickChirpLeg(a('G 7 6 0 0 0 0 0', 'en-US'), a('გესმის ჩემი?'))).toMatchObject({ leg: 'georgian', answer: { text: 'გესმის ჩემი?' } });
  expect(pickChirpLeg(a('G 7 6 0 0 0 0 0', 'en-US'), a('7 6'))).toMatchObject({ answer: { text: '' }, foreign: 'en-US' });
  expect(pickChirpLeg(undefined, a('G 7 6 0 0 0 0 0'))).toMatchObject({ answer: { text: '' }, foreign: 'other script' });
  expect(pickChirpLeg(undefined, undefined)).toBeNull();
});
