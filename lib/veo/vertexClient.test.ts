/** @jest-environment node */
/**
 * vertexClient.ts against a scripted global fetch and a mocked access token — no network. Rules under test
 * (docs/VEO_ENGINE.md §5): the predictLongRunning / fetchPredictOperation URLs and bodies, the failure
 * classification (and that NOTHING re-POSTs a submit), local refusals that never reach the network, the poll
 * outcomes (processing / succeeded / filtered / failed), and that the token never leaves the Authorization header.
 */
jest.mock('server-only', () => ({}));
jest.mock('@vercel/oidc', () => ({ getVercelOidcToken: jest.fn() }));
jest.mock('google-auth-library', () => ({ ExternalAccountClient: { fromJSON: jest.fn() }, GoogleAuth: jest.fn(), JWT: jest.fn() }));
jest.mock('./vertexAuth', () => ({
  ...jest.requireActual<typeof import('./vertexAuth')>('./vertexAuth'),
  getVertexAccessToken: jest.fn(),
}));

import { buildVertexPayload } from './payload';
import { getVertexAccessToken, VertexAuthError } from './vertexAuth';
import {
  classifySubmitHttpFailure,
  finishedOperationOutcome,
  isBillingWording,
  isSafetyWording,
  parseVertexOperationName,
  pollVertexVeo,
  submitVertexVeo,
  supportCodesIn,
  VEO_POLL_TIMEOUT_MS,
  VEO_SUBMIT_TIMEOUT_MS,
} from './vertexClient';
import type { VeoClipRequest, VeoCreateOutcome, VertexConfig } from './types';

const tokenMock = getVertexAccessToken as jest.MockedFunction<typeof getVertexAccessToken>;
const fetchMock = jest.fn();
const realFetch = global.fetch;

const TOKEN = 'ya29.a0AfB-test-access-token-value';
const MODEL = 'veo-3.1-generate-001';
const CFG: VertexConfig = {
  projectId: 'my-proj',
  location: 'us-central1',
  bucket: 'gs://my-bucket/veo',
  auth: { mode: 'service_account_key', clientEmail: 'veo@my-proj.iam.gserviceaccount.com' },
};
const OP = `projects/my-proj/locations/us-central1/publishers/google/models/${MODEL}/operations/0f8a1b2c-3d4e-5f60-7182-93a4b5c6d7e8`;
const PREFIX = 'gs://my-bucket/veo/veo/s1/0-abcd1234/';
const SUBMIT_URL = `https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/${MODEL}:predictLongRunning`;
const POLL_URL = `https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/${MODEL}:fetchPredictOperation`;
const REQ: VeoClipRequest = { prompt: 'A lighthouse at dusk, waves below', aspect: '16:9', durationSec: 8, resolution: '1080p', tier: 'standard', generateAudio: true };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const googleError = (status: number, message: string, statusText = 'INVALID_ARGUMENT') =>
  json(status, { error: { code: status, message, status: statusText } });

type FetchInit = RequestInit & { headers: Record<string, string> };
const call = (i = 0): { url: string; init: FetchInit } => {
  const c = fetchMock.mock.calls[i] as [string, FetchInit];
  return { url: c[0], init: c[1] };
};
const sentBody = (i = 0): unknown => JSON.parse(String(call(i).init.body));

beforeAll(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = realFetch;
});
beforeEach(() => {
  fetchMock.mockReset();
  tokenMock.mockReset();
  tokenMock.mockResolvedValue(TOKEN);
  delete process.env.VEO_VERTEX_PERSON_GENERATION;
});
afterEach(() => {
  jest.restoreAllMocks();
});

const failed = (o: VeoCreateOutcome) => {
  if (o.ok) throw new Error('expected a failure outcome');
  return o;
};

// ── submit ──────────────────────────────────────────────────────────────────────────────────────────────────────

