import { hasGeminiVeoProvider, geminiVeoModel } from './geminiVeo';

/**
 * Locks the LIVE-BY-DEFAULT contract: with a Gemini key present, Veo is the PRIMARY clip engine unless
 * GEMINI_VEO_ENABLED is explicitly disabled (0/false/no/off), which reverts to the Runway→Kling→LTX cascade.
 * (A fake key is stubbed so the flag logic is actually exercised rather than passing vacuously on a keyless env.)
 */
describe('geminiVeo gating', () => {
  const origFlag = process.env.GEMINI_VEO_ENABLED;
  const origKey = process.env.GEMINI_API_KEY;
  beforeEach(() => { process.env.GEMINI_API_KEY = 'test-gemini-key'; });
  afterEach(() => {
    if (origFlag === undefined) delete process.env.GEMINI_VEO_ENABLED; else process.env.GEMINI_VEO_ENABLED = origFlag;
    if (origKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = origKey;
  });

  it('is ON by default (flag unset) when a Gemini key is present', () => {
    delete process.env.GEMINI_VEO_ENABLED;
    expect(hasGeminiVeoProvider()).toBe(true);
  });

  it('is OFF when explicitly disabled — the kill-switch reverts to Runway', () => {
    for (const v of ['0', 'false', 'no', 'off']) {
      process.env.GEMINI_VEO_ENABLED = v;
      expect(hasGeminiVeoProvider()).toBe(false);
    }
  });

  it('stays ON for truthy / empty flag values', () => {
    for (const v of ['1', 'true', 'yes', 'on', '']) {
      process.env.GEMINI_VEO_ENABLED = v;
      expect(hasGeminiVeoProvider()).toBe(true);
    }
  });

  it('is OFF without any Gemini key regardless of the flag', () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_VEO_ENABLED;
    expect(hasGeminiVeoProvider()).toBe(false);
  });

  it('exposes an env-overridable Veo model default', () => {
    expect(geminiVeoModel()).toContain('veo');
  });
});
