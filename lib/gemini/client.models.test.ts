/** @jest-environment node */
/**
 * generateWithGemini's per-call `model` (llmText's geminiModel ← VEO_DIRECTOR_MODEL) gets the same guard as the tier
 * env (lib/ai/google/retiredModels.test.ts): a retired, empty or malformed id never reaches the Google URL — the tier
 * model answers instead. No network: fetch and the Vertex token are stubs. v3.1: the URL is Vertex AI's, never the
 * Developer API's, whatever AI Studio key is set.
 */
jest.mock('../veo/vertexAuth', () => ({
  ...jest.requireActual('../veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));

import { DEFAULT_REST_TIER_MODELS } from '@/lib/ai/google/models';

import { generateWithGemini } from './client';

const BASE = 'https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/global/publishers/google/models';
const ENV = { ...process.env };
const realFetch = global.fetch;

beforeEach(() => {
  process.env = {
    ...ENV,
    GCP_PROJECT_ID: 'gen-lang-client-0671348730',
    GCP_PROJECT_NUMBER: '467145118875',
    GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
    GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
    GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
    // A leftover AI Studio key changes nothing.
    GEMINI_API_KEY: 'test-key',
  };
  delete process.env.GEMINI_TRANSPORT;
  delete process.env.GCP_GEMINI_LOCATION;
  delete process.env.GCP_VEO_LOCATION;
});

afterEach(() => {
  process.env = { ...ENV };
  global.fetch = realFetch;
});

async function urlFor(model: string | undefined, tier: 'pro' | 'flash' = 'pro'): Promise<string> {
  const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    text: async () => '',
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  const out = await generateWithGemini({ prompt: 'hi', tier, model });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe(`${BASE}/${out.model}:generateContent`);
  const headers = init!.headers as Record<string, string>;
  expect(headers.Authorization).toBe('Bearer vertex-token');
  expect(headers['x-goog-api-key']).toBeUndefined();
  return url;
}

describe('generateWithGemini — the model in the URL', () => {
  it.each(['gemini-2.0-flash', 'models/gemini-1.5-pro-latest', 'GEMINI-2.0-FLASH-LITE', '../../v1/files?key=1', '   '])(
    'a per-call model %p falls back to the tier model',
    async (model) => {
      const url = await urlFor(model);
      expect(url).toBe(`${BASE}/${DEFAULT_REST_TIER_MODELS.pro}:generateContent`);
      expect(url).not.toMatch(/gemini-(1\.5|2\.0)-/i);
    },
  );

  it('falls back to the requested tier, not always pro', async () => {
    expect(await urlFor('gemini-1.5-flash-8b', 'flash')).toBe(`${BASE}/${DEFAULT_REST_TIER_MODELS.flash}:generateContent`);
  });

  it('a current per-call model is used, and a models/ prefix no longer doubles into models/models/', async () => {
    expect(await urlFor('models/gemini-3.8-flash')).toBe(`${BASE}/gemini-3.8-flash:generateContent`);
    expect(await urlFor(' gemini-3.1-pro-preview\n')).toBe(`${BASE}/gemini-3.1-pro-preview:generateContent`);
  });

  it('no per-call model → the tier model', async () => {
    expect(await urlFor(undefined)).toBe(`${BASE}/${DEFAULT_REST_TIER_MODELS.pro}:generateContent`);
  });
});

describe('googleSearch: the answer may be grounded in Google Search', () => {
  async function bodyFor(req: Parameters<typeof generateWithGemini>[0]): Promise<Record<string, unknown>> {
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
      text: async () => '',
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await generateWithGemini(req);
    return JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as Record<string, unknown>;
  }

  test('on → tools: [{ googleSearch: {} }]; off (the default) → no tools', async () => {
    expect((await bodyFor({ prompt: 'weather in Tbilisi', googleSearch: true })).tools).toEqual([{ googleSearch: {} }]);
    expect((await bodyFor({ prompt: 'hi' })).tools).toBeUndefined();
  });

  test('never together with a forced JSON response (the API refuses the pair)', async () => {
    const body = await bodyFor({ prompt: 'plan', googleSearch: true, responseMimeType: 'application/json' });
    expect(body.tools).toBeUndefined();
    expect((body.generationConfig as Record<string, unknown>).responseMimeType).toBe('application/json');
  });
});

describe('generateWithGemini — what the call used (Agent G PART 5, G3/G7)', () => {
  const reply = (usageMetadata: unknown) => {
    global.fetch = jest.fn(async () => ({
      ok: true, status: 200, text: async () => '',
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }], usageMetadata }),
    })) as unknown as typeof fetch;
  };

  it('reads cache hits, thinking and the total beside prompt and output, and times the call', async () => {
    reply({ promptTokenCount: 1500, candidatesTokenCount: 40, cachedContentTokenCount: 1024, thoughtsTokenCount: 12, totalTokenCount: 1552 });
    const out = await generateWithGemini({ prompt: 'hi', tier: 'flash' });
    expect(out).toMatchObject({ tokensIn: 1500, tokensOut: 40, tokensCached: 1024, tokensThinking: 12, tokensTotal: 1552 });
    expect(typeof out.latencyMs).toBe('number');
    expect(out.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('leaves out a count Gemini did not report, or reported as garbage', async () => {
    reply({ promptTokenCount: 10, candidatesTokenCount: 2, cachedContentTokenCount: 'lots', thoughtsTokenCount: -1 });
    const out = await generateWithGemini({ prompt: 'hi', tier: 'flash' });
    expect(out).not.toHaveProperty('tokensCached');
    expect(out).not.toHaveProperty('tokensThinking');
    expect(out).not.toHaveProperty('tokensTotal');
  });
});

describe('generateWithGemini — a thinking budget in the knob the model takes', () => {
  async function thinkingSent(model: string | undefined, thinkingBudget: number) {
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true, status: 200, text: async () => '',
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const out = await generateWithGemini({ prompt: 'hi', tier: 'flash', model, thinkingBudget });
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    return { model: out.model, thinking: body.generationConfig.thinkingConfig };
  }

  test('3.8 Flash (the flash tier) gets thinkingLevel low for budget 0, never a thinkingBudget it ignores', async () => {
    expect(await thinkingSent(undefined, 0)).toEqual({ model: DEFAULT_REST_TIER_MODELS.flash, thinking: { thinkingLevel: 'low' } });
  });

  test("3.6 Flash and Flash-Lite take 'minimal'; Pro never does", async () => {
    expect((await thinkingSent('gemini-3.6-flash', 0)).thinking).toEqual({ thinkingLevel: 'minimal' });
    expect((await thinkingSent('gemini-3.1-flash-lite', 0)).thinking).toEqual({ thinkingLevel: 'minimal' });
    expect((await thinkingSent('gemini-3.1-pro-preview', 0)).thinking).toEqual({ thinkingLevel: 'low' });
  });

  test('2.5 keeps the budget; a dynamic budget on Gemini 3 leaves the model its default', async () => {
    expect((await thinkingSent('gemini-2.5-flash', 0)).thinking).toEqual({ thinkingBudget: 0 });
    expect((await thinkingSent('gemini-3.8-flash', -1)).thinking).toBeUndefined();
    expect((await thinkingSent('gemini-3.8-flash', 2048)).thinking).toEqual({ thinkingLevel: 'low' });
  });
});
