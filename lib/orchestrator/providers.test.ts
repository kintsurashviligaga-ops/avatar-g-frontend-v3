/**
 * Provider env-map tests — the degraded → operational gate.
 */
import { isProviderActive, providerSnapshot, providerKey } from './providers';

describe('provider env-map', () => {
  test('single-key provider activates when its key is present', () => {
    expect(isProviderActive('elevenlabs', {})).toBe(false);
    expect(isProviderActive('elevenlabs', { ELEVENLABS_API_KEY: 'x' })).toBe(true);
  });

  test('gemini accepts either of its two keys', () => {
    expect(isProviderActive('gemini', { GOOGLE_GENERATIVE_AI_API_KEY: 'g' })).toBe(true);
    expect(isProviderActive('gemini', { GEMINI_API_KEY: 'g' })).toBe(true);
    expect(isProviderActive('gemini', {})).toBe(false);
  });

  test('azure_speech requires BOTH secret and region', () => {
    expect(isProviderActive('azure_speech', { AZURE_COGNITIVE_SECRET: 's' })).toBe(false);
    expect(isProviderActive('azure_speech', { AZURE_SPEECH_REGION: 'eu' })).toBe(false);
    expect(isProviderActive('azure_speech', { AZURE_COGNITIVE_SECRET: 's', AZURE_SPEECH_REGION: 'eu' })).toBe(true);
  });

  test('runpod requires URL plus a token (either token name)', () => {
    expect(isProviderActive('runpod', { RUNPOD_RENDER_WEBHOOK_URL: 'u' })).toBe(false);
    expect(isProviderActive('runpod', { RUNPOD_RENDER_WEBHOOK_URL: 'u', RUNPOD_RENDER_WEBHOOK_TOKEN: 't' })).toBe(true);
    expect(isProviderActive('runpod', { RUNPOD_RENDER_WEBHOOK_URL: 'u', RUNPOD_API_TOKEN: 't' })).toBe(true);
  });

  test('blank/whitespace keys do not activate', () => {
    expect(isProviderActive('heygen', { HEYGEN_API_KEY: '   ' })).toBe(false);
  });

  test('providerKey returns the first present value', () => {
    expect(providerKey('gemini', { GEMINI_API_KEY: 'a' })).toBe('a');
    expect(providerKey('gemini', {})).toBeNull();
  });

  test('snapshot covers every provider', () => {
    const snap = providerSnapshot({ ELEVENLABS_API_KEY: 'x' });
    expect(snap.elevenlabs).toBe(true);
    expect(snap.luma).toBe(false);
    expect(Object.keys(snap).length).toBeGreaterThanOrEqual(13);
  });
});
