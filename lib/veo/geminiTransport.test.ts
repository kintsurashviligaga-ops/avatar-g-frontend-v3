/** @jest-environment node */
/**
 * geminiTransport.ts against a scripted global fetch — no network. Rules under test (docs/VEO_ENGINE.md §5): the
 * submit / poll / download requests, header-only key auth (the key is never in a URL and never sent to another host),
 * the shared failure classification with its no-re-POST guarantee, poll outcomes incl. 404 = expired, and the
 * download's redirect and size rules.
 */
jest.mock('server-only', () => ({}));
jest.mock('@vercel/oidc', () => ({ getVercelOidcToken: jest.fn() }));
jest.mock('google-auth-library', () => ({ ExternalAccountClient: { fromJSON: jest.fn() }, GoogleAuth: jest.fn(), JWT: jest.fn() }));

import { buildGeminiPayload } from './payload';
import {
  downloadGeminiVideo,
  GEMINI_API_BASE,
  GEMINI_DOWNLOAD_TIMEOUT_MS,
  isGeminiOperationName,
  pollGeminiVeo,
  submitGeminiVeo,
} from './geminiTransport';
import type { VeoClipRequest, VeoCreateOutcome } from './types';

const KEY = 'AQ.test-gemini-key-0123456789abcdef';
const MODEL = 'veo-3.1-generate-preview';
const OP = `models/${MODEL}/operations/k3j4h5g6f7d8`;
const FILE_URI = 'https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media';
const REQ: VeoClipRequest = { prompt: 'A red kite over a green hill', aspect: '9:16', durationSec: 8, resolution: '1080p', tier: 'standard', generateAudio: true };

const KEY_VARS = ['GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GOOGLE_GENERATIVE_AI_API_KEY'] as const;
const savedEnv: Record<string, string | undefined> = {};
const fetchMock = jest.fn();
const realFetch = global.fetch;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const googleError = (status: number, message: string, statusText = 'INVALID_ARGUMENT') =>
  json(status, { error: { code: status, message, status: statusText } });
const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });

type FetchInit = RequestInit & { headers?: Record<string, string> };
const call = (i = 0): { url: string; init: FetchInit } => {
  const c = fetchMock.mock.calls[i] as [string, FetchInit];
  return { url: c[0], init: c[1] };
};

beforeAll(() => {
  for (const n of KEY_VARS) savedEnv[n] = process.env[n];
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
  for (const n of KEY_VARS) {
    if (savedEnv[n] === undefined) delete process.env[n];
    else process.env[n] = savedEnv[n];
  }
  global.fetch = realFetch;
});
beforeEach(() => {
  fetchMock.mockReset();
  for (const n of KEY_VARS) delete process.env[n];
  process.env.GEMINI_API_KEY = KEY;
});
afterEach(() => {
  jest.restoreAllMocks();
});

const failed = (o: VeoCreateOutcome) => {
  if (o.ok) throw new Error('expected a failure outcome');
  return o;
};

function expectNoKeyInAnyUrl() {
  for (const c of fetchMock.mock.calls as [string, FetchInit][]) {
    expect(c[0]).not.toContain(KEY);
    expect(c[0]).not.toMatch(/[?&]key=/);
  }
}

// ── submit ──────────────────────────────────────────────────────────────────────────────────────────────────────