describe('submitVertexVeo — the request', () => {
  it('POSTs the Vertex payload ONCE to predictLongRunning with the bearer token, and returns the operation', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { name: OP }));
    const out = await submitVertexVeo(REQ, CFG, { model: MODEL, storageUri: PREFIX });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = call();
    expect(url).toBe(SUBMIT_URL);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.headers['Content-Type']).toMatch(/^application\/json/);
    expect(init.redirect).toBe('manual');
    expect(sentBody()).toStrictEqual(JSON.parse(JSON.stringify(buildVertexPayload(REQ, { storageUri: PREFIX }))));
    expect(out).toStrictEqual({ ok: true, operation: { transport: 'vertex', name: OP, model: MODEL, outputPrefix: PREFIX } });
  });

  it('without a storageUri there is no outputPrefix and no storageUri in the body (bytes come back inline)', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { name: OP }));
    const out = await submitVertexVeo(REQ, CFG, { model: MODEL });
    expect(out).toStrictEqual({ ok: true, operation: { transport: 'vertex', name: OP, model: MODEL } });
    expect((sentBody() as { parameters: Record<string, unknown> }).parameters).not.toHaveProperty('storageUri');
  });

  it('builds the host and path from the config location and project', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { name: OP.replace(/us-central1/g, 'europe-west4') }));
    await submitVertexVeo(REQ, { ...CFG, location: 'europe-west4', projectId: 'other-proj' }, { model: MODEL });
    expect(call().url).toBe(
      `https://europe-west4-aiplatform.googleapis.com/v1/projects/other-proj/locations/europe-west4/publishers/google/models/${MODEL}:predictLongRunning`,
    );
  });

  describe('personGeneration', () => {
    const personGeneration = () => (sentBody() as { parameters: { personGeneration: string } }).parameters.personGeneration;
    beforeEach(() => fetchMock.mockResolvedValue(json(200, { name: OP })));

    it('defaults to allow_adult', async () => {
      await submitVertexVeo(REQ, CFG, { model: MODEL });
      expect(personGeneration()).toBe('allow_adult');
    });
    it('reads VEO_VERTEX_PERSON_GENERATION', async () => {
      process.env.VEO_VERTEX_PERSON_GENERATION = ' ALLOW_ALL ';
      await submitVertexVeo(REQ, CFG, { model: MODEL });
      expect(personGeneration()).toBe('allow_all');
    });
    it('ignores an invalid env value', async () => {
      process.env.VEO_VERTEX_PERSON_GENERATION = 'everyone';
      await submitVertexVeo(REQ, CFG, { model: MODEL });
      expect(personGeneration()).toBe('allow_adult');
    });
    it('opts beat the env, and the request itself beats both', async () => {
      process.env.VEO_VERTEX_PERSON_GENERATION = 'allow_all';
      await submitVertexVeo(REQ, CFG, { model: MODEL, personGeneration: 'dont_allow' });
      expect(personGeneration()).toBe('dont_allow');
      await submitVertexVeo({ ...REQ, personGeneration: 'allow_adult' }, CFG, { model: MODEL, personGeneration: 'dont_allow' });
      expect((sentBody(1) as { parameters: { personGeneration: string } }).parameters.personGeneration).toBe('allow_adult');
    });
  });

  it('uses a 30 s deadline by default, honours a positive timeoutMs, and ignores a nonsense one', async () => {
    const spy = jest.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValue(json(200, { name: OP }));
    await submitVertexVeo(REQ, CFG, { model: MODEL });
    await submitVertexVeo(REQ, CFG, { model: MODEL, timeoutMs: 5000 });
    await submitVertexVeo(REQ, CFG, { model: MODEL, timeoutMs: 0 });
    await submitVertexVeo(REQ, CFG, { model: MODEL, timeoutMs: Number.NaN });
    expect(VEO_SUBMIT_TIMEOUT_MS).toBe(30_000);
    expect(spy.mock.calls.map((c) => c[0])).toEqual([30_000, 5000, 30_000, 30_000]);
  });
});

