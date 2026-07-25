import { hasGeminiVeoProvider, geminiVeoModel } from './geminiVeo';

/**
 * Locks the "opt-in, zero-regression" contract: the Veo primary tier is OFF unless GEMINI_VEO_ENABLED is
 * explicitly truthy, so the existing Runway→Kling→LTX cascade is byte-identical until an operator flips it on.
 */
describe('geminiVeo gating', () => {
  const orig = process.env.GEMINI_VEO_ENABLED;
  afterEach(() => { if (orig === undefined) delete process.env.GEMINI_VEO_ENABLED; else process.env.GEMINI_VEO_ENABLED = orig; });

  it('is OFF when the flag is unset (default) — cascade unchanged', () => {
    delete process.env.GEMINI_VEO_ENABLED;
    expect(hasGeminiVeoProvider()).toBe(false);
  });

  it('is OFF when the flag is explicitly falsy', () => {
    for (const v of ['0', 'false', 'no', 'off', '']) {
      process.env.GEMINI_VEO_ENABLED = v;
      expect(hasGeminiVeoProvider()).toBe(false);
    }
  });

  it('exposes an env-overridable Veo model default', () => {
    expect(geminiVeoModel()).toContain('veo');
  });
});