describe('submitGeminiVeo', () => {
  it('POSTs the Gemini payload ONCE with the key in the header only, and returns the operation', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { name: OP }));
    const out = await submitGeminiVeo(REQ, { model: MODEL });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = call();
    expect(url).toBe(`${GEMINI_API_BASE}/models/${MODEL}:predictLongRunning`);
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning');
    expect(init.method).toBe('POST');
    expect(init.headers?.['x-goog-api-key']).toBe(KEY);
    expect(init.redirect).toBe('manual');
    expect(JSON.parse(String(init.body))).toStrictEqual(JSON.parse(JSON.stringify(buildGeminiPayload(REQ))));
    expectNoKeyInAnyUrl();
    expect(out).toStrictEqual({ ok: true, operation: { transport: 'gemini', name: OP, model: MODEL } });
  });

  it('never sends Vertex-only fields (generateAudio, storageUri, cameraControl)', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { name: OP }));
    await submitGeminiVeo({ ...REQ, generateAudio: false, enhancePrompt: true }, { model: MODEL });
    const body = JSON.parse(String(call().init.body)) as { parameters: Record<string, unknown> };
    expect(body.parameters).not.toHaveProperty('generateAudio');
    expect(body.parameters).not.toHaveProperty('storageUri');
    expect(body.parameters).not.toHaveProperty('enhancePrompt');
    expect(body.parameters.personGeneration).toBe('allow_all');
  });

  it('rejects deprecated key pools when the canonical key is unset', async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEYS = 'AQ.pool-first, AQ.pool-second';
    fetchMock.mockResolvedValueOnce(json(200, { name: OP }));
    expect(await submitGeminiVeo(REQ, { model: MODEL })).toMatchObject({ ok: false, reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no key → not_configured, nothing sent', async () => {
    delete process.env.GEMINI_API_KEY;
    expect(await submitGeminiVeo(REQ, { model: MODEL })).toMatchObject({ ok: false, reason: 'not_configured', retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses a 30 s deadline by default', async () => {
    const spy = jest.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValueOnce(json(200, { name: OP }));
    await submitGeminiVeo(REQ, { model: MODEL });
    expect(spy).toHaveBeenCalledWith(30_000);
  });

  it.each<[string, number, string, string, boolean]>([
    ['400 → invalid_request', 400, 'durationSeconds out of bound', 'invalid_request', false],
    ['400 safety → safety', 400, 'Your input image contains content that violates our usage guidelines. Support codes: 15236754', 'safety', false],
    ['401 → auth', 401, 'API key not valid', 'auth', false],
    ['400 invalid key → auth (Google sends 400, not 401)', 400, 'INVALID_ARGUMENT: API key not valid. Please pass a valid API key.', 'auth', false],
    ['400 expired key → auth', 400, 'INVALID_ARGUMENT: API key expired. Please renew the API key.', 'auth', false],
    ['403 → auth', 403, 'Permission denied', 'auth', false],
    ['402 → quota', 402, 'Payment required', 'quota', false],
    ['429 → rate_limited', 429, 'You exceeded your current quota, please check your plan and billing details.', 'rate_limited', true],
    ['429 depleted prepay → quota', 429, 'Your prepayment credits are depleted.', 'quota', false],
    ['503 → unavailable', 503, 'The model is overloaded.', 'unavailable', true],
    ['500 → ambiguous', 500, 'Internal error', 'ambiguous', false],
    ['502 → ambiguous', 502, 'Bad gateway', 'ambiguous', false],
    ['504 → ambiguous', 504, 'Deadline exceeded', 'ambiguous', false],
  ])('%s', async (_label, status, message, reason, retryable) => {
    fetchMock.mockResolvedValueOnce(googleError(status, message));
    expect(await submitGeminiVeo(REQ, { model: MODEL })).toMatchObject({ ok: false, reason, retryable, status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a timed-out submit is ambiguous and was POSTed exactly once', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    expect(await submitGeminiVeo(REQ, { model: MODEL })).toMatchObject({ ok: false, reason: 'ambiguous', retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a hung submit cut by the real deadline — still one POST', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
    );
    expect(await submitGeminiVeo(REQ, { model: MODEL, timeoutMs: 25 })).toMatchObject({ reason: 'ambiguous', retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('an error body echoing the key never carries it into the detail', async () => {
    fetchMock.mockResolvedValueOnce(googleError(400, `API key ${KEY} is not valid for this model`));
    const out = failed(await submitGeminiVeo(REQ, { model: MODEL }));
    expect(out.detail).not.toContain(KEY);
    expect(out.detail).toContain('[redacted]');
  });

  it('a 2xx without a Gemini operation name is ambiguous', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { name: 'projects/p/locations/l/publishers/google/models/m/operations/1' }));
    expect(await submitGeminiVeo(REQ, { model: MODEL })).toMatchObject({ ok: false, reason: 'ambiguous', retryable: false, status: 200 });
    fetchMock.mockResolvedValueOnce(json(200, {}));
    expect(await submitGeminiVeo(REQ, { model: MODEL })).toMatchObject({ ok: false, reason: 'ambiguous' });
  });

  it('gcs or url media → invalid_request before any request (the Gemini API reads inline bytes only)', async () => {
    const gcs = failed(await submitGeminiVeo({ ...REQ, startImage: { kind: 'gcs', uri: 'gs://b/o.png', mimeType: 'image/png' } }, { model: MODEL }));
    expect(gcs.reason).toBe('invalid_request');
    expect(gcs.detail).toMatch(/^startImage:/);
    const url = failed(await submitGeminiVeo({ ...REQ, startImage: { kind: 'url', url: 'https://cdn.example/a.png' } }, { model: MODEL }));
    expect(url.reason).toBe('invalid_request');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an implausible model id → invalid_request (it would be spliced into the URL)', async () => {
    expect(await submitGeminiVeo(REQ, { model: 'veo/../../files' })).toMatchObject({ ok: false, reason: 'invalid_request' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── poll ────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('pollGeminiVeo', () => {
  it('GETs /v1beta/{operation} with the key header only', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { name: OP, done: false }));
    expect(await pollGeminiVeo(OP)).toStrictEqual({ state: 'processing' });
    const { url, init } = call();
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/${OP}`);
    expect(init.method).toBeUndefined();
    expect(init.headers?.['x-goog-api-key']).toBe(KEY);
    expect(init.redirect).toBe('manual');
    expectNoKeyInAnyUrl();
  });

  it('uses a 15 s deadline', async () => {
    const spy = jest.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValueOnce(json(200, { done: false }));
    await pollGeminiVeo(OP);
    expect(spy).toHaveBeenCalledWith(15_000);
  });

  it('generatedSamples[].video.uri → succeeded with gemini-file videos', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, {
        done: true,
        response: { generateVideoResponse: { generatedSamples: [{ video: { uri: FILE_URI } }, { video: { uri: FILE_URI, mimeType: 'video/webm' } }] } },
      }),
    );
    expect(await pollGeminiVeo(OP)).toStrictEqual({
      state: 'succeeded',
      videos: [
        { kind: 'gemini-file', uri: FILE_URI, mimeType: 'video/mp4' },
        { kind: 'gemini-file', uri: FILE_URI, mimeType: 'video/webm' },
      ],
    });
  });

  it('falls back to response.videos[].uri', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { done: true, response: { videos: [{ uri: FILE_URI }] } }));
    expect(await pollGeminiVeo(OP)).toStrictEqual({ state: 'succeeded', videos: [{ kind: 'gemini-file', uri: FILE_URI, mimeType: 'video/mp4' }] });
  });

  it('a non-https uri is not a deliverable video', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'gs://x/y.mp4' } }] } } }));
    expect(await pollGeminiVeo(OP)).toMatchObject({ state: 'failed' });
  });

  it('raiMediaFilteredCount / raiMediaFilteredReasons → filtered with the support codes', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, {
        done: true,
        response: {
          generateVideoResponse: {
            raiMediaFilteredCount: 1,
            raiMediaFilteredReasons: ["We couldn't generate this video because it may violate our policies. Support codes: 58061214"],
          },
        },
      }),
    );
    expect(await pollGeminiVeo(OP)).toStrictEqual({
      state: 'filtered',
      reason: "We couldn't generate this video because it may violate our policies. Support codes: 58061214",
      supportCodes: ['58061214'],
    });
  });

  it('done + a safety error → filtered; done + another error → failed', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { done: true, error: { code: 3, message: 'Blocked by Responsible AI. Support codes: 29310472' } }));
    expect(await pollGeminiVeo(OP)).toMatchObject({ state: 'filtered', supportCodes: ['29310472'] });
    fetchMock.mockResolvedValueOnce(json(200, { done: true, error: { code: 13, message: 'Video generation failed' } }));
    expect(await pollGeminiVeo(OP)).toStrictEqual({ state: 'failed', reason: 'Video generation failed', code: 13 });
  });

  it('HTTP 404 → failed: the operation expired (2-day retention) or is unknown', async () => {
    fetchMock.mockResolvedValueOnce(googleError(404, 'Operation not found', 'NOT_FOUND'));
    expect(await pollGeminiVeo(OP)).toStrictEqual({ state: 'failed', reason: 'operation expired or unknown', code: 404 });
  });

  it.each<[string, () => Promise<Response>]>([
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
    ['a timeout', () => Promise.reject(new DOMException('timeout', 'TimeoutError'))],
    ['HTTP 500', () => Promise.resolve(googleError(500, 'internal'))],
    ['HTTP 503', () => Promise.resolve(googleError(503, 'overloaded'))],
    ['HTTP 429', () => Promise.resolve(googleError(429, 'quota'))],
    ['HTTP 403', () => Promise.resolve(googleError(403, 'denied'))],
    ['an unreadable body', () => Promise.resolve(new Response('<html>', { status: 200 }))],
  ])('%s → processing', async (_label, respond) => {
    fetchMock.mockImplementationOnce(respond);
    expect(await pollGeminiVeo(OP)).toStrictEqual({ state: 'processing' });
  });

  it.each([
    'projects/p/locations/us-central1/publishers/google/models/m/operations/1',
    'models/veo/operations/../../files/secret',
    `${OP}?alt=json`,
    '',
  ])('%j is not a Gemini operation → failed, nothing sent', async (name) => {
    expect(await pollGeminiVeo(name)).toMatchObject({ state: 'failed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no key → failed', async () => {
    delete process.env.GEMINI_API_KEY;
    expect(await pollGeminiVeo(OP)).toMatchObject({ state: 'failed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('isGeminiOperationName', () => {
    expect(isGeminiOperationName(OP)).toBe(true);
    expect(isGeminiOperationName(`  ${OP} `)).toBe(true);
    expect(isGeminiOperationName('models//operations/x')).toBe(false);
    expect(isGeminiOperationName(null)).toBe(false);
  });
});

// ── download ────────────────────────────────────────────────────────────────────────────────────────────────────

describe('downloadGeminiVideo', () => {
  const MP4 = Buffer.from('....ftypmp42 fake video bytes');
  const video = (bytes: Buffer = MP4, headers: Record<string, string> = {}) =>
    new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'video/mp4', ...headers } });

  it('downloads with the key header (never ?key=) under a 60 s deadline', async () => {
    const spy = jest.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValueOnce(video());
    const buf = await downloadGeminiVideo(FILE_URI);
    expect(buf?.equals(MP4)).toBe(true);
    expect(call().url).toBe(FILE_URI);
    expect(call().init.headers?.['x-goog-api-key']).toBe(KEY);
    expect(call().init.redirect).toBe('manual');
    expect(GEMINI_DOWNLOAD_TIMEOUT_MS).toBe(60_000);
    expect(spy).toHaveBeenCalledWith(60_000);
    expectNoKeyInAnyUrl();
  });

  it.each([
    'https://evil.example/v1beta/files/abc:download?alt=media',
    'http://generativelanguage.googleapis.com/v1beta/files/abc:download',
    'https://generativelanguage.googleapis.com.evil.example/x',
    'not a url',
    '',
  ])('%j is refused before any request (the key goes to Google only)', async (uri) => {
    expect(await downloadGeminiVideo(uri)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('follows a same-host redirect with the key', async () => {
    fetchMock.mockResolvedValueOnce(redirect('/v1beta/files/abc123:download?alt=media&x=1')).mockResolvedValueOnce(video());
    expect(await downloadGeminiVideo(FILE_URI)).not.toBeNull();
    expect(call(1).url).toBe('https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media&x=1');
    expect(call(1).init.headers?.['x-goog-api-key']).toBe(KEY);
  });

  it('follows a redirect to a Google content host WITHOUT the key', async () => {
    fetchMock.mockResolvedValueOnce(redirect('https://video-downloads.googleusercontent.com/abc?sig=1')).mockResolvedValueOnce(video());
    expect(await downloadGeminiVideo(FILE_URI)).not.toBeNull();
    expect(call(1).url).toBe('https://video-downloads.googleusercontent.com/abc?sig=1');
    expect(call(1).init.headers).toBeUndefined();
  });

  it.each(['https://evil.example/steal', 'http://storage.googleapis.com/x', 'https://169.254.169.254/latest'])(
    'refuses a redirect to %s',
    async (location) => {
      fetchMock.mockResolvedValueOnce(redirect(location));
      expect(await downloadGeminiVideo(FILE_URI)).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('gives up after 3 redirects', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(redirect('/v1beta/files/loop')));
    expect(await downloadGeminiVideo(FILE_URI)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('a redirect without a Location → null', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302 }));
    expect(await downloadGeminiVideo(FILE_URI)).toBeNull();
  });

  it.each<[string, () => Promise<Response>]>([
    ['HTTP 403', () => Promise.resolve(googleError(403, 'denied'))],
    ['HTTP 404', () => Promise.resolve(googleError(404, 'gone'))],
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
    ['an empty body', () => Promise.resolve(video(Buffer.alloc(0)))],
  ])('%s → null', async (_label, respond) => {
    fetchMock.mockImplementationOnce(respond);
    expect(await downloadGeminiVideo(FILE_URI)).toBeNull();
  });

  it('a body over the cap → null', async () => {
    fetchMock.mockResolvedValueOnce(video(Buffer.alloc(64, 1)));
    expect(await downloadGeminiVideo(FILE_URI, { maxBytes: 32 })).toBeNull();
  });

  it('no key → null, nothing sent', async () => {
    delete process.env.GEMINI_API_KEY;
    expect(await downloadGeminiVideo(FILE_URI)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
