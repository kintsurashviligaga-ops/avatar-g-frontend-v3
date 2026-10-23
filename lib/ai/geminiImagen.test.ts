/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./geminiFallbackReport', () => ({ reportGeminiFallback: jest.fn() }));
jest.mock('../veo/vertexAuth', () => ({
  ...jest.requireActual('../veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));

import { mapImagenAspect, geminiImagenModel, hasGeminiImagenProvider, generateImagenImages } from './geminiImagen';
import { reportGeminiFallback } from './geminiFallbackReport';

/** Vertex AI with Workload Identity (MASTER TASK v3.1: the only transport). Only the token mint is mocked. */
const WIF = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const ENV = ['GEMINI_IMAGEN_MODEL', 'GEMINI_IMAGEN_ENABLED', 'GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GOOGLE_GENERATIVE_AI_API_KEY',
  'GEMINI_TRANSPORT', 'GEMINI_IMAGE_TRANSPORT', 'GCP_PREDICT_LOCATION', 'GCP_GEMINI_LOCATION', ...Object.keys(WIF)];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('Imagen 4 — aspect mapping', () => {
  it('passes through the five ratios Imagen actually accepts', () => {
    for (const a of ['1:1', '16:9', '9:16', '4:3', '3:4'] as const) {
      expect(mapImagenAspect(a)).toBe(a);
    }
  });

  it('snaps an unsupported ratio to the nearest supported one instead of a square surprise', () => {
    // The studio offers 4:5 (portrait) and 3:2 (landscape); Imagen accepts neither.
    expect(mapImagenAspect('4:5')).toBe('3:4');
    expect(mapImagenAspect('2:3')).toBe('3:4');
    expect(mapImagenAspect('3:2')).toBe('4:3');
    expect(mapImagenAspect('21:9')).toBe('4:3');
  });

  it('defaults to 1:1 for junk/empty input rather than throwing', () => {
    expect(mapImagenAspect(undefined)).toBe('1:1');
    expect(mapImagenAspect(null)).toBe('1:1');
    expect(mapImagenAspect('nonsense')).toBe('1:1');
  });
});

describe('Imagen 4 — model + kill switch', () => {
  it('defaults to imagen-4.0-generate-001 and is env-overridable', () => {
    expect(geminiImagenModel()).toBe('imagen-4.0-generate-001');
    process.env.GEMINI_IMAGEN_MODEL = 'imagen-4.0-fast-generate-001';
    expect(geminiImagenModel()).toBe('imagen-4.0-fast-generate-001');
  });

  it('is OPT-IN — a configured but unfunded project must not be tried ahead of the next engine on every render', () => {
    Object.assign(process.env, WIF);
    expect(hasGeminiImagenProvider()).toBe(false);
    process.env.GEMINI_IMAGEN_ENABLED = '1';
    expect(hasGeminiImagenProvider()).toBe(true);
    process.env.GEMINI_IMAGEN_ENABLED = '0';
    expect(hasGeminiImagenProvider()).toBe(false);
  });

  it('is OFF without Vertex — a Developer API key never means "try anyway"', () => {
    process.env.GEMINI_IMAGEN_ENABLED = '1';
    process.env.GEMINI_API_KEY = 'test-key';
    expect(hasGeminiImagenProvider()).toBe(false);
    Object.assign(process.env, WIF, { GEMINI_IMAGE_TRANSPORT: 'gemini_api' });
    expect(hasGeminiImagenProvider()).toBe(false);
  });

  it('is OFF when GEMINI_IMAGEN_MODEL names Imagen 3, which Google discontinued on Vertex AI (MASTER TASK v3.1, PR 8)', () => {
    Object.assign(process.env, WIF, { GEMINI_IMAGEN_ENABLED: '1' });
    for (const id of ['imagen-3.0-generate-002', 'imagen-3.0-fast-generate-001']) {
      process.env.GEMINI_IMAGEN_MODEL = id;
      expect(hasGeminiImagenProvider()).toBe(false);
    }
    process.env.GEMINI_IMAGEN_MODEL = 'imagen-4.0-fast-generate-001';
    expect(hasGeminiImagenProvider()).toBe(true);
  });
});

describe('Imagen 4 — Vertex AI only (bearer token, never an API key)', () => {
  const KEY = 'AQ.test-imagen-key-0123456789abcdef';
  const realFetch = global.fetch;
  const fetchMock = jest.fn();
  const reported = reportGeminiFallback as jest.MockedFunction<typeof reportGeminiFallback>;

  beforeEach(() => {
    Object.assign(process.env, WIF);
    process.env.GEMINI_API_KEY = KEY;
    fetchMock.mockReset();
    reported.mockClear();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('POSTs the regional Vertex :predict with a bearer token, no key anywhere, and redirect: manual', async () => {
    const png = Buffer.from('fake-png-bytes').toString('base64');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ predictions: [{ bytesBase64Encoded: png, mimeType: 'image/png' }] }), { status: 200 }));

    const out = await generateImagenImages({ prompt: 'a red kite over a green hill', aspectRatio: '4:5' });

    expect(out).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/us-central1/publishers/google/models/imagen-4.0-generate-001:predict',
    );
    expect(init.headers.Authorization).toBe('Bearer vertex-token');
    expect(init.headers['x-goog-api-key']).toBeUndefined();
    expect(JSON.stringify([url, init.headers])).not.toContain(KEY);
    expect(init.redirect).toBe('manual');
    expect(JSON.parse(String(init.body))).toEqual({
      instances: [{ prompt: 'a red kite over a green hill' }],
      parameters: { sampleCount: 1, aspectRatio: '3:4', personGeneration: 'allow_all' },
    });
  });

  it.each([
    ['Vertex is not configured (only a key)', () => { for (const k of Object.keys(WIF)) delete process.env[k]; }],
    ['GEMINI_IMAGE_TRANSPORT=gemini_api', () => { process.env.GEMINI_IMAGE_TRANSPORT = 'gemini_api'; }],
    ['GEMINI_TRANSPORT=gemini_api', () => { process.env.GEMINI_TRANSPORT = 'gemini_api'; }],
  ])('%s → null and nothing is sent', async (_label, arrange) => {
    arrange();
    expect(await generateImagenImages({ prompt: 'x' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an Imagen 3 GEMINI_IMAGEN_MODEL → null before any token or POST, and nothing to report', async () => {
    process.env.GEMINI_IMAGEN_MODEL = 'imagen-3.0-generate-002';
    expect(await generateImagenImages({ prompt: 'x' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reported).not.toHaveBeenCalled();
  });

  it('an error status → null, reported with the status', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad request', { status: 400 }));
    expect(await generateImagenImages({ prompt: 'x' })).toBeNull();
    expect(reported.mock.calls[0]![0]).toMatchObject({ leg: 'imagen', status: 400, detail: 'bad request' });
  });

  it('a thrown fetch → null, reported', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await generateImagenImages({ prompt: 'x' })).toBeNull();
    expect(reported.mock.calls[0]![0]).toMatchObject({ leg: 'imagen', detail: 'fetch failed' });
  });
});
