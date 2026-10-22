/** @jest-environment node */
/**
 * engine.ts with vertexAuth and gcs mocked (config, token, uploads, output prefix, signing) and a scripted global
 * fetch standing in for Google and for image hosts — no network. Rules under test (docs/VEO_ENGINE.md §3, §5):
 * the transport selection matrix (Vertex AI only under MASTER TASK v3.1: no key, flag, pin or unset variable selects
 * the Developer API), transportOf, the Google-only switch, createVeoClip end to end on Vertex (normalisation, the
 * cameraControl opt-in, url/bytes → GCS), outcome mapping of input failures, exactly one submit, the log line, poll
 * dispatch (a historical Developer API operation is answered without a call), deliverableUrl.
 */
jest.mock('server-only', () => ({}));
jest.mock('@vercel/oidc', () => ({ getVercelOidcToken: jest.fn() }));
jest.mock('google-auth-library', () => ({ ExternalAccountClient: { fromJSON: jest.fn() }, GoogleAuth: jest.fn(), JWT: jest.fn() }));
jest.mock('@google-cloud/storage', () => ({ Storage: jest.fn() }));
jest.mock('./vertexAuth', () => ({
  ...jest.requireActual<typeof import('./vertexAuth')>('./vertexAuth'),
  vertexConfig: jest.fn(),
  vertexConfigProblems: jest.fn(),
  getVertexAccessToken: jest.fn(),
}));
jest.mock('./gcs', () => ({
  ...jest.requireActual<typeof import('./gcs')>('./gcs'),
  uploadVeoInput: jest.fn(),
  veoOutputPrefix: jest.fn(),
  signedReadUrl: jest.fn(),
}));

import { setVeoCapDepsForTests, type VeoSpendStore } from './dailyCap';
import { createHash } from 'node:crypto';
import type { VeoSubmissionEvidence } from './submissionJournal';
import {
  createVeoClip, deliverableUrl, isGoogleOnly, pollVeoClip, transportOf, VEO_DEVELOPER_API_OPERATION, VEO_DEVELOPER_API_REFUSED,
  veoTransport, type CreateVeoClipInput,
} from './engine';
import { signedReadUrl, uploadVeoInput, veoOutputPrefix, VeoGcsError } from './gcs';
import { getVertexAccessToken, vertexConfig, vertexConfigProblems } from './vertexAuth';
import type { VeoCreateOutcome, VeoMedia, VertexConfig } from './types';

const vertexConfigMock = vertexConfig as jest.MockedFunction<typeof vertexConfig>;
const problemsMock = vertexConfigProblems as jest.MockedFunction<typeof vertexConfigProblems>;
const tokenMock = getVertexAccessToken as jest.MockedFunction<typeof getVertexAccessToken>;
const uploadMock = uploadVeoInput as jest.MockedFunction<typeof uploadVeoInput>;
const prefixMock = veoOutputPrefix as jest.MockedFunction<typeof veoOutputPrefix>;
const signMock = signedReadUrl as jest.MockedFunction<typeof signedReadUrl>;

const TOKEN = 'ya29.engine-test-access-token';
const KEY = 'AQ.engine-test-gemini-key-000111';
const CFG: VertexConfig = {
  projectId: 'my-proj',
  location: 'us-central1',
  bucket: 'gs://my-bucket/veo',
  auth: { mode: 'service_account_key', clientEmail: 'veo@my-proj.iam.gserviceaccount.com' },
};
const PREFIX = 'gs://my-bucket/veo/veo/sess-1/2-abcd1234/';
const VERTEX_MODEL = 'veo-3.1-generate-001';
const VERTEX_OP = `projects/my-proj/locations/us-central1/publishers/google/models/${VERTEX_MODEL}/operations/op-123`;
const VERTEX_SUBMIT = `https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/${VERTEX_MODEL}:predictLongRunning`;
/** An operation the Gemini Developer API made before v3.1: kept as it is, never polled again. */
const GEMINI_OP = 'models/veo-3.1-generate-preview/operations/g-456';
const DEVELOPER_API = 'https://generativelanguage.googleapis.com/';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 7)]);
const IMG_URL = 'https://cdn.example.com/frames/scene-1.png?X-Amz-Signature=SIGNED-SECRET';

const ENV_NAMES = [
  'VEO_TRANSPORT', 'GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_VEO_ENABLED',
  'VEO_NATIVE_CAMERA_CONTROL', 'VIDEO_GOOGLE_ONLY', 'VEO_MODEL_STANDARD', 'VEO_MODEL_FAST', 'VEO_MODEL_LITE',
  'GEMINI_VEO_MODEL', 'VEO_VERTEX_PERSON_GENERATION', 'VEO_DAILY_LIMIT_USD',
] as const;
const savedEnv: Record<string, string | undefined> = {};
const fetchMock = jest.fn();
const realFetch = global.fetch;
let infoSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const image = (bytes: Buffer, contentType: string | null = 'image/png', extra: Record<string, string> = {}) =>
  new Response(new Uint8Array(bytes), { status: 200, headers: { ...(contentType ? { 'content-type': contentType } : {}), ...extra } });

