/** @jest-environment node */
/**
 * groundedWebSearch — the agent's web_search on Gemini + Google Search grounding.
 * streamGeminiChat and the budget are mocked: no network, no spend. v3.1: the gate is Vertex AI's configuration,
 * never an AI Studio key.
 */
jest.mock('server-only', () => ({}));

const mockStream = jest.fn();
jest.mock('../../ai/google/chatStream', () => ({
  streamGeminiChat: (...a: unknown[]) => mockStream(...a),
  unbookedAttempts: jest.requireActual('../../ai/google/chatStream').unbookedAttempts,
}));
const mockAllows = jest.fn(async () => true);
const mockBook = jest.fn(async () => undefined);
jest.mock('../../services/billing/chatBudget', () => ({
  chatBudgetAllows: (...a: unknown[]) => (mockAllows as (...x: unknown[]) => Promise<boolean>)(...a),
  bookChatUsage: (...a: unknown[]) => (mockBook as (...x: unknown[]) => Promise<void>)(...a),
}));

import { groundedWebSearch, GROUNDED_SEARCH_SYSTEM } from './googleSearch';

const USER = '11111111-2222-4333-8444-555555555555';
const ENV = { ...process.env };
const VERTEX_ENV = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAllows.mockResolvedValue(true);
  delete process.env.GEMINI_CHAT_MODELS;
  delete process.env.GEMINI_TRANSPORT;
  Object.assign(process.env, VERTEX_ENV);
  process.env.GEMINI_API_KEY = 'test-key';
});
afterEach(() => {
  process.env = { ...ENV };
});

test('a grounded answer comes back in the Tavily shape, and the call is booked with grounding queries + user', async () => {
  mockStream.mockResolvedValue({
    ok: true,
    model: 'gemini-3.8-flash',
    text: '  Tbilisi is the capital of Georgia.  ',
    usage: { inputTokens: 40, outputTokens: 12, totalTokens: 52 },
    sources: [
      { url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'wikipedia.org' },
      { url: 'https://example.com/page' },
    ],
    attempts: [{ model: 'gemini-3.8-flash' }],
    groundingQueries: 2,
  });

  const r = await groundedWebSearch('capital of Georgia', { userId: USER });

  expect(r).toEqual({
    ok: true,
    answer: 'Tbilisi is the capital of Georgia.',
    model: 'gemini-3.8-flash',
    results: [
      { title: 'wikipedia.org', url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', content: '' },
      { title: 'example.com', url: 'https://example.com/page', content: '' },
    ],
  });

  const input = mockStream.mock.calls[0][0];
  // No AI Studio key travels to the model call (v3.1).
  expect(input.apiKey).toBeUndefined();
  expect(JSON.stringify(input)).not.toContain('test-key');
  expect(input.models).toEqual(['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash']);
  expect(input.messages).toEqual([{ role: 'user', content: 'capital of Georgia' }]);
  expect(input.config).toMatchObject({
    system: GROUNDED_SEARCH_SYSTEM,
    googleSearch: true,
    thinking: { level: 'off' },
    maxOutputTokens: 1024,
  });
  // The platform safety floor, never looser.
  expect(input.config.safetySettings).toHaveLength(4);
  for (const s of input.config.safetySettings) expect(s.threshold).toBe('BLOCK_ONLY_HIGH');
  expect(input.abortSignal).toBeInstanceOf(AbortSignal);

  expect(mockBook).toHaveBeenCalledWith(
    expect.objectContaining({ model: 'gemini-3.8-flash', inputTokens: 40, outputTokens: 12, userId: USER, groundingQueries: 2 }),
  );
});

test('a typed Gemini failure is reported as its code (quota reads as quota, not "no results")', async () => {
  mockStream.mockResolvedValue({
    ok: false,
    model: 'gemini-3.8-flash',
    text: '',
    sources: [],
    error: { code: 'quota', retryable: false, message: 'prepay depleted' },
    attempts: [{ model: 'gemini-3.8-flash', code: 'quota' }],
  });
  await expect(groundedWebSearch('news today')).resolves.toEqual({ ok: false, code: 'quota' });
  // Nothing was consumed (no usage reported) → nothing booked.
  expect(mockBook).not.toHaveBeenCalled();
});

test('the budget guard refuses before any Gemini call', async () => {
  mockAllows.mockResolvedValue(false);
  await expect(groundedWebSearch('weather in Batumi')).resolves.toEqual({ ok: false, code: 'budget' });
  expect(mockStream).not.toHaveBeenCalled();
});

test('Vertex AI unconfigured → auth (an AI Studio key does not help), an empty query → bad_request; neither calls Gemini', async () => {
  for (const k of Object.keys(VERTEX_ENV)) delete process.env[k];
  await expect(groundedWebSearch('anything')).resolves.toEqual({ ok: false, code: 'auth' });
  Object.assign(process.env, VERTEX_ENV);
  process.env.GEMINI_TRANSPORT = 'gemini_api';
  await expect(groundedWebSearch('anything')).resolves.toEqual({ ok: false, code: 'auth' });
  delete process.env.GEMINI_TRANSPORT;
  await expect(groundedWebSearch('  ')).resolves.toEqual({ ok: false, code: 'bad_request' });
  expect(mockStream).not.toHaveBeenCalled();
});

test('maxResults bounds the source list', async () => {
  mockStream.mockResolvedValue({
    ok: true,
    model: 'gemini-3.8-flash',
    text: 'answer',
    sources: Array.from({ length: 8 }, (_, i) => ({ url: `https://s${i}.example.com/`, title: `S${i}` })),
    attempts: [{ model: 'gemini-3.8-flash' }],
  });
  const r = await groundedWebSearch('q?', { maxResults: 3 });
  expect(r.ok && r.results.map((x) => x.title)).toEqual(['S0', 'S1', 'S2']);
});
