/**
 * Provider env-map tests — the degraded → operational gate.
 */
import { isProviderActive, providerSnapshot, providerKey } from './providers';

describe('provider env-map', () => {
  test('single-key provider activates when its key is present', () => {
    expect(isProviderActive('elevenlabs', {})).toBe(false);
    expect(isProviderActive('elevenlabs', { ELEVENLABS_API_KEY: 'x' })).toBe(true);
  });

  test('gemini accepts only the canonical Developer API key', () => {
    expect(isProviderActive('gemini', { GOOGLE_GENERATIVE_AI_API_KEY: 'g' })).toBe(false);
    expect(isProviderActive('gemini', { GEMINI_API_KEY: 'g' })).toBe(true);
    expect(isProviderActive('gemini', {})).toBe(false);
  });

  test('azure_speech remains disabled with credentials', () => {
    expect(isProviderActive('azure_speech', { AZURE_COGNITIVE_SECRET: 's' })).toBe(false);
    expect(isProviderActive('azure_speech', { AZURE_SPEECH_REGION: 'eu' })).toBe(false);
    expect(isProviderActive('azure_speech', { AZURE_COGNITIVE_SECRET: 's', AZURE_SPEECH_REGION: 'eu' })).toBe(false);
  });

  test('runpod remains disabled with credentials', () => {
    expect(isProviderActive('runpod', { RUNPOD_RENDER_WEBHOOK_URL: 'u' })).toBe(false);
    expect(isProviderActive('runpod', { RUNPOD_RENDER_WEBHOOK_URL: 'u', RUNPOD_RENDER_WEBHOOK_TOKEN: 't' })).toBe(false);
    expect(isProviderActive('runpod', { RUNPOD_RENDER_WEBHOOK_URL: 'u', RUNPOD_API_TOKEN: 't' })).toBe(false);
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


test.each(['typo', 'auto', ''])('invalid Google transport %s refuses readiness and credential retrieval', (transport) => {
  const env = { GEMINI_TRANSPORT: transport, GEMINI_API_KEY: 'canonical' };
  expect(isProviderActive('gemini', env)).toBe(false);
  expect(providerKey('gemini', env)).toBeNull();
});

test('Vertex readiness normalizes selector and never returns a Developer key', () => {
  const env = { GEMINI_TRANSPORT: ' Vertex ', GEMINI_API_KEY: 'developer-key', GCP_PROJECT_ID: 'test-project', GCP_PROJECT_NUMBER: '123456789', GCP_SERVICE_ACCOUNT_EMAIL: 'runner@test-project.iam.gserviceaccount.com', GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool', GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider' };
  expect(isProviderActive('gemini', env)).toBe(true);
  expect(providerKey('gemini', env)).toBeNull();
  expect(isProviderActive('gemini', { ...env, GCP_PROJECT_ID: undefined })).toBe(false);
});
