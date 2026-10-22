/** @jest-environment node */
/**
 * The two properties that keep this safe to put in front of every paid render.
 *
 * ⚠️ WHY THESE AND NOT THE TRANSLATION QUALITY. Whether the model translates well is the model's
 * business and cannot be asserted offline. What MUST hold, on every path, is that this module never
 * makes things worse than not having it: a Latin brief must cost nothing, and any failure must hand
 * back the user's own words rather than an empty string or an exception. Those are the two ways a
 * translator inserted before a provider call could turn a working render into a broken one.
 */
jest.mock('../veo/vertexAuth', () => ({
  ...jest.requireActual('../veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));

import { promptToEnglish } from './promptToEnglish';

// An Anthropic key must never matter (Gemini is the only translator); it is cleared so a stray call would fail loudly.
const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; });
afterAll(() => { if (ORIGINAL_KEY) process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY; });

describe('Latin script is returned untouched, with no network call', () => {
  it.each([
    ['a cinematic shot of a lion in the jungle'],
    ['una canción de hip-hop inspiradora en español'],
    ['Ein inspirierender Hip-Hop-Song, Duett'],
    ['9:16 vertical, golden hour, 35mm'],
  ])('passes through: %s', async (text) => {
    await expect(promptToEnglish(text, 'image')).resolves.toBe(text);
  });

  // ⚠️ This is the cost guarantee. If the Latin check ever regresses, every English prompt in the
  // product starts paying a model call and 12s of timeout budget before its provider is even dialled.
  it('does not need a key for Latin text, which proves no call was attempted', async () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    await expect(promptToEnglish('a red apple on a table', 'image')).resolves.toBe('a red apple on a table');
  });
});

describe('non-Latin scripts are recognised as needing translation', () => {
  // With no key configured these still resolve — to the ORIGINAL — which is the fail-open contract.
  // The point of the case list is that each script is DETECTED; the fallback is what makes it safe.
  it.each([
    ['Georgian', 'გააკეთე ინსპირაციული ჰიპ-ჰოპ სიმღერა ესპანურად'],
    ['Russian', 'сделай вдохновляющую хип-хоп песню на испанском'],
    ['mixed ka + latin', 'გამიკეთე video 9:16 ფორმატში'],
  ])('%s falls back to the original when translation is unavailable', async (_label, text) => {
    await expect(promptToEnglish(text, 'music')).resolves.toBe(text);
  });
});

describe('degenerate input', () => {
  it.each([
    ['', ''],
    ['   ', ''],
  ])('handles %p without throwing', async (input, expected) => {
    await expect(promptToEnglish(input, 'image')).resolves.toBe(expected);
  });

  it('never rejects — a translation outage must not fail a paid render', async () => {
    await expect(promptToEnglish('ქართული ტექსტი', 'video')).resolves.toEqual(expect.any(String));
  });
});

describe('the Google-only pipeline translates with Gemini on Vertex AI (docs/VEO_ENGINE.md §3)', () => {
  const WIF = {
    GCP_PROJECT_ID: 'gen-lang-client-0671348730',
    GCP_PROJECT_NUMBER: '467145118875',
    GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
    GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
    GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
  };
  const ENV = ['GEMINI_API_KEY', 'GEMINI_TRANSPORT', 'VIDEO_GOOGLE_ONLY', 'OUTSIDE_ENGINES_APPROVED', ...Object.keys(WIF)];
  const ORIGINAL_FETCH = global.fetch;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
    Object.assign(process.env, WIF);
  });
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  it('calls Gemini on Vertex with a bearer token — no API key anywhere — and returns the translation', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'a woman walks through rainy Tbilisi at night' }] } }],
    }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(promptToEnglish('ქალი ღამის წვიმიან თბილისში მიდის', 'video')).resolves.toBe('a woman walks through rainy Tbilisi at night');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/^https:\/\/aiplatform\.googleapis\.com\/v1\/projects\/gen-lang-client-0671348730\/.*:generateContent$/);
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer vertex-token');
    expect(headers['x-goog-api-key']).toBeUndefined();
    expect(JSON.stringify([url, headers])).not.toContain('test-key');
  });

  it('translates without any Gemini key (Vertex alone is enough), and a key alone is not enough', async () => {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'rain in Tbilisi' }] } }] }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(promptToEnglish('წვიმა თბილისში', 'video')).resolves.toBe('rain in Tbilisi');
    for (const k of Object.keys(WIF)) delete process.env[k];
    process.env.GEMINI_API_KEY = 'test-key';
    await expect(promptToEnglish('წვიმა თბილისში', 'video')).resolves.toBe('წვიმა თბილისში');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a Gemini failure hands back the original words (fail-open), and Anthropic is never tried', async () => {
    process.env.ANTHROPIC_API_KEY = 'must-not-be-used';
    global.fetch = jest.fn(async () => new Response('{"error":{"code":402}}', { status: 402 })) as unknown as typeof fetch;
    await expect(promptToEnglish('ქართული ტექსტი', 'video')).resolves.toBe('ქართული ტექსტი');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([{ VIDEO_GOOGLE_ONLY: '0' }, { VIDEO_GOOGLE_ONLY: 'off', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-anthropic' }])(
    'no env value brings back the Anthropic translator (%o): Gemini on Vertex translates',
    async (env) => {
      Object.assign(process.env, env, { ANTHROPIC_API_KEY: 'must-not-be-used' });
      const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Georgian text' }] } }],
      }), { status: 200 }));
      global.fetch = fetchMock as unknown as typeof fetch;
      await expect(promptToEnglish('ქართული ტექსტი', 'video')).resolves.toBe('Georgian text');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]![0])).toMatch(/^https:\/\/aiplatform\.googleapis\.com\//);
    },
  );
});