describe('submitVertexVeo — classification (every failure is ONE POST)', () => {
  it.each<[string, number, string, string, boolean]>([
    ['400 → invalid_request', 400, 'durationSeconds must be one of [4, 6, 8]', 'invalid_request', false],
    ['400 with Responsible-AI wording → safety', 400, "The prompt contains sensitive words that violate Google's Responsible AI practices. Support codes: 29310472", 'safety', false],
    ['400 usage-guidelines wording → safety', 400, 'Your input image violates our usage guidelines', 'safety', false],
    ['400 with billing wording → quota', 400, 'Billing account for project 123 is not found', 'quota', false],
    ['401 → auth', 401, 'Request had invalid authentication credentials', 'auth', false],
    ['403 → auth', 403, "Permission 'aiplatform.endpoints.predict' denied", 'auth', false],
    ['403 BILLING_DISABLED → quota', 403, 'BILLING_DISABLED: This API method requires billing to be enabled', 'quota', false],
    ['402 → quota', 402, 'Payment required', 'quota', false],
    ['429 → rate_limited (retryable)', 429, 'Quota exceeded for aiplatform.googleapis.com/online_prediction_requests_per_base_model', 'rate_limited', true],
    ['429 "plan and billing details" is still an ordinary rate limit', 429, 'You exceeded your current quota, please check your plan and billing details.', 'rate_limited', true],
    ['429 with depleted prepayment → quota', 429, 'Your prepayment credits are depleted. Please go to AI Studio to manage your project and billing.', 'quota', false],
    ['503 → unavailable (retryable)', 503, 'The service is currently unavailable.', 'unavailable', true],
    ['500 → ambiguous', 500, 'Internal error encountered.', 'ambiguous', false],
    ['502 → ambiguous', 502, 'Bad Gateway', 'ambiguous', false],
    ['504 → ambiguous', 504, 'Deadline exceeded', 'ambiguous', false],
    ['408 → ambiguous', 408, 'Request timeout', 'ambiguous', false],
    ['404 (unknown model) → invalid_request', 404, 'Publisher model not found', 'invalid_request', false],
  ])('%s', async (_label, status, message, reason, retryable) => {
    fetchMock.mockResolvedValueOnce(googleError(status, message));
    const out = failed(await submitVertexVeo(REQ, CFG, { model: MODEL }));
    expect(out).toMatchObject({ ok: false, reason, retryable, status });
    expect(out.detail).toContain(`HTTP ${status}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a submit that TIMES OUT is ambiguous, not retryable, and was POSTed exactly once', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    const out = failed(await submitVertexVeo(REQ, CFG, { model: MODEL }));
    expect(out).toMatchObject({ reason: 'ambiguous', retryable: false });
    expect(out.detail).toMatch(/no answer within 30 s/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a hung submit is cut by the real deadline — still ONE POST, still ambiguous', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
    );
    const out = failed(await submitVertexVeo(REQ, CFG, { model: MODEL, timeoutMs: 25 }));
    expect(out).toMatchObject({ reason: 'ambiguous', retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a network error (connection reset) is ambiguous, names the cause code, and is not retried', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }));
    const out = failed(await submitVertexVeo(REQ, CFG, { model: MODEL }));
    expect(out).toMatchObject({ reason: 'ambiguous', retryable: false });
    expect(out.detail).toContain('ECONNRESET');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a 2xx without a usable operation name is ambiguous — Google accepted a job we cannot poll', async () => {
    for (const res of [json(200, {}), json(200, { name: 'models/veo/operations/1' }), new Response('not json', { status: 200 })]) {
      fetchMock.mockResolvedValueOnce(res);
      const out = failed(await submitVertexVeo(REQ, CFG, { model: MODEL }));
      expect(out).toMatchObject({ reason: 'ambiguous', retryable: false, status: 200 });
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('a redirect is not followed (the token and body stay with Google) and is a request problem', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/' } }));
    const out = failed(await submitVertexVeo(REQ, CFG, { model: MODEL }));
    expect(out).toMatchObject({ reason: 'invalid_request', status: 302 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads the array form of a Google error body and plain-text bodies', async () => {
    fetchMock.mockResolvedValueOnce(json(400, [{ error: { code: 400, message: 'Invalid resolution', status: 'INVALID_ARGUMENT' } }]));
    expect(failed(await submitVertexVeo(REQ, CFG, { model: MODEL })).detail).toBe('HTTP 400: INVALID_ARGUMENT: Invalid resolution');
    fetchMock.mockResolvedValueOnce(new Response('<html>upstream error</html>', { status: 502 }));
    expect(failed(await submitVertexVeo(REQ, CFG, { model: MODEL })).detail).toContain('upstream error');
  });

  it('never echoes the token or a signed URL in the detail', async () => {
    fetchMock.mockResolvedValueOnce(
      googleError(400, `bad input https://storage.googleapis.com/b/o.png?X-Goog-Signature=deadbeef token ${TOKEN}`),
    );
    const out = failed(await submitVertexVeo(REQ, CFG, { model: MODEL }));
    expect(out.detail).not.toContain('X-Goog-Signature');
    expect(out.detail).not.toContain('deadbeef');
    expect(out.detail).not.toContain(TOKEN);
  });
});

