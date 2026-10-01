/** @jest-environment node */
let mockKey = '';
jest.mock('../orchestrator/gemini-guard', () => ({
  ...jest.requireActual('../orchestrator/gemini-guard'),
  resolveGeminiKey: jest.fn(() => mockKey),
}));

import { hasLyriaProvider, lyriaModel } from './lyriaMusic';

/**
 * Locks the LIVE-BY-DEFAULT contract: with a Gemini key present, Lyria 3 is the PRIMARY music engine unless
 * LYRIA_ENABLED is explicitly falsy (the instant kill-switch back to Udio → ElevenLabs → MusicGen).
 *
 * ⚠️ THIS FILE USED TO PIN THE OPPOSITE ("OFF when the flag is unset") — and passed, because the test env has
 * no Gemini key, so `hasLyriaProvider()` was false for the key's sake, not the flag's. The key is mocked now,
 * so every case below is decided by the flag alone (plus one case for the missing key).
 */
describe('lyriaMusic gating', () => {
  const orig = process.env.LYRIA_ENABLED;
  beforeEach(() => { mockKey = 'test-gemini-key'; });
  afterEach(() => { if (orig === undefined) delete process.env.LYRIA_ENABLED; else process.env.LYRIA_ENABLED = orig; });

  it('is ON by default when a key is present and the flag is unset', () => {
    delete process.env.LYRIA_ENABLED;
    expect(hasLyriaProvider()).toBe(true);
  });

  it('stays ON for an empty or truthy flag — only an explicit falsy value kills it', () => {
    for (const v of ['', '1', 'true', 'yes', 'on']) {
      process.env.LYRIA_ENABLED = v;
      expect(hasLyriaProvider()).toBe(true);
    }
  });

  it('is OFF when the kill-switch is set to an explicit falsy value', () => {
    for (const v of ['0', 'false', 'no', 'off', ' OFF ']) {
      process.env.LYRIA_ENABLED = v;
      expect(hasLyriaProvider()).toBe(false);
    }
  });

  it('is OFF without a Gemini key, whatever the flag says', () => {
    mockKey = '';
    for (const v of [undefined, '1']) {
      if (v === undefined) delete process.env.LYRIA_ENABLED; else process.env.LYRIA_ENABLED = v;
      expect(hasLyriaProvider()).toBe(false);
    }
  });

  it('exposes an env-overridable Lyria model default', () => {
    expect(lyriaModel()).toContain('lyria');
  });
});
