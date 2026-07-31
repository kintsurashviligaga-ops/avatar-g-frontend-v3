/** @jest-environment node */
import { hasVideoProvider, hasGeminiVeoKey } from './videoProvider';

const E = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe('a Gemini-only configuration can render', () => {
  it('THE TRAP: Veo is the PRIMARY clip engine, and this gate did not count it — so removing the legacy '
    + 'tokens skipped every scene before Veo was ever asked', () => {
    expect(hasVideoProvider(E({ GEMINI_API_KEY: 'k' }))).toBe(true);
  });

  it('accepts the alias key the rest of the app also resolves', () => {
    expect(hasVideoProvider(E({ GOOGLE_GENERATIVE_AI_API_KEY: 'k' }))).toBe(true);
  });
});

describe('the kill-switch still kills', () => {
  it.each([['0'], ['false'], ['no'], ['off'], ['OFF'], [' False ']])('GEMINI_VEO_ENABLED=%p disables Veo', (v) => {
    expect(hasGeminiVeoKey(E({ GEMINI_API_KEY: 'k', GEMINI_VEO_ENABLED: v }))).toBe(false);
  });

  it('and with Veo killed and no other provider, the pipeline correctly refuses to spend', () => {
    expect(hasVideoProvider(E({ GEMINI_API_KEY: 'k', GEMINI_VEO_ENABLED: '0' }))).toBe(false);
  });

  it('any other value leaves Veo enabled — live-by-default, not opt-in', () => {
    for (const v of ['', '1', 'true', 'yes', 'anything']) {
      expect(hasGeminiVeoKey(E({ GEMINI_API_KEY: 'k', GEMINI_VEO_ENABLED: v }))).toBe(true);
    }
  });
});

describe('the existing providers are unaffected', () => {
  it('Replicate alone still counts', () => {
    expect(hasVideoProvider(E({ REPLICATE_API_TOKEN: 't' }))).toBe(true);
  });

  it('no provider at all is still false — the halt-before-spending guard must survive', () => {
    expect(hasVideoProvider(E({}))).toBe(false);
  });

  it('an empty or whitespace key is not a key', () => {
    expect(hasVideoProvider(E({ GEMINI_API_KEY: '   ' }))).toBe(false);
  });
});
