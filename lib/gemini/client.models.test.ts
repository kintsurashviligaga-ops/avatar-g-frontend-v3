/** @jest-environment node */
/**
 * generateWithGemini's per-call `model` (llmText's geminiModel ← VEO_DIRECTOR_MODEL) gets the same guard as the tier
 * env (lib/ai/google/retiredModels.test.ts): a retired, empty or malformed id never reaches the Google URL — the tier
 * model answers instead. No network: fetch is a stub.
 */
import { DEFAULT_REST_TIER_MODELS } from '@/lib/ai/google/models';

import { generateWithGemini } from './client';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const ENV = { ...process.env };
const realFetch = global.fetch;

beforeEach(() => {
  process.env = { ...ENV, GEMINI_API_KEY: 'test-key' };
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
  const url = fetchMock.mock.calls[0]![0];
  expect(url).toBe(`${BASE}/${out.model}:generateContent`);
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
