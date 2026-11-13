import {
  resolveUdioApiKey, hasUdioApiKey, UDIO_API_KEY_ALIASES,
  resolveElevenLabsApiKey, hasElevenLabsApiKey, ELEVENLABS_API_KEY_ALIASES,
  resolveAliasName,
} from './mediaKeys';

describe('resolveUdioApiKey — alias-tolerant Udio credential resolution (legacy)', () => {
  it('prefers UDIO_API_KEY, then walks the fallback chain', () => {
    expect(resolveUdioApiKey({ UDIO_API_KEY: 'canonical', UDIO_KEY: 'a' })).toBe('canonical');
    expect(resolveUdioApiKey({ UDIO_KEY: 'a', UDIOAPI_KEY: 'b' })).toBe('a');
    expect(resolveUdioApiKey({ UDIO_API_TOKEN: 'z' })).toBe('z');
  });

  it('trims whitespace and skips empty values', () => {
    expect(resolveUdioApiKey({ UDIO_API_KEY: '  spaced  ' })).toBe('spaced');
    expect(resolveUdioApiKey({ UDIO_API_KEY: '   ', UDIO_KEY: 'real' })).toBe('real');
  });

  it('returns null and hasUdioApiKey=false when unprovisioned', () => {
    expect(resolveUdioApiKey({})).toBeNull();
    expect(hasUdioApiKey({})).toBe(false);
    expect(hasUdioApiKey({ UDIO_KEY: 'x' })).toBe(true);
  });

  it('exposes its alias precedence list', () => {
    expect(UDIO_API_KEY_ALIASES).toEqual(['UDIO_API_KEY', 'UDIO_KEY', 'UDIOAPI_KEY', 'UDIO_API_TOKEN']);
  });
});

describe('resolveElevenLabsApiKey — alias-tolerant ElevenLabs credential resolution', () => {
  it('prefers ELEVENLABS_API_KEY and honours XI_API_KEY as a header-derived alias', () => {
    expect(resolveElevenLabsApiKey({ ELEVENLABS_API_KEY: 'canonical', XI_API_KEY: 'a' })).toBe('canonical');
    expect(resolveElevenLabsApiKey({ XI_API_KEY: 'header-alias' })).toBe('header-alias');
    expect(resolveElevenLabsApiKey({ ELEVEN_API_KEY: 'a', ELEVENLABS_KEY: 'b' })).toBe('a');
  });

  it('returns null and hasElevenLabsApiKey=false when unprovisioned', () => {
    expect(resolveElevenLabsApiKey({})).toBeNull();
    expect(hasElevenLabsApiKey({})).toBe(false);
    expect(hasElevenLabsApiKey({ ELEVENLABS_KEY: 'x' })).toBe(true);
  });

  it('exposes its alias precedence list', () => {
    expect(ELEVENLABS_API_KEY_ALIASES).toEqual(['ELEVENLABS_API_KEY', 'ELEVEN_API_KEY', 'ELEVENLABS_KEY', 'XI_API_KEY']);
  });
});

describe('resolveAliasName — names-only diagnostic helper (never exposes the value)', () => {
  it('reports which alias resolved, by name only', () => {
    expect(resolveAliasName(UDIO_API_KEY_ALIASES, { UDIO_KEY: 'secret' })).toBe('UDIO_KEY');
    expect(resolveAliasName(ELEVENLABS_API_KEY_ALIASES, { XI_API_KEY: 'secret' })).toBe('XI_API_KEY');
  });

  it('returns null when nothing is provisioned', () => {
    expect(resolveAliasName(UDIO_API_KEY_ALIASES, {})).toBeNull();
  });
});
