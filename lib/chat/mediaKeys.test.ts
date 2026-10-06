import { resolveUdioApiKey, hasUdioApiKey, resolveElevenLabsApiKey, hasElevenLabsApiKey, ELEVENLABS_API_KEY_ALIASES, resolveNanoBananaApiKey, hasNanoBananaApiKey, NANOBANANA_API_KEY_ALIASES, resolveAliasName } from './mediaKeys';
test('retired Udio credentials cannot enable any request', () => {
  for (const name of ['UDIO_API_KEY', 'UDIO_KEY', 'UDIOAPI_KEY', 'UDIO_API_TOKEN']) {
    expect(resolveUdioApiKey({ [name]: 'retired-secret' })).toBeNull();
    expect(hasUdioApiKey({ [name]: 'retired-secret' })).toBe(false);
  }
});
test('ElevenLabs accepts only the canonical server key', () => {
  expect(resolveElevenLabsApiKey({ ELEVENLABS_API_KEY: ' canonical ' })).toBe('canonical');
  for (const name of ['XI_API_KEY', 'ELEVEN_API_KEY', 'ELEVENLABS_KEY']) expect(hasElevenLabsApiKey({ [name]: 'old-secret' })).toBe(false);
  expect(ELEVENLABS_API_KEY_ALIASES).toEqual(['ELEVENLABS_API_KEY']);
});
test('Google media shares only GEMINI_API_KEY', () => {
  expect(resolveNanoBananaApiKey({ NANOBANANA_API_KEY: 'dedicated', GEMINI_API_KEY: ' canonical ' })).toBe('canonical');
  for (const name of ['NANOBANANA_API_KEY', 'NANO_BANANA_API_KEY', 'NANOBANANA_KEY']) expect(hasNanoBananaApiKey({ [name]: 'old-secret' })).toBe(false);
  expect(NANOBANANA_API_KEY_ALIASES).toEqual(['GEMINI_API_KEY']);
});
test('diagnostics contain the configured canonical name, never its value', () => {
  expect(resolveAliasName(ELEVENLABS_API_KEY_ALIASES, { ELEVENLABS_API_KEY: 'secret' })).toBe('ELEVENLABS_API_KEY');
  expect(resolveAliasName(ELEVENLABS_API_KEY_ALIASES, { XI_API_KEY: 'secret' })).toBeNull();
});