type FetchInit = RequestInit & { headers?: Record<string, string> };
const calls = () => fetchMock.mock.calls as [string, FetchInit][];
const callsTo = (prefix: string) => calls().filter(([url]) => url.startsWith(prefix));
const bodyOf = (url: string): { instances: Array<Record<string, unknown>>; parameters: Record<string, unknown> } => {
  const c = callsTo(url);
  expect(c).toHaveLength(1);
  return JSON.parse(String(c[0]?.[1].body));
};

/** Route fetch by URL: Google endpoints answer as scripted, image hosts from `images`. */
function routeFetch(opts: { vertex?: () => Promise<Response>; images?: Record<string, () => Promise<Response>> } = {}) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('-aiplatform.googleapis.com/') && url.endsWith(':predictLongRunning')) {
      return opts.vertex ? opts.vertex() : Promise.resolve(json(200, { name: VERTEX_OP }));
    }
    const img = opts.images?.[url];
    if (img) return img();
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

function setEnv(vars: Partial<Record<(typeof ENV_NAMES)[number], string>>) {
  for (const n of ENV_NAMES) delete process.env[n];
  Object.assign(process.env, vars);
}

const input = (request: CreateVeoClipInput['request'], extra: Partial<CreateVeoClipInput> = {}): CreateVeoClipInput => ({
  request,
  sessionId: 'sess-1',
  ordinal: 2,
  ...extra,
});
const failed = (o: VeoCreateOutcome) => {
  if (o.ok) throw new Error('expected a failure outcome');
  return o;
};

let uploads = 0;
function uploadAsGcs(media: VeoMedia | string): Promise<VeoMedia & { kind: 'gcs' }> {
  if (typeof media !== 'string' && media.kind === 'gcs') return Promise.resolve(media);
  uploads += 1;
  return Promise.resolve({ kind: 'gcs', uri: `gs://my-bucket/veo/inputs/sess-1/upload-${uploads}.png`, mimeType: 'image/png' });
}

beforeAll(() => {
  for (const n of ENV_NAMES) savedEnv[n] = process.env[n];
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
  for (const n of ENV_NAMES) {
    if (savedEnv[n] === undefined) delete process.env[n];
    else process.env[n] = savedEnv[n];
  }
  global.fetch = realFetch;
});
beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  uploads = 0;
  setEnv({});
  vertexConfigMock.mockReturnValue(null);
  problemsMock.mockReturnValue(['GCP_PROJECT_ID', 'GCP_VEO_BUCKET']);
  tokenMock.mockResolvedValue(TOKEN);
  uploadMock.mockImplementation(uploadAsGcs);
  prefixMock.mockReturnValue(PREFIX);
  signMock.mockResolvedValue('https://storage.googleapis.com/my-bucket/o.mp4?X-Goog-Signature=abc');
  infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

const useVertex = () => vertexConfigMock.mockReturnValue(CFG);
/** An AI Studio key and no Vertex: what used to render on the Developer API. */
const useKeyOnly = () => {
  vertexConfigMock.mockReturnValue(null);
  process.env.GEMINI_API_KEY = KEY;
};
const developerApiCalls = () => calls().filter(([url]) => url.startsWith(DEVELOPER_API));

// ── transport selection ─────────────────────────────────────────────────────────────────────────────────────────

describe('veoTransport', () => {
  it.each<[string, string | undefined, boolean, boolean, string | undefined, 'vertex' | null]>([
    ['auto: Vertex configured wins', undefined, true, true, undefined, 'vertex'],
    ['auto: Vertex without a Gemini key', undefined, true, false, undefined, 'vertex'],
    ['auto: Vertex even when GEMINI_VEO_ENABLED is off', undefined, true, true, '0', 'vertex'],
    ['auto: no Vertex → null, an AI Studio key is not a Veo route', undefined, false, true, undefined, null],
    ['auto: no Vertex, Gemini killed', undefined, false, true, 'off', null],
    ['auto: nothing', undefined, false, false, undefined, null],
    ['pinned gemini is refused, even with Vertex configured and a key', 'gemini', true, true, undefined, null],
    ['pinned gemini without a key', 'gemini', true, false, undefined, null],
    ['pinned gemini but killed', 'gemini', true, true, 'false', null],
    ['pinned vertex', 'vertex', true, false, undefined, 'vertex'],
    ['pinned vertex, not configured → null, never a quiet Gemini render', 'vertex', false, true, undefined, null],
    ['pin is trimmed and case-insensitive', ' VERTEX ', true, true, undefined, 'vertex'],
    ['explicit auto mode without Vertex → null, key or not', 'auto', false, true, undefined, null],
    ['explicit auto is trimmed and case-insensitive', ' AUTO ', true, true, undefined, 'vertex'],
    ['unknown pin with both transports available', 'vertx', true, true, undefined, null],
    ['unknown pin with only a Gemini key', 'gemini_api', false, true, undefined, null],
  ])('%s', (_label, pin, vertex, key, enabled, expected) => {
    setEnv({
      ...(pin !== undefined ? { VEO_TRANSPORT: pin } : {}),
      ...(key ? { GEMINI_API_KEY: KEY } : {}),
      ...(enabled !== undefined ? { GEMINI_VEO_ENABLED: enabled } : {}),
    });
    vertexConfigMock.mockReturnValue(vertex ? CFG : null);
    expect(veoTransport()).toBe(expected);
  });
});

