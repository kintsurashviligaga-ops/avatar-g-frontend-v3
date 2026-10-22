/** @jest-environment node */
/**
 * embed() — Gemini first, on Vertex AI `:predict` with a bearer token (v3.1: no AI Studio key, never a credential in
 * the URL), every call time-bounded, and no OpenAI fallback under AI_GOOGLE_ONLY (its vectors live in a different
 * embedding space). fetch, the Vertex token and reportError are mocked — no network.
 */
jest.mock('server-only', () => ({}));
jest.mock('../veo/vertexAuth', () => ({
  ...jest.requireActual('../veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));
const mockReport = jest.fn();
jest.mock('../observability/report-error', () => ({ reportError: (...a: unknown[]) => mockReport(...a) }));

import { embed, EMBED_TIMEOUT_MS } from './embed';

const ENV = { ...process.env };
const VERTEX_ENV = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const PREDICT_URL =
  'https://us-central1-aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/us-central1/publishers/google/models/gemini-embedding-001:predict';
const prediction = (values: number[]) => ({ predictions: [{ embeddings: { values } }] });
const vec = (n = 1536) => Array.from({ length: n }, (_, i) => i / n);
const fetchMock = jest.fn();

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) });
const fail = (status: number, text = 'boom') => ({ ok: false, status, json: async () => ({}), text: async () => text });

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  delete process.env.AI_GOOGLE_ONLY;
  delete process.env.GEMINI_API_KEYS;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.GEMINI_TRANSPORT;
  delete process.env.GCP_PREDICT_LOCATION;
  Object.assign(process.env, VERTEX_ENV);
  // A leftover AI Studio key changes nothing: it is never read or sent.
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';
});
afterEach(() => {
  for (const [url] of fetchMock.mock.calls) expect(String(url)).not.toContain('generativelanguage.googleapis.com');
  process.env = { ...ENV };
});

test('Gemini on Vertex AI: regional :predict with a bearer token, no key anywhere, and a timeout signal', async () => {
  fetchMock.mockResolvedValueOnce(ok(prediction(vec())));
  await expect(embed('hello')).resolves.toHaveLength(1536);

  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toBe(PREDICT_URL);
  expect(String(url)).not.toContain('key=');
  expect(init.headers.Authorization).toBe('Bearer vertex-token');
  expect(init.headers['x-goog-api-key']).toBeUndefined();
  expect(JSON.parse(String(init.body))).toEqual({
    instances: [{ content: 'hello', task_type: 'SEMANTIC_SIMILARITY' }],
    parameters: { outputDimensionality: 1536 },
  });
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(EMBED_TIMEOUT_MS).toBeGreaterThan(0);
});

test('a vector of the wrong size is a reported miss, never stored', async () => {
  fetchMock.mockResolvedValueOnce(ok(prediction(vec(768))));
  await expect(embed('hello')).resolves.toBeNull();
  expect(mockReport).toHaveBeenCalledTimes(1);
});

test('Google-only (default): a Gemini miss is a miss — OpenAI is never called', async () => {
  fetchMock.mockResolvedValueOnce(fail(402, 'prepay depleted'));
  await expect(embed('hello')).resolves.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(mockReport).toHaveBeenCalledTimes(1);
});

test('Google-only with Vertex AI unconfigured: null and no call at all, whatever AI Studio keys exist', async () => {
  for (const k of Object.keys(VERTEX_ENV)) delete process.env[k];
  process.env.GEMINI_API_KEYS = 'pool-key-1, pool-key-2';
  await expect(embed('hello')).resolves.toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('GEMINI_TRANSPORT=gemini_api (the Developer API): null and no call at all', async () => {
  process.env.GEMINI_TRANSPORT = 'gemini_api';
  await expect(embed('hello')).resolves.toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('kill switch AI_GOOGLE_ONLY=0: the OpenAI fallback still runs (time-bounded too)', async () => {
  process.env.AI_GOOGLE_ONLY = '0';
  fetchMock.mockResolvedValueOnce(fail(500)).mockResolvedValueOnce(ok({ data: [{ embedding: vec() }] }));
  await expect(embed('hello')).resolves.toHaveLength(1536);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [url, init] = fetchMock.mock.calls[1];
  expect(String(url)).toBe('https://api.openai.com/v1/embeddings');
  expect(init.signal).toBeInstanceOf(AbortSignal);
});

test('a timeout / network error is caught (never throws) and reported', async () => {
  fetchMock.mockRejectedValueOnce(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }));
  await expect(embed('hello')).resolves.toBeNull();
  expect(mockReport).toHaveBeenCalled();
});

test('empty input never calls a provider', async () => {
  await expect(embed('   ')).resolves.toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
