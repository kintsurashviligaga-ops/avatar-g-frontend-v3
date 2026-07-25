import { hasLyriaProvider, lyriaModel } from './lyriaMusic';

/**
 * Locks the "opt-in, zero-regression" contract: Lyria is the PRIMARY music engine only when LYRIA_ENABLED is
 * explicitly truthy — otherwise the existing Udio→ElevenLabs→MusicGen chain is byte-identical.
 */
describe('lyriaMusic gating', () => {
  const orig = process.env.LYRIA_ENABLED;
  afterEach(() => { if (orig === undefined) delete process.env.LYRIA_ENABLED; else process.env.LYRIA_ENABLED = orig; });

  it('is OFF when the flag is unset (default) — chain unchanged', () => {
    delete process.env.LYRIA_ENABLED;
    expect(hasLyriaProvider()).toBe(false);
  });

  it('is OFF when the flag is explicitly falsy', () => {
    for (const v of ['0', 'false', 'no', 'off', '']) {
      process.env.LYRIA_ENABLED = v;
      expect(hasLyriaProvider()).toBe(false);
    }
  });

  it('exposes an env-overridable Lyria model default', () => {
    expect(lyriaModel()).toContain('lyria');
  });
});
