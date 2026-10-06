/** @jest-environment node */
/**
 * embed() — Gemini first with the key in the x-goog-api-key HEADER (never the URL), every call time-bounded,
 * and no OpenAI fallback under AI_GOOGLE_ONLY (its vectors live in a different embedding space). fetch and
 * reportError are mocked — no network.
 */
jest.mock('server-only', () => ({}));
const mockReport = jest.fn();
jest.mock('../observability/report-error', () => ({ reportError: (...a: unknown[]) => mockReport(...a) }));

import { embed, EMBED_TIMEOUT_MS } from './embed';

const ENV = { ...process.env };
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
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';
});
afterEach(() => {
  process.env = { ...ENV };
});

test('Gemini: the key travels in x-goog-api-key, never in the URL, and the call carries a timeout signal', async () => {
  fetchMock.mockResolvedValueOnce(ok({ embedding: { values: vec() } }));
  await expect(embed('hello')).resolves.toHaveLength(1536);

  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent');
  expect(String(url)).not.toContain('key=');
  expect(String(url)).not.toContain('test-gemini-key');
  expect(init.headers['x-goog-api-key']).toBe('test-gemini-key');
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(EMBED_TIMEOUT_MS).toBeGreaterThan(0);
});

test('deprecated key pools cannot activate embedding calls', async () => {
  delete process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEYS = 'pool-key-1, pool-key-2';
  fetchMock.mockResolvedValueOnce(ok({ embedding: { values: vec() } }));
  await expect(embed('hello')).resolves.toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('Google-only (default): a Gemini miss is a miss — OpenAI is never called', async () => {
  fetchMock.mockResolvedValueOnce(fail(402, 'prepay depleted'));
  await expect(embed('hello')).resolves.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(mockReport).toHaveBeenCalledTimes(1);
});

test('Google-only with no Gemini key at all: null, and no OpenAI call', async () => {
  delete process.env.GEMINI_API_KEY;
  await expect(embed('hello')).resolves.toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('AI_GOOGLE_ONLY=0 cannot restore the OpenAI embedding fallback', async () => {
  process.env.AI_GOOGLE_ONLY = '0';
  fetchMock.mockResolvedValueOnce(fail(500));
  await expect(embed('hello')).resolves.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toContain('generativelanguage.googleapis.com');
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
