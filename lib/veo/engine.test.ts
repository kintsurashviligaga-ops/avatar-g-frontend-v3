/** @jest-environment node */
/**
 * engine.ts with vertexAuth and gcs mocked (config, token, uploads, output prefix, signing) and a scripted global
 * fetch standing in for Google and for image hosts — no network. Rules under test (docs/VEO_ENGINE.md §3, §5):
 * the transport selection matrix, transportOf, the Google-only switch, createVeoClip end to end on both transports
 * (normalisation, the cameraControl opt-in, url/bytes → GCS for Vertex, url → bytes for Gemini with the SSRF guard,
 * 15 s and 20 MB), outcome mapping of input failures, exactly one submit, the log line, poll dispatch, deliverableUrl.
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

import { createVeoClip, deliverableUrl, isGoogleOnly, pollVeoClip, transportOf, veoTransport, type CreateVeoClipInput } from './engine';
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
const GEMINI_MODEL = 'veo-3.1-generate-preview';
const GEMINI_OP = `models/${GEMINI_MODEL}/operations/g-456`;
const GEMINI_SUBMIT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:predictLongRunning`;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 7)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24, 9)]);
const IMG_URL = 'https://cdn.example.com/frames/scene-1.png?X-Amz-Signature=SIGNED-SECRET';

const ENV_NAMES = [
  'VEO_TRANSPORT', 'GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_VEO_ENABLED',
  'VEO_NATIVE_CAMERA_CONTROL', 'VIDEO_GOOGLE_ONLY', 'VEO_MODEL_STANDARD', 'VEO_MODEL_FAST', 'VEO_MODEL_LITE',
  'GEMINI_VEO_MODEL', 'VEO_VERTEX_PERSON_GENERATION',
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
function routeFetch(opts: { vertex?: () => Promise<Response>; gemini?: () => Promise<Response>; images?: Record<string, () => Promise<Response>> } = {}) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('-aiplatform.googleapis.com/') && url.endsWith(':predictLongRunning')) {
      return opts.vertex ? opts.vertex() : Promise.resolve(json(200, { name: VERTEX_OP }));
    }
    if (url.startsWith('https://generativelanguage.googleapis.com/') && url.endsWith(':predictLongRunning')) {
      return opts.gemini ? opts.gemini() : Promise.resolve(json(200, { name: GEMINI_OP }));
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
const useGemini = () => {
  vertexConfigMock.mockReturnValue(null);
  process.env.GEMINI_API_KEY = KEY;
};

// ── transport selection ─────────────────────────────────────────────────────────────────────────────────────────

describe('veoTransport', () => {
  it.each<[string, string | undefined, boolean, boolean, string | undefined, 'vertex' | 'gemini' | null]>([
    ['auto: Vertex configured wins', undefined, true, true, undefined, 'vertex'],
    ['auto: Vertex without a Gemini key', undefined, true, false, undefined, 'vertex'],
    ['auto: Vertex even when GEMINI_VEO_ENABLED is off', undefined, true, true, '0', 'vertex'],
    ['auto: no Vertex → Gemini', undefined, false, true, undefined, 'gemini'],
    ['auto: no Vertex, Gemini killed', undefined, false, true, 'off', null],
    ['auto: nothing', undefined, false, false, undefined, null],
    ['pinned gemini skips a configured Vertex', 'gemini', true, true, undefined, 'gemini'],
    ['pinned gemini without a key', 'gemini', true, false, undefined, null],
    ['pinned gemini but killed', 'gemini', true, true, 'false', null],
    ['pinned vertex', 'vertex', true, false, undefined, 'vertex'],
    ['pinned vertex, not configured → null, never a quiet Gemini render', 'vertex', false, true, undefined, null],
    ['pin is trimmed and case-insensitive', ' VERTEX ', true, true, undefined, 'vertex'],
    ['an unknown pin is auto', 'auto', false, true, undefined, 'gemini'],
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
    expect(prefixMock).toHaveBeenCalledWith('sess-1', 2);
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

  it('opted in on the Gemini API → never sent (Vertex-only field)', async () => {
    useGemini();
    process.env.VEO_NATIVE_CAMERA_CONTROL = '1';
    routeFetch();
    const res = await createVeoClip(
      input({ ...withFrame, startImage: { kind: 'bytes', base64: PNG.toString('base64'), mimeType: 'image/png' } }),
    );
    expect(bodyOf(GEMINI_SUBMIT).instances[0]).not.toHaveProperty('cameraControl');
    expect(cameraAdjustments(res.adjustments)).toHaveLength(1);
  });
});

// ── createVeoClip on the Gemini API ─────────────────────────────────────────────────────────────────────────────

describe('createVeoClip — Gemini API', () => {
  beforeEach(useGemini);

  it('text-to-video: header-keyed submit to the Gemini model, no GCS', async () => {
    routeFetch();
    const res = await createVeoClip(input({ prompt: 'A red kite', aspect: '9:16' }));
    expect(res).toMatchObject({ transport: 'gemini', model: GEMINI_MODEL });
    expect(res.outcome).toStrictEqual({ ok: true, operation: { transport: 'gemini', name: GEMINI_OP, model: GEMINI_MODEL } });
    expect(calls()).toHaveLength(1);
    expect(calls()[0]?.[0]).toBe(GEMINI_SUBMIT);
    expect(calls()[0]?.[1].headers?.['x-goog-api-key']).toBe(KEY);
    expect(prefixMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('a url first frame is downloaded (manual redirects, 15 s) and inlined as bytes', async () => {
    const spy = jest.spyOn(AbortSignal, 'timeout');
    routeFetch({ images: { [IMG_URL]: () => Promise.resolve(image(PNG, 'application/octet-stream')) } });
    const res = await createVeoClip(input({ prompt: 'x', aspect: '9:16', startImage: { kind: 'url', url: IMG_URL } }));
    expect(res.outcome.ok).toBe(true);
    const imageCall = callsTo('https://cdn.example.com/');
    expect(imageCall).toHaveLength(1);
    expect(imageCall[0]?.[1].redirect).toBe('manual');
    expect(spy).toHaveBeenCalledWith(15_000);
    expect(bodyOf(GEMINI_SUBMIT).instances[0]?.image).toEqual({ bytesBase64Encoded: PNG.toString('base64'), mimeType: 'image/png' });
    // The result keeps the caller's reference, not the downloaded bytes.
    expect(res.request.startImage).toEqual({ kind: 'url', url: IMG_URL });
  });

  it('JPEG is recognised by its bytes; an unsniffable image keeps its declared image/* type', async () => {
    const JPG_URL = 'https://cdn.example.com/a.jpg';
    const WEBP_URL = 'https://cdn.example.com/b.webp';
    routeFetch({
      images: {
        [JPG_URL]: () => Promise.resolve(image(JPEG, 'image/png')),
        [WEBP_URL]: () => Promise.resolve(image(Buffer.from('RIFF....WEBPVP8 '), 'image/webp; charset=binary')),
      },
    });
    await createVeoClip(input({ prompt: 'x', aspect: '16:9', durationSec: 8, startImage: { kind: 'url', url: JPG_URL }, lastFrame: { kind: 'url', url: WEBP_URL } }));
    const inst = bodyOf(GEMINI_SUBMIT).instances[0];
    expect(inst?.image).toMatchObject({ mimeType: 'image/jpeg' });
    expect(inst?.lastFrame).toMatchObject({ mimeType: 'image/webp' });
  });

  it.each([
    ['an HTML page', Buffer.from('<html></html>'), 'text/html'],
    ['an SVG', Buffer.from('<svg/>'), 'image/svg+xml'],
    ['bytes with no type', Buffer.from('plain'), null],
  ])('%s is not an image → invalid_request, Veo never called', async (_label, bytes, type) => {
    routeFetch({ images: { [IMG_URL]: () => Promise.resolve(image(bytes, type)) } });
    const out = failed((await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'url', url: IMG_URL } }))).outcome);
    expect(out.reason).toBe('invalid_request');
    expect(callsTo(GEMINI_SUBMIT)).toHaveLength(0);
  });

  it('a data: URL in a url input is decoded locally (no fetch)', async () => {
    routeFetch();
    await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'url', url: `data:image/png;base64,${PNG.toString('base64')}` } }));
    expect(calls()).toHaveLength(1);
    expect(bodyOf(GEMINI_SUBMIT).instances[0]?.image).toEqual({ bytesBase64Encoded: PNG.toString('base64'), mimeType: 'image/png' });
  });

  it('a non-base64 or empty data: URL → invalid_request', async () => {
    routeFetch();
    for (const url of ['data:image/png,%89PNG', 'data:image/png;base64,']) {
      const out = failed((await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'url', url } }))).outcome);
      expect(out.reason).toBe('invalid_request');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a data: URL over 20 MB → invalid_request, refused before decoding', async () => {
    routeFetch();
    const fromSpy = jest.spyOn(Buffer, 'from');
    const url = `data:image/png;base64,${'A'.repeat(Math.ceil((25 * 1024 * 1024) / 3) * 4)}`;
    const out = failed((await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'url', url } }))).outcome);
    expect(out).toMatchObject({ reason: 'invalid_request', detail: 'startImage: the image exceeds 20 MB' });
    expect(fromSpy.mock.calls.some((c) => c[1] === 'base64')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bytes inputs are sent as they are', async () => {
    routeFetch();
    const base64 = JPEG.toString('base64');
    await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'bytes', base64, mimeType: 'image/jpeg' } }));
    expect(bodyOf(GEMINI_SUBMIT).instances[0]?.image).toEqual({ bytesBase64Encoded: base64, mimeType: 'image/jpeg' });
  });

  it('a gs:// input → invalid_request: the Gemini API cannot read our bucket', async () => {
    routeFetch();
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'gcs', uri: 'gs://my-bucket/a.png', mimeType: 'image/png' } }));
    expect(failed(res.outcome)).toMatchObject({ reason: 'invalid_request', retryable: false, detail: expect.stringMatching(/^startImage: .*gs:\/\//) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'http://cdn.example.com/a.png',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/a.png',
    'https://10.0.0.5/a.png',
    'ftp://cdn.example.com/a.png',
  ])('%s is refused before it is fetched', async (url) => {
    routeFetch();
    const out = failed((await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'url', url } }))).outcome);
    expect(out.reason).toBe('invalid_request');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('every redirect hop is re-vetted: public → private is refused after one fetch', async () => {
    routeFetch({ images: { [IMG_URL]: () => Promise.resolve(new Response(null, { status: 302, headers: { location: 'https://192.168.1.10/x.png' } })) } });
    const out = failed((await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'url', url: IMG_URL } }))).outcome);
    expect(out.reason).toBe('invalid_request');
    expect(calls()).toHaveLength(1);
  });

  it('a public redirect is followed', async () => {
    const NEXT = 'https://cdn2.example.com/final.png';
    routeFetch({
      images: {
        [IMG_URL]: () => Promise.resolve(new Response(null, { status: 301, headers: { location: NEXT } })),
        [NEXT]: () => Promise.resolve(image(PNG)),
      },
    });
    expect((await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'url', url: IMG_URL } }))).outcome.ok).toBe(true);
  });

  it.each<[string, string, boolean, () => Promise<Response>]>([
    ['HTTP 404', 'invalid_request', false, () => Promise.resolve(new Response('gone', { status: 404 }))],
    ['HTTP 403', 'invalid_request', false, () => Promise.resolve(new Response('no', { status: 403 }))],
    ['HTTP 503', 'unavailable', true, () => Promise.resolve(new Response('busy', { status: 503 }))],
    ['HTTP 429', 'unavailable', true, () => Promise.resolve(new Response('slow down', { status: 429 }))],
    ['a network error', 'unavailable', true, () => Promise.reject(new TypeError('fetch failed'))],
    ['a timeout', 'unavailable', true, () => Promise.reject(new DOMException('timeout', 'TimeoutError'))],
    ['over 20 MB (Content-Length)', 'invalid_request', false, () => Promise.resolve(image(PNG, 'image/png', { 'content-length': String(21 * 1024 * 1024) }))],
  ])('image host answers %s → %s (retryable=%s)', async (_label, reason, retryable, respond) => {
    routeFetch({ images: { [IMG_URL]: respond } });
    const out = failed((await createVeoClip(input({ prompt: 'x', aspect: '16:9', startImage: { kind: 'url', url: IMG_URL } }))).outcome);
    expect(out).toMatchObject({ reason, retryable });
    expect(out.detail).toMatch(/^startImage: /);
    expect(out.detail).not.toContain('SIGNED-SECRET');
    expect(out.detail).not.toContain('cdn.example.com');
    expect(callsTo(GEMINI_SUBMIT)).toHaveLength(0);
  });

  it('NO RE-POST: a timed-out Gemini submit is ambiguous and was POSTed exactly once', async () => {
    routeFetch({ gemini: () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')) });
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9' }));
    expect(res.outcome).toMatchObject({ ok: false, reason: 'ambiguous', retryable: false });
    expect(callsTo(GEMINI_SUBMIT)).toHaveLength(1);
  });

  it('video-only is not on the Gemini API: generateAudio false is adjusted back to true', async () => {
    routeFetch();
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9', generateAudio: false }));
    expect(res.request.generateAudio).toBe(true);
    expect(res.adjustments.map((a) => a.field)).toContain('generateAudio');
  });
});

// ── not configured ──────────────────────────────────────────────────────────────────────────────────────────────

describe('createVeoClip — no transport', () => {
  it('nothing configured → not_configured naming the missing env, nothing sent', async () => {
    const res = await createVeoClip(input({ prompt: 'x', aspect: '4:5', durationSec: 8 }));
    expect(res.transport).toBeNull();
    expect(res.model).toBe('');
    expect(res.request.aspect).toBe('9:16');
    expect(failed(res.outcome)).toMatchObject({ reason: 'not_configured', retryable: false });
    expect(failed(res.outcome).detail).toContain('GCP_PROJECT_ID');
    expect(failed(res.outcome).detail).toContain('no Gemini API key');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('pinned to Vertex but Vertex is incomplete → not_configured (not a silent Gemini render)', async () => {
    process.env.GEMINI_API_KEY = KEY;
    process.env.VEO_TRANSPORT = 'vertex';
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9' }));
    expect(failed(res.outcome).detail).toBe('VEO_TRANSPORT=vertex but Vertex AI is not configured: GCP_PROJECT_ID, GCP_VEO_BUCKET');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Gemini killed by GEMINI_VEO_ENABLED=0 says so', async () => {
    process.env.GEMINI_API_KEY = KEY;
    process.env.GEMINI_VEO_ENABLED = '0';
    const res = await createVeoClip(input({ prompt: 'x', aspect: '16:9' }));
    expect(failed(res.outcome).detail).toContain('GEMINI_VEO_ENABLED is off');
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
      `[veo] submit transport=vertex model=${VERTEX_MODEL} aspect=16:9 duration=8s resolution=1080p adjustments=1 → ok prompt="A lighthouse at dusk"`,
    );
  });

  it('a failure names the reason, status and retryability', async () => {
    useGemini();
    routeFetch({ gemini: () => Promise.resolve(json(429, { error: { code: 429, message: 'quota', status: 'RESOURCE_EXHAUSTED' } })) });
    await createVeoClip(input({ prompt: 'x', aspect: '16:9' }));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain(`transport=gemini model=${GEMINI_MODEL} `);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('→ rate_limited http=429 retryable=true');
  });

  it('never carries the full prompt, URLs, base64, the token or the key', async () => {
    useGemini();
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
  it('a Vertex operation polls Vertex (even when the current transport is Gemini)', async () => {
    useGemini();
    fetchMock.mockResolvedValueOnce(json(200, { done: false }));
    expect(await pollVeoClip(` ${VERTEX_OP} `)).toStrictEqual({ state: 'processing' });
    expect(calls()[0]?.[0]).toBe(VERTEX_SUBMIT.replace(':predictLongRunning', ':fetchPredictOperation'));
    expect(JSON.parse(String(calls()[0]?.[1].body))).toStrictEqual({ operationName: VERTEX_OP });
  });

  it('a Gemini operation polls the Gemini API (even when the current transport is Vertex)', async () => {
    useVertex();
    process.env.GEMINI_API_KEY = KEY;
    fetchMock.mockResolvedValueOnce(
      json(200, { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/f:download?alt=media' } }] } } }),
    );
    expect(await pollVeoClip(GEMINI_OP)).toStrictEqual({
      state: 'succeeded',
      videos: [{ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/f:download?alt=media', mimeType: 'video/mp4' }],
    });
    expect(calls()[0]?.[0]).toBe(`https://generativelanguage.googleapis.com/v1beta/${GEMINI_OP}`);
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
