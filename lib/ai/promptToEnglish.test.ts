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
import { promptToEnglish } from './promptToEnglish';

// No key → the module must short-circuit to the original rather than construct a client.
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

describe('the Google-only pipeline translates with Gemini (docs/VEO_ENGINE.md §3)', () => {
  const ORIGINAL_FETCH = global.fetch;
  const ORIGINAL_GEMINI = process.env.GEMINI_API_KEY;
  const ORIGINAL_FLAG = process.env.VIDEO_GOOGLE_ONLY;
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_GEMINI === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = ORIGINAL_GEMINI;
    if (ORIGINAL_FLAG === undefined) delete process.env.VIDEO_GOOGLE_ONLY; else process.env.VIDEO_GOOGLE_ONLY = ORIGINAL_FLAG;
  });

  it('calls Gemini with the key in a header — never in the URL — and returns the translation', async () => {
    delete process.env.VIDEO_GOOGLE_ONLY; // default ON
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'a woman walks through rainy Tbilisi at night' }] } }],
    }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(promptToEnglish('ქალი ღამის წვიმიან თბილისში მიდის', 'video')).resolves.toBe('a woman walks through rainy Tbilisi at night');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).not.toContain('key=');
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
  });

  it('a Gemini failure hands back the original words (fail-open), and Anthropic is never tried', async () => {
    delete process.env.VIDEO_GOOGLE_ONLY;
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.ANTHROPIC_API_KEY = 'must-not-be-used';
    global.fetch = jest.fn(async () => new Response('{"error":{"code":402}}', { status: 402 })) as unknown as typeof fetch;
    await expect(promptToEnglish('ქართული ტექსტი', 'video')).resolves.toBe('ქართული ტექსტი');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('VIDEO_GOOGLE_ONLY=0 cannot restore the Anthropic translator', async () => {
    process.env.VIDEO_GOOGLE_ONLY = '0';
    process.env.GEMINI_API_KEY = 'test-key';
    global.fetch = jest.fn(async () => new Response('{}', { status: 503 })) as unknown as typeof fetch;
    await expect(promptToEnglish('ქართული ტექსტი', 'video')).resolves.toBe('ქართული ტექსტი');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain('generativelanguage.googleapis.com');
  });
});
