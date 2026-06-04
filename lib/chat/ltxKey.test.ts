import { resolveLtxApiKey, hasLtxApiKey, LTX_API_KEY_ALIASES } from './ltxKey';

describe('resolveLtxApiKey — alias-tolerant LTX credential resolution', () => {
  it('prefers LTX_VIDEO_API_KEY when present (prod\'s dispatch-valid funded alias)', () => {
    const env = { LTX_VIDEO_API_KEY: 'canonical', LTX_API_KEY: 'a', LTX2_API_KEY: 'b' };
    expect(resolveLtxApiKey(env)).toBe('canonical');
  });

  it('falls back to LTX_API_KEY, then LTX2_API_KEY', () => {
    expect(resolveLtxApiKey({ LTX_API_KEY: 'a', LTX2_API_KEY: 'b' })).toBe('a');
    expect(resolveLtxApiKey({ LTX2_API_KEY: 'b' })).toBe('b');
  });

  it('trims surrounding whitespace', () => {
    expect(resolveLtxApiKey({ LTX2_API_KEY: '  spaced  ' })).toBe('spaced');
  });

  it('treats empty / whitespace-only values as absent and keeps scanning', () => {
    expect(resolveLtxApiKey({ LTX_VIDEO_API_KEY: '   ', LTX2_API_KEY: 'real' })).toBe('real');
    expect(resolveLtxApiKey({ LTX_VIDEO_API_KEY: '', LTX_API_KEY: '' })).toBeNull();
  });

  it('returns null when no alias is provisioned', () => {
    expect(resolveLtxApiKey({})).toBeNull();
    expect(hasLtxApiKey({})).toBe(false);
  });

  it('hasLtxApiKey mirrors resolveLtxApiKey presence', () => {
    expect(hasLtxApiKey({ LTX2_API_KEY: 'x' })).toBe(true);
  });

  it('exposes the alias precedence list for config-audit parity', () => {
    expect(LTX_API_KEY_ALIASES).toEqual(['LTX_VIDEO_API_KEY', 'LTX_API_KEY', 'LTX2_API_KEY']);
  });
});
