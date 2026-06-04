import { resolveLtxApiKey, hasLtxApiKey, LTX_API_KEY_ALIASES } from './ltxKey';

describe('resolveLtxApiKey — alias-tolerant LTX credential resolution', () => {
  it('prefers LTX2_API_KEY when present (the proven-funded production alias)', () => {
    // Live-fire proved LTX2_API_KEY is the funded/working key while a co-present
    // LTX_VIDEO_API_KEY charged-but-stalled, so the resolver leads with LTX2.
    const env = { LTX_VIDEO_API_KEY: 'stale', LTX_API_KEY: 'a', LTX2_API_KEY: 'funded' };
    expect(resolveLtxApiKey(env)).toBe('funded');
  });

  it('falls back to LTX_VIDEO_API_KEY, then LTX_API_KEY', () => {
    expect(resolveLtxApiKey({ LTX_VIDEO_API_KEY: 'v', LTX_API_KEY: 'a' })).toBe('v');
    expect(resolveLtxApiKey({ LTX_API_KEY: 'a' })).toBe('a');
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
    expect(LTX_API_KEY_ALIASES).toEqual(['LTX2_API_KEY', 'LTX_VIDEO_API_KEY', 'LTX_API_KEY']);
  });
});
