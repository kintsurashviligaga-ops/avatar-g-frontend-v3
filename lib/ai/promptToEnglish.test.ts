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