describe('transportOf', () => {
  it.each<[string, 'vertex' | 'gemini' | null]>([
    [VERTEX_OP, 'vertex'],
    [`  ${VERTEX_OP}`, 'vertex'],
    [GEMINI_OP, 'gemini'],
    ['operations/abc', null],
    ['', null],
    ['https://generativelanguage.googleapis.com/v1beta/models/x/operations/y', null],
  ])('%j → %s', (name, expected) => {
    expect(transportOf(name)).toBe(expected);
  });
});

describe('isGoogleOnly', () => {
  it('is ON by default and OFF only when explicitly disabled', () => {
    expect(isGoogleOnly()).toBe(true);
    for (const v of ['0', 'false', 'no', 'off']) {
      process.env.VIDEO_GOOGLE_ONLY = v;
      expect(isGoogleOnly()).toBe(false);
    }
    process.env.VIDEO_GOOGLE_ONLY = '1';
    expect(isGoogleOnly()).toBe(true);
  });
});

// ── createVeoClip on Vertex ─────────────────────────────────────────────────────────────────────────────────────

describe('createVeoClip — Vertex', () => {
  beforeEach(useVertex);

  it('text-to-video: normalises, writes to a fresh output prefix, submits ONCE', async () => {
    routeFetch();
    const res = await createVeoClip(input({ prompt: 'A lighthouse at dusk', aspect: '16:9' }));

    expect(res.transport).toBe('vertex');
    expect(res.model).toBe(VERTEX_MODEL);
    expect(res.outcome).toStrictEqual({ ok: true, operation: { transport: 'vertex', name: VERTEX_OP, model: VERTEX_MODEL, outputPrefix: PREFIX } });
    expect(res.request).toMatchObject({ aspect: '16:9', durationSec: 8, resolution: '1080p', tier: 'standard', generateAudio: true });
    expect(prefixMock).toHaveBeenCalledWith('sess-1', 2, CFG);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(calls()).toHaveLength(1);
    expect(calls()[0]?.[0]).toBe(VERTEX_SUBMIT);
    expect(calls()[0]?.[1].headers?.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(bodyOf(VERTEX_SUBMIT).parameters.storageUri).toBe(PREFIX);
  });

  it('url and bytes inputs are uploaded to GCS and sent as gcsUri; the result keeps the caller\'s media', async () => {
    routeFetch();
    const startImage: VeoMedia = { kind: 'url', url: IMG_URL };
    const lastFrame: VeoMedia = { kind: 'bytes', base64: PNG.toString('base64'), mimeType: 'image/png' };
    const res = await createVeoClip(input({ prompt: 'The subject turns to camera', aspect: '9:16', startImage, lastFrame }));

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(uploadMock).toHaveBeenCalledWith(startImage, { sessionId: 'sess-1' });
    expect(uploadMock).toHaveBeenCalledWith(lastFrame, { sessionId: 'sess-1' });
    const instance = bodyOf(VERTEX_SUBMIT).instances[0];
    expect(instance?.image).toEqual({ gcsUri: expect.stringMatching(/^gs:\/\/my-bucket\/veo\/inputs\/sess-1\/upload-\d\.png$/), mimeType: 'image/png' });
    expect(instance?.lastFrame).toEqual({ gcsUri: expect.stringMatching(/^gs:\/\/my-bucket\/veo\/inputs\//), mimeType: 'image/png' });
    expect(JSON.stringify(bodyOf(VERTEX_SUBMIT))).not.toContain(PNG.toString('base64'));
    expect(res.request.startImage).toBe(startImage);
    expect(res.request.lastFrame).toBe(lastFrame);
  });

  it('reference images are each uploaded; a gcs input passes through unchanged', async () => {
    routeFetch();
    const own: VeoMedia = { kind: 'gcs', uri: 'gs://my-bucket/veo/inputs/sess-1/hero.jpg', mimeType: 'image/jpeg' };
    await createVeoClip(input({ prompt: 'Hero walks through the market', aspect: '16:9', referenceImages: [{ kind: 'url', url: IMG_URL }, own] }));
    expect(uploadMock).toHaveBeenCalledTimes(2);
    const refs = bodyOf(VERTEX_SUBMIT).instances[0]?.referenceImages as Array<{ image: { gcsUri: string }; referenceType: string }>;
    expect(refs.map((r) => r.image.gcsUri)).toEqual(['gs://my-bucket/veo/inputs/sess-1/upload-1.png', own.uri]);
    expect(refs.every((r) => r.referenceType === 'asset')).toBe(true);
  });

  it('the tier picks the model, and env overrides apply', async () => {
    routeFetch({ vertex: () => Promise.resolve(json(200, { name: VERTEX_OP.replace(VERTEX_MODEL, 'veo-3.1-fast-generate-001') })) });
    const fast = await createVeoClip(input({ prompt: 'x', aspect: '16:9' }, { tier: 'fast' }));
    expect(fast.model).toBe('veo-3.1-fast-generate-001');
    expect(calls()[0]?.[0]).toContain('/models/veo-3.1-fast-generate-001:predictLongRunning');

    fetchMock.mockClear();
    process.env.VEO_MODEL_STANDARD = 'veo-3.2-generate-001';
    routeFetch({ vertex: () => Promise.resolve(json(200, { name: VERTEX_OP.replace(VERTEX_MODEL, 'veo-3.2-generate-001') })) });
    expect((await createVeoClip(input({ prompt: 'x', aspect: '16:9' }))).model).toBe('veo-3.2-generate-001');
  });

  it('request.tier is used when no tier is given', async () => {
    routeFetch({ vertex: () => Promise.resolve(json(200, { name: VERTEX_OP.replace(VERTEX_MODEL, 'veo-3.1-lite-generate-001') })) });
    expect((await createVeoClip(input({ prompt: 'x', aspect: '16:9', tier: 'lite' }))).model).toBe('veo-3.1-lite-generate-001');
  });

  it('normalisation adjustments are returned (1:1 → 16:9, 5 s → 6 s at 720p)', async () => {
    routeFetch();
    const res = await createVeoClip(input({ prompt: 'x', aspect: '1:1', durationSec: 5 }));
    expect(res.request).toMatchObject({ aspect: '16:9', durationSec: 6, resolution: '720p' });
    expect(res.adjustments.map((a) => a.field)).toEqual(['aspect', 'durationSec']);
    expect(bodyOf(VERTEX_SUBMIT).parameters).toMatchObject({ aspectRatio: '16:9', durationSeconds: 6, resolution: '720p' });
  });

  it.each<[string, string, boolean, VeoGcsError]>([
    ['blocked URL', 'invalid_request', false, new VeoGcsError('blocked_url', 'Veo input URL must be a public https URL')],
    ['unsupported type', 'invalid_request', false, new VeoGcsError('unsupported_type', 'Veo image inputs must be JPEG or PNG — got image/webp.')],
    ['too large', 'invalid_request', false, new VeoGcsError('too_large', 'Veo input image exceeds 20 MB')],
    ['invalid input', 'invalid_request', false, new VeoGcsError('invalid_input', 'Malformed data URL')],
    ['image host 404', 'invalid_request', false, new VeoGcsError('fetch_failed', 'Veo input fetch failed: HTTP 404', 404)],
    ['image host 503', 'unavailable', true, new VeoGcsError('fetch_failed', 'Veo input fetch failed: HTTP 503', 503)],
    ['image host 429', 'unavailable', true, new VeoGcsError('fetch_failed', 'Veo input fetch failed: HTTP 429', 429)],
    ['image fetch timeout', 'unavailable', true, new VeoGcsError('fetch_failed', 'Veo input fetch timed out after 15 s')],
    ['GCS 403', 'auth', false, new VeoGcsError('storage_failed', 'GCS upload failed (HTTP 403)', 403)],
    ['GCS 500', 'unavailable', true, new VeoGcsError('storage_failed', 'GCS upload failed (HTTP 500)', 500)],
    ['GCS not configured', 'not_configured', false, new VeoGcsError('not_configured', 'Vertex AI / GCS is not configured')],
  ])('an input that fails to upload (%s) → %s (retryable=%s); Veo is never called', async (_label, reason, retryable, err) => {
    routeFetch();
    uploadMock.mockRejectedValueOnce(err);
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'url', url: IMG_URL } }));
    const out = failed(res.outcome);
    expect(out).toMatchObject({ reason, retryable, detail: err.message });
    expect(out.status).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an unexpected upload error is invalid_request without echoing it', async () => {
    routeFetch();
    uploadMock.mockRejectedValueOnce(new Error(`kaboom ${IMG_URL}`));
    const out = failed((await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'url', url: IMG_URL } }))).outcome);
    expect(out.reason).toBe('invalid_request');
    expect(out.detail).not.toContain('SIGNED-SECRET');
  });

  it('an output prefix that cannot be built → not_configured, nothing uploaded or sent', async () => {
    routeFetch();
    prefixMock.mockImplementationOnce(() => {
      throw new VeoGcsError('not_configured', 'Vertex AI / GCS is not configured');
    });
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'url', url: IMG_URL } }));
    expect(failed(res.outcome).reason).toBe('not_configured');
    expect(uploadMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('config vanishing between selection and submit → not_configured', async () => {
    routeFetch();
    vertexConfigMock.mockReturnValueOnce(CFG).mockReturnValueOnce(null);
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9' }));
    expect(failed(res.outcome).reason).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('NO RE-POST: a submit that times out is ambiguous and Veo was called exactly once', async () => {
    routeFetch({ vertex: () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')) });
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9' }));
    expect(res.outcome).toMatchObject({ ok: false, reason: 'ambiguous', retryable: false });
    expect(callsTo(VERTEX_SUBMIT)).toHaveLength(1);
  });

  it('a retryable answer (503) is returned, not retried by the engine', async () => {
    routeFetch({ vertex: () => Promise.resolve(json(503, { error: { code: 503, message: 'unavailable', status: 'UNAVAILABLE' } })) });
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9' }));
    expect(res.outcome).toMatchObject({ ok: false, reason: 'unavailable', retryable: true, status: 503 });
    expect(callsTo(VERTEX_SUBMIT)).toHaveLength(1);
  });
});

// ── the daily Veo ceiling (dailyCap.ts) ─────────────────────────────────────────────────────────────────────────

describe('createVeoClip — the daily Veo ceiling', () => {
  let counter = 0;
  let reachable = true;
  const store: VeoSpendStore = {
    exists: async () => (reachable ? counter > 0 : null),
    seed: async () => (reachable ? false : null),
    reserve: async (_d, micro, cap) => {
      if (!reachable) return null;
      if (counter + micro > cap) return { ok: false, totalMicro: counter };
      counter += micro;
      return { ok: true, totalMicro: counter };
    },
    release: async (_d, micro) => { counter = Math.max(0, counter - micro); return counter; },
    read: async () => counter,
  };
  beforeEach(() => {
    useVertex();
    counter = 0;
    reachable = true;
    setVeoCapDepsForTests({ store, ledger: async () => 0, now: () => new Date('2026-10-15T12:00:00Z') });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => setVeoCapDepsForTests());

  it('off (no VEO_DAILY_LIMIT_USD) → submits as before and reserves nothing', async () => {
    routeFetch();
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9' }));
    expect(res.outcome.ok).toBe(true);
    expect(counter).toBe(0);
  });

  it('reserves the clip at its exact price, then refuses the clip that would pass the figure WITHOUT calling Google', async () => {
    process.env.VEO_DAILY_LIMIT_USD = '5';
    routeFetch();
    const first = await createVeoClip(input({ prompt: 'x', aspect: '16:9' }));
    expect(first.outcome.ok).toBe(true);
    expect(counter).toBe(3_200_000); // Standard, 8 s, 1080p, audio: 8 × $0.40
    const second = await createVeoClip(input({ prompt: 'y', aspect: '16:9' }));
    expect(second.outcome).toMatchObject({ ok: false, reason: 'quota', retryable: false });
    expect(failed(second.outcome)).toMatchObject({ detail: expect.stringMatching(/^veo_daily_limit: today's Veo ceiling of \$5 is reached/) });
    expect(callsTo(VERTEX_SUBMIT)).toHaveLength(1);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('a submit Google provably refused (503) gives the reservation back', async () => {
    process.env.VEO_DAILY_LIMIT_USD = '5';
    routeFetch({ vertex: () => Promise.resolve(json(503, { error: { code: 503, message: 'unavailable', status: 'UNAVAILABLE' } })) });
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9' }));
    expect(failed(res.outcome).reason).toBe('unavailable');
    expect(counter).toBe(0);
  });

  it('an AMBIGUOUS submit keeps the reservation (the job may exist and bill)', async () => {
    process.env.VEO_DAILY_LIMIT_USD = '5';
    routeFetch({ vertex: () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')) });
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9' }));
    expect(failed(res.outcome).reason).toBe('ambiguous');
    expect(counter).toBe(3_200_000);
  });

  it('nothing countable (Redis down, ledger unreadable) → refused before Google, never a submit', async () => {
    process.env.VEO_DAILY_LIMIT_USD = '50';
    reachable = false;
    setVeoCapDepsForTests({ store, ledger: async () => null });
    routeFetch();
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9' }));
    expect(res.outcome).toMatchObject({ ok: false, reason: 'quota', retryable: false, detail: expect.stringMatching(/^veo_cap_unreadable:/) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── cameraControl opt-in ────────────────────────────────────────────────────────────────────────────────────────

describe('createVeoClip — native cameraControl is opt-in', () => {
  const withFrame = { prompt: 'Slow push toward the door', aspect: '16:9' as const, startImage: { kind: 'url' as const, url: IMG_URL }, cameraControl: 'push_in' as const };
  const cameraAdjustments = (adjustments: Array<{ field: string }>) => adjustments.filter((a) => a.field === 'cameraControl');

  it('without VEO_NATIVE_CAMERA_CONTROL it is stripped (with an adjustment) and never sent', async () => {
    useVertex();
    routeFetch();
    const res = await createVeoClip(input(withFrame));
    expect(bodyOf(VERTEX_SUBMIT).instances[0]).not.toHaveProperty('cameraControl');
    expect(res.request).not.toHaveProperty('cameraControl');
    expect(cameraAdjustments(res.adjustments)).toEqual([
      { field: 'cameraControl', from: 'push_in', to: null, reason: expect.stringContaining('VEO_NATIVE_CAMERA_CONTROL') },
    ]);
  });

  it.each(['1', 'true', 'on'])('VEO_NATIVE_CAMERA_CONTROL=%s + a first frame → sent to Vertex', async (flag) => {
    useVertex();
    process.env.VEO_NATIVE_CAMERA_CONTROL = flag;
    routeFetch();
    const res = await createVeoClip(input(withFrame));
    expect(bodyOf(VERTEX_SUBMIT).instances[0]?.cameraControl).toBe('push_in');
    expect(res.request.cameraControl).toBe('push_in');
    expect(cameraAdjustments(res.adjustments)).toEqual([]);
  });

  it('opted in but no first frame → dropped (once, by normalisation) and not sent', async () => {
    useVertex();
    process.env.VEO_NATIVE_CAMERA_CONTROL = '1';
    routeFetch();
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9', cameraControl: 'pan_left' }));
    expect(bodyOf(VERTEX_SUBMIT).instances[0]).not.toHaveProperty('cameraControl');
    expect(cameraAdjustments(res.adjustments)).toEqual([expect.objectContaining({ from: 'pan_left', reason: expect.stringMatching(/first frame/) })]);
  });

  it('opted in with only an AI Studio key → not configured, nothing sent anywhere', async () => {
    useKeyOnly();
    process.env.VEO_NATIVE_CAMERA_CONTROL = '1';
    routeFetch();
    const res = await createVeoClip(
      input({ ...withFrame, startImage: { kind: 'bytes', base64: PNG.toString('base64'), mimeType: 'image/png' } }),
    );
    expect(failed(res.outcome)).toMatchObject({ reason: 'not_configured', retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── the Gemini Developer API is not a Veo transport (v3.1) ──────────────────────────────────────────────────────

describe('createVeoClip — the Developer API is refused', () => {
  it('an AI Studio key without Vertex → not_configured naming Vertex; no image fetched, no Developer API call', async () => {
    useKeyOnly();
    routeFetch({ images: { [IMG_URL]: () => Promise.resolve(image(PNG)) } });
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'url', url: IMG_URL } }));
    expect(res.transport).toBeNull();
    expect(failed(res.outcome)).toMatchObject({ reason: 'not_configured', retryable: false });
    expect(failed(res.outcome).detail).toBe('Vertex AI is not configured for Veo: GCP_PROJECT_ID, GCP_VEO_BUCKET');
    expect(fetchMock).not.toHaveBeenCalled();
    for (const fn of [uploadMock, prefixMock, tokenMock]) expect(fn).not.toHaveBeenCalled();
  });

  it('VEO_TRANSPORT=gemini with Vertex ready and a key → the policy refusal, before any media or provider I/O', async () => {
    useVertex();
    process.env.GEMINI_API_KEY = KEY;
    process.env.VEO_TRANSPORT = 'gemini';
    routeFetch();
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'url', url: IMG_URL } }));
    expect(res.transport).toBeNull();
    expect(failed(res.outcome)).toMatchObject({ reason: 'not_configured', retryable: false, detail: VEO_DEVELOPER_API_REFUSED });
    for (const fn of [fetchMock, uploadMock, prefixMock, tokenMock]) expect(fn).not.toHaveBeenCalled();
  });

  it('GEMINI_VEO_ENABLED no longer matters: a complete Vertex renders with it off', async () => {
    useVertex();
    process.env.GEMINI_VEO_ENABLED = '0';
    routeFetch();
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9' }));
    expect(res.outcome.ok).toBe(true);
    expect(callsTo(VERTEX_SUBMIT)).toHaveLength(1);
    expect(developerApiCalls()).toHaveLength(0);
  });
});

// ── not configured ──────────────────────────────────────────────────────────────────────────────────────────────

describe('createVeoClip — no transport', () => {
  it.each([false, true])('an invalid pin refuses before media preparation or either provider (Vertex ready: %s)', async (vertexReady) => {
    process.env.VEO_TRANSPORT = 'wrong-transport-should-not-leak';
    process.env.GEMINI_API_KEY = KEY;
    if (vertexReady) useVertex();
    routeFetch();
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'url', url: IMG_URL } }));
    expect(res.transport).toBeNull();
    expect(failed(res.outcome)).toMatchObject({ reason: 'not_configured', retryable: false });
    expect(failed(res.outcome).detail).toMatch(/VEO_TRANSPORT must be/);
    expect(JSON.stringify(res)).not.toContain('wrong-transport-should-not-leak');
    for (const fn of [fetchMock, uploadMock, prefixMock, tokenMock]) expect(fn).not.toHaveBeenCalled();
  });

  it('nothing configured → not_configured naming the missing env, nothing sent', async () => {
    const res = await createVeoClip(input({ prompt: 'x', aspect: '4:5', durationSec: 8 }));
    expect(res.transport).toBeNull();
    expect(res.model).toBe('');
    expect(res.request.aspect).toBe('9:16');
    expect(failed(res.outcome)).toMatchObject({ reason: 'not_configured', retryable: false });
    expect(failed(res.outcome).detail).toContain('GCP_PROJECT_ID');
    expect(failed(res.outcome).detail).not.toMatch(/Gemini API key/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('pinned to Vertex but Vertex is incomplete → not_configured (not a silent Gemini render)', async () => {
    process.env.GEMINI_API_KEY = KEY;
    process.env.VEO_TRANSPORT = 'vertex';
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9' }));
    expect(failed(res.outcome).detail).toBe('Vertex AI is not configured for Veo: GCP_PROJECT_ID, GCP_VEO_BUCKET');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── logging ─────────────────────────────────────────────────────────────────────────────────────────────────────

describe('createVeoClip — one concise log line', () => {
  // console.warn, never console.info: next.config.js strips every console.* but error/warn outside development.
  it('names transport, model, shape and adjustment count on success', async () => {
    useVertex();
    routeFetch();
    await createVeoClip(input({ prompt: 'A lighthouse at dusk', aspect: '1:1' }));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).not.toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0]?.[0])).toBe(
      `[veo] submit transport=vertex model=${VERTEX_MODEL} aspect=16:9 duration=8s resolution=1080p adjustments=1 → ok op=${VERTEX_OP} prompt="A lighthouse at dusk"`,
    );
  });

  it('a failure names the reason, status and retryability', async () => {
    useVertex();
    routeFetch({ vertex: () => Promise.resolve(json(429, { error: { code: 429, message: 'quota', status: 'RESOURCE_EXHAUSTED' } })) });
    await createVeoClip(input({ prompt: 'x', aspect: '16:9' }));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain(`transport=vertex model=${VERTEX_MODEL} `);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('→ rate_limited http=429 retryable=true');
  });

  it('never carries the full prompt, URLs, base64, the token or the key', async () => {
    useVertex();
    process.env.GEMINI_API_KEY = KEY;
    routeFetch({ images: { [IMG_URL]: () => Promise.resolve(image(PNG)) } });
    const prompt = `Look https://cdn.example.com/look.png?sig=PROMPT-SECRET then ${'the camera drifts over the harbour at dawn, '.repeat(12)} end`;
    await createVeoClip(input({ prompt, aspect: '16:9', startImage: { kind: 'url', url: IMG_URL } }));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = [...infoSpy.mock.calls, ...warnSpy.mock.calls].map((c) => c.map(String).join(' ')).join('\n');
    expect(logged).toContain('prompt="Look [url] then the camera drifts');
    expect(logged).not.toContain(prompt.slice(0, 201));
    const excerpt = /prompt="([^"]*)"/.exec(logged)?.[1] ?? '';
    expect(excerpt.length).toBeLessThanOrEqual(200);
    for (const secret of ['PROMPT-SECRET', 'SIGNED-SECRET', 'https://', PNG.toString('base64'), KEY, TOKEN]) {
      expect(logged).not.toContain(secret);
    }
  });

  it('exactly one line per createVeoClip, whatever the path', async () => {
    useVertex();
    routeFetch();
    uploadMock.mockRejectedValueOnce(new VeoGcsError('blocked_url', 'Veo input URL must be a public https URL'));
    await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'url', url: IMG_URL } }));
    await createVeoClip(input({ prompt: 'y', aspect: '16:9' }));
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('→ invalid_request retryable=false');
    expect(String(warnSpy.mock.calls[1]?.[0])).toContain('→ ok');
  });
});

// ── poll / deliver ──────────────────────────────────────────────────────────────────────────────────────────────

describe('pollVeoClip', () => {
  it.each(['gemini', 'invalid-pin'])('a Vertex operation keeps polling Vertex with current pin %s', async (pin) => {
    useKeyOnly();
    process.env.VEO_TRANSPORT = pin;
    fetchMock.mockResolvedValueOnce(json(200, { done: false }));
    expect(await pollVeoClip(` ${VERTEX_OP} `)).toStrictEqual({ state: 'processing' });
    expect(calls()[0]?.[0]).toBe(VERTEX_SUBMIT.replace(':predictLongRunning', ':fetchPredictOperation'));
    expect(JSON.parse(String(calls()[0]?.[1].body))).toStrictEqual({ operationName: VERTEX_OP });
  });

  it.each(['vertex', 'gemini', 'invalid-pin'])('a historical Developer API operation is failed without a call (pin %s), name untouched', async (pin) => {
    useVertex();
    process.env.VEO_TRANSPORT = pin;
    process.env.GEMINI_API_KEY = KEY;
    expect(await pollVeoClip(GEMINI_OP)).toStrictEqual({ state: 'failed', reason: VEO_DEVELOPER_API_OPERATION });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(transportOf(GEMINI_OP)).toBe('gemini');
  });

  it('an unknown name → failed, nothing sent', async () => {
    expect(await pollVeoClip('operations/xyz')).toStrictEqual({ state: 'failed', reason: 'not a Veo operation name' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('deliverableUrl', () => {
  it('a gcs clip → a signed read URL (ttl passed through)', async () => {
    const video = { kind: 'gcs' as const, gcsUri: `${PREFIX}sample_0.mp4`, mimeType: 'video/mp4' };
    expect(await deliverableUrl(video, 600)).toMatch(/^https:\/\/storage\.googleapis\.com\//);
    expect(signMock).toHaveBeenCalledWith(`${PREFIX}sample_0.mp4`, 600);
    await deliverableUrl(video);
    expect(signMock).toHaveBeenLastCalledWith(`${PREFIX}sample_0.mp4`, undefined);
  });

  it('gemini-file and bytes clips → null (the caller hosts them)', async () => {
    expect(await deliverableUrl({ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/f', mimeType: 'video/mp4' })).toBeNull();
    expect(await deliverableUrl({ kind: 'bytes', base64: 'AAAA', mimeType: 'video/mp4' })).toBeNull();
    expect(signMock).not.toHaveBeenCalled();
  });

  it('a signing failure throws rather than reading as "host it yourself"', async () => {
    signMock.mockRejectedValueOnce(new VeoGcsError('storage_failed', 'GCS sign failed (HTTP 403)', 403));
    await expect(deliverableUrl({ kind: 'gcs', gcsUri: `${PREFIX}sample_0.mp4`, mimeType: 'video/mp4' })).rejects.toBeInstanceOf(VeoGcsError);
  });
});

describe('durable submission fence — no real network', () => {
  it('records prefix before upload and the exact body hash after auth, before the only POST', async () => {
    useVertex();
    const events: string[] = [];
    const journal: VeoSubmissionEvidence[] = [];
    uploadMock.mockImplementation(async (media) => {
      events.push('upload');
      expect(journal[0]).toMatchObject({ phase: 'prepared', outputPrefix: PREFIX, projectId: CFG.projectId, location: CFG.location });
      return uploadAsGcs(media);
    });
    tokenMock.mockImplementation(async () => { events.push('auth'); return TOKEN; });
    routeFetch({ vertex: async () => {
      events.push('post');
      expect(journal).toHaveLength(2);
      expect(journal[1].bodySha256).toBe(createHash('sha256').update(String(calls()[0][1].body)).digest('hex'));
      return json(200, { name: VERTEX_OP });
    } });
    const result = await createVeoClip(input({ prompt: 'approved scene', aspect: '16:9', startImage: { kind: 'url', url: IMG_URL } }, {
      submissionJournal: async (evidence) => { events.push(evidence.phase); journal.push({ ...evidence }); return true; },
    }));
    expect(result.outcome.ok).toBe(true);
    expect(events).toEqual(['prepared', 'upload', 'auth', 'posting', 'post']);
    expect(journal[0].requestSha256).toBe(createHash('sha256').update(JSON.stringify(result.request)).digest('hex'));
    expect(JSON.stringify(journal)).not.toMatch(/SIGNED-SECRET|ya29|base64|approved scene/);
    expect(bodyOf(VERTEX_SUBMIT).parameters.storageUri).toBe(journal[0].outputPrefix);
    expect(prefixMock).toHaveBeenCalledTimes(1);
  });

  it.each(['prepared', 'posting'] as const)('a refused %s persistence never reaches Google', async (phase) => {
    useVertex(); routeFetch();
    const result = await createVeoClip(input({ prompt: 'scene', aspect: '16:9', startImage: { kind: 'url', url: IMG_URL } }, {
      submissionJournal: async (evidence) => evidence.phase !== phase,
    }));
    expect(failed(result.outcome)).toMatchObject({ reason: 'invalid_request', retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
    if (phase === 'prepared') { expect(uploadMock).not.toHaveBeenCalled(); expect(tokenMock).not.toHaveBeenCalled(); }
  });

  it('a journal exception is sanitized and prevents input storage', async () => {
    useVertex(); routeFetch();
    const result = await createVeoClip(input({ prompt: 'scene', aspect: '16:9' }, {
      submissionJournal: async () => { throw new Error('private persistence credentials'); },
    }));
    expect(result.outcome.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('private persistence credentials');
    expect(uploadMock).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the normalized request snapshot when caller input changes during persistence', async () => {
    useVertex(); routeFetch();
    const imageInput: VeoMedia = { kind: 'gcs', uri: 'gs://owned-bucket/original.png', mimeType: 'image/png' };
    const result = await createVeoClip(input({ prompt: 'original', aspect: '16:9', startImage: imageInput }, {
      submissionJournal: async () => { imageInput.uri = 'gs://owned-bucket/replaced.png'; return true; },
    }));
    expect(result.outcome.ok).toBe(true);
    expect(bodyOf(VERTEX_SUBMIT).instances[0].image).toMatchObject({ gcsUri: 'gs://owned-bucket/original.png' });
  });

  it('an AI Studio key alone never reaches the journal: refused as not configured before evidence is written', async () => {
    useKeyOnly(); routeFetch();
    const journal = jest.fn(async () => true);
    const result = await createVeoClip(input({ prompt: 'scene', aspect: '16:9' }, { submissionJournal: journal }));
    expect(failed(result.outcome)).toMatchObject({ reason: 'not_configured', retryable: false });
    expect(journal).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('journal configuration fence', () => {
  it('refuses a configuration switch while the prepared evidence is persisted, before upload', async () => {
    useVertex(); routeFetch();
    const result = await createVeoClip(input({ prompt: 'scene', aspect: '16:9', startImage: { kind: 'url', url: IMG_URL } }, {
      submissionJournal: async () => { vertexConfigMock.mockReturnValue({ ...CFG, projectId: 'different-project' }); return true; },
    }));
    expect(result.outcome.ok).toBe(false);
    expect(uploadMock).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('refuses a configuration switch during auth or the final persistence fence', async () => {
    useVertex(); routeFetch();
    tokenMock.mockImplementation(async () => { vertexConfigMock.mockReturnValue({ ...CFG, location: 'europe-west1' }); return TOKEN; });
    const journal = jest.fn(async () => true);
    const result = await createVeoClip(input({ prompt: 'scene', aspect: '16:9' }, { submissionJournal: journal }));
    expect(result.outcome.ok).toBe(false);
    expect(journal).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