describe('submitVertexVeo — refused locally, before any token or POST', () => {
  it('a request that breaks the payload contract → invalid_request (field named)', async () => {
    const out = failed(await submitVertexVeo({ ...REQ, durationSec: 4 }, CFG, { model: MODEL }));
    expect(out).toMatchObject({ reason: 'invalid_request', retryable: false });
    expect(out.detail).toMatch(/^resolution:/);
    expect(tokenMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a url media input → invalid_request, and the URL is not echoed', async () => {
    const out = failed(await submitVertexVeo({ ...REQ, startImage: { kind: 'url', url: 'https://cdn.example/x.png?sig=secret' } }, CFG, { model: MODEL }));
    expect(out.reason).toBe('invalid_request');
    expect(out.detail).not.toContain('sig=secret');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['', 'veo 3', '../../v1/projects/x', 'veo/3.1', '-leading-dash'])('model id %j → invalid_request', async (model) => {
    const out = failed(await submitVertexVeo(REQ, CFG, { model }));
    expect(out.reason).toBe('invalid_request');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a location that would move the host', { location: 'evil.example?' }],
    ['a location with a slash', { location: 'us-central1/x' }],
    ['a project with a slash', { projectId: 'p/../q' }],
  ])('%s → not_configured, and the token is never sent', async (_label, patch) => {
    const out = failed(await submitVertexVeo(REQ, { ...CFG, ...patch }, { model: MODEL }));
    expect(out.reason).toBe('not_configured');
    expect(tokenMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each<[string, string, boolean, VertexAuthError]>([
    ['not configured', 'not_configured', false, new VertexAuthError('not_configured', 'Vertex AI is not configured: GCP_PROJECT_ID')],
    ['client init failed', 'not_configured', false, new VertexAuthError('client_init_failed', 'bad key')],
    ['STS 503', 'unavailable', true, new VertexAuthError('token_failed', 'HTTP 503: backend', 503)],
    ['STS network miss', 'unavailable', true, new VertexAuthError('token_failed', 'error: ETIMEDOUT')],
    ['STS 429', 'rate_limited', true, new VertexAuthError('token_failed', 'HTTP 429', 429)],
    ['STS 400 invalid_grant', 'auth', false, new VertexAuthError('token_failed', 'HTTP 400: invalid_grant', 400)],
    ['IAM 403', 'auth', false, new VertexAuthError('token_failed', 'HTTP 403: PERMISSION_DENIED', 403)],
    ['no OIDC token', 'auth', false, new VertexAuthError('oidc_unavailable', 'Vercel OIDC token unavailable')],
    ['empty token', 'auth', false, new VertexAuthError('no_token', 'no access token')],
  ])('token failure: %s → %s (retryable=%s); nothing was POSTed', async (_label, reason, retryable, err) => {
    tokenMock.mockRejectedValueOnce(err);
    const out = failed(await submitVertexVeo(REQ, CFG, { model: MODEL }));
    expect(out).toMatchObject({ reason, retryable });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an unexpected token error is auth, without echoing it', async () => {
    tokenMock.mockRejectedValueOnce(new Error(`boom ${TOKEN}`));
    const out = failed(await submitVertexVeo(REQ, CFG, { model: MODEL }));
    expect(out.reason).toBe('auth');
    expect(out.detail).not.toContain(TOKEN);
  });
});

// ── classification helpers ──────────────────────────────────────────────────────────────────────────────────────

describe('classification helpers', () => {
  it('support codes are extracted from Google wording, de-duplicated', () => {
    expect(supportCodesIn('Blocked. Support codes: 29310472, 15236754')).toEqual(['29310472', '15236754']);
    expect(supportCodesIn('support code: 58061214; Support codes: 58061214 and more')).toEqual(['58061214']);
    expect(supportCodesIn('no codes here, 12345678')).toEqual([]);
  });

  it('safety wording', () => {
    expect(isSafetyWording("violate Google's Responsible AI practices")).toBe(true);
    expect(isSafetyWording('The input image contains a photorealistic child')).toBe(true);
    expect(isSafetyWording('durationSeconds must be 4, 6 or 8')).toBe(false);
  });

  it('billing wording spares the ordinary "plan and billing details" rate-limit text', () => {
    expect(isBillingWording('BILLING_DISABLED')).toBe(true);
    expect(isBillingWording('requires billing to be enabled')).toBe(true);
    expect(isBillingWording('Your prepayment credits are depleted')).toBe(true);
    expect(isBillingWording('please check your plan and billing details')).toBe(false);
  });

  it('classifySubmitHttpFailure: a 400 about the API key is auth; any other 400 stays the request\'s fault', () => {
    expect(classifySubmitHttpFailure(400, 'INVALID_ARGUMENT: API key not valid. Please pass a valid API key.')).toMatchObject({ reason: 'auth', retryable: false, status: 400 });
    expect(classifySubmitHttpFailure(400, 'reason: API_KEY_INVALID')).toMatchObject({ reason: 'auth' });
    expect(classifySubmitHttpFailure(400, 'The prompt mentions an api key for a door lock')).toMatchObject({ reason: 'invalid_request' });
    expect(classifySubmitHttpFailure(400, 'durationSeconds out of bound')).toMatchObject({ reason: 'invalid_request' });
  });

  it('classifySubmitHttpFailure without a message', () => {
    expect(classifySubmitHttpFailure(503, '')).toStrictEqual({ ok: false, reason: 'unavailable', retryable: true, status: 503, detail: 'HTTP 503' });
  });

  it('parseVertexOperationName', () => {
    expect(parseVertexOperationName(OP)).toEqual({
      project: 'my-proj',
      location: 'us-central1',
      model: MODEL,
      operationId: '0f8a1b2c-3d4e-5f60-7182-93a4b5c6d7e8',
    });
    expect(parseVertexOperationName(`  ${OP}  `)).not.toBeNull();
    expect(parseVertexOperationName('models/veo-3.1-generate-preview/operations/abc')).toBeNull();
    expect(parseVertexOperationName(OP.replace('us-central1', 'evil.example?'))).toBeNull();
    expect(parseVertexOperationName(OP.replace('operations/', 'operations/../'))).toBeNull();
    expect(parseVertexOperationName(42)).toBeNull();
  });

  it('finishedOperationOutcome never reports success without a video', () => {
    expect(finishedOperationOutcome({ videos: [] })).toStrictEqual({ state: 'failed', reason: 'Veo finished without returning a video' });
    expect(finishedOperationOutcome({ videos: [], raiMediaFilteredCount: '2' })).toMatchObject({ state: 'filtered', supportCodes: [] });
  });
});

// ── poll ────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('pollVertexVeo', () => {
  it('POSTs {operationName} to fetchPredictOperation of the model in the name, with the bearer token', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { name: OP, done: false }));
    expect(await pollVertexVeo(OP)).toStrictEqual({ state: 'processing' });
    const { url, init } = call();
    expect(url).toBe(POLL_URL);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.redirect).toBe('manual');
    expect(sentBody()).toStrictEqual({ operationName: OP });
  });

  it('project, location and model come from the operation name, not the current env', async () => {
    const name = 'projects/123456/locations/europe-west4/publishers/google/models/veo-3.1-fast-generate-001/operations/op-1';
    fetchMock.mockResolvedValueOnce(json(200, { done: false }));
    await pollVertexVeo(name);
    expect(call().url).toBe(
      'https://europe-west4-aiplatform.googleapis.com/v1/projects/123456/locations/europe-west4/publishers/google/models/veo-3.1-fast-generate-001:fetchPredictOperation',
    );
  });

  it('uses a 15 s deadline per poll', async () => {
    const spy = jest.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValueOnce(json(200, { done: false }));
    await pollVertexVeo(OP);
    expect(VEO_POLL_TIMEOUT_MS).toBe(15_000);
    expect(spy).toHaveBeenCalledWith(15_000);
  });

  it('done with gcs videos → succeeded (mimeType defaults to video/mp4)', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, {
        done: true,
        response: {
          raiMediaFilteredCount: 0,
          videos: [{ gcsUri: `${PREFIX}sample_0.mp4`, mimeType: 'video/mp4' }, { gcsUri: `${PREFIX}sample_1.mp4` }, { junk: true }],
        },
      }),
    );
    expect(await pollVertexVeo(OP)).toStrictEqual({
      state: 'succeeded',
      videos: [
        { kind: 'gcs', gcsUri: `${PREFIX}sample_0.mp4`, mimeType: 'video/mp4' },
        { kind: 'gcs', gcsUri: `${PREFIX}sample_1.mp4`, mimeType: 'video/mp4' },
      ],
    });
  });

  it('done with inline bytes (no storageUri) → succeeded with a bytes video', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { done: true, response: { videos: [{ bytesBase64Encoded: 'AAAA', mimeType: 'video/mp4' }] } }));
    expect(await pollVertexVeo(OP)).toStrictEqual({ state: 'succeeded', videos: [{ kind: 'bytes', base64: 'AAAA', mimeType: 'video/mp4' }] });
  });

  it('done + an error with support codes → filtered with the codes', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { done: true, error: { code: 3, message: 'Unable to generate videos: the prompt was blocked. Support codes: 29310472' } }),
    );
    expect(await pollVertexVeo(OP)).toStrictEqual({
      state: 'filtered',
      reason: 'Unable to generate videos: the prompt was blocked. Support codes: 29310472',
      supportCodes: ['29310472'],
    });
  });

  it('done + an error with safety wording but no code → filtered with no codes', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { done: true, error: { code: 3, message: 'The image violates our usage guidelines' } }));
    expect(await pollVertexVeo(OP)).toMatchObject({ state: 'filtered', supportCodes: [] });
  });

  it('done + any other error → failed with the gRPC code', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { done: true, error: { code: 13, message: 'Internal error' } }));
    expect(await pollVertexVeo(OP)).toStrictEqual({ state: 'failed', reason: 'Internal error', code: 13 });
  });

  it('done, no video, raiMediaFilteredCount > 0 → filtered with the reasons and their codes', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, {
        done: true,
        response: { raiMediaFilteredCount: 1, raiMediaFilteredReasons: ['Video blocked for a celebrity likeness. Support codes: 17301594'] },
      }),
    );
    expect(await pollVertexVeo(OP)).toStrictEqual({
      state: 'filtered',
      reason: 'Video blocked for a celebrity likeness. Support codes: 17301594',
      supportCodes: ['17301594'],
    });
  });

  it('done, no video, a filtered count but no reasons → filtered with a generic reason', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { done: true, response: { raiMediaFilteredCount: 1 } }));
    expect(await pollVertexVeo(OP)).toStrictEqual({ state: 'filtered', reason: 'Veo filtered the output (Responsible AI)', supportCodes: [] });
  });

  it('done with nothing at all → failed', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { done: true, response: {} }));
    expect(await pollVertexVeo(OP)).toMatchObject({ state: 'failed' });
  });

  it.each<[string, () => Promise<Response>]>([
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
    ['a timeout', () => Promise.reject(new DOMException('timeout', 'TimeoutError'))],
    ['HTTP 500', () => Promise.resolve(googleError(500, 'internal'))],
    ['HTTP 503', () => Promise.resolve(googleError(503, 'unavailable'))],
    ['HTTP 429', () => Promise.resolve(googleError(429, 'quota'))],
    ['HTTP 404', () => Promise.resolve(googleError(404, 'not found'))],
    ['an unreadable body', () => Promise.resolve(new Response('<html>', { status: 200 }))],
  ])('%s is transient → processing', async (_label, respond) => {
    fetchMock.mockImplementationOnce(respond);
    expect(await pollVertexVeo(OP)).toStrictEqual({ state: 'processing' });
  });

  it.each([
    'models/veo-3.1-generate-preview/operations/abc',
    `projects/p/locations/evil.example?x/publishers/google/models/${MODEL}/operations/1`,
    `projects/p/locations/us-central1/publishers/google/models/${MODEL}/operations/../../x`,
    '',
  ])('%j is not a Vertex operation → failed, without a token or a request', async (name) => {
    expect(await pollVertexVeo(name)).toMatchObject({ state: 'failed' });
    expect(tokenMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Vertex no longer configured → failed; a token hiccup → processing', async () => {
    tokenMock.mockRejectedValueOnce(new VertexAuthError('not_configured', 'Vertex AI is not configured: GCP_PROJECT_ID'));
    expect(await pollVertexVeo(OP)).toStrictEqual({ state: 'failed', reason: 'Vertex AI is not configured' });
    tokenMock.mockRejectedValueOnce(new VertexAuthError('token_failed', 'HTTP 503', 503));
    expect(await pollVertexVeo(OP)).toStrictEqual({ state: 'processing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
