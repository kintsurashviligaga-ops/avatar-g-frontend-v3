/** @jest-environment node */
jest.mock('server-only', () => ({}));
import { hasReplicateToken, hasVideoProvider, computeVideoProviderStatus, selectVideoPrimaryProvider,
  videoProviderUnavailableMessage, videoProviderConnectionFailedMessage } from './videoProvider';

const vertex = { GCP_PROJECT_ID: 'my-proj', GCP_VEO_BUCKET: 'my-bucket', GCP_PROJECT_NUMBER: '123456789012',
  GCP_SERVICE_ACCOUNT_EMAIL: 'veo@my-proj.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool', GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider' };

test.each([{ REPLICATE_API_TOKEN: 'legacy' }, { LTX_API_KEY: 'legacy' }, { LTX_VIDEO_API_KEY: 'legacy' },
  { GOOGLE_GENERATIVE_AI_API_KEY: 'legacy' }])('deprecated keys never enable video: %p', env => {
  expect(hasVideoProvider(env)).toBe(false);
  expect(hasReplicateToken(env)).toBe(false);
  expect(selectVideoPrimaryProvider(env)).toEqual({ primary: null, reason: 'no-provider' });
});
test('canonical Gemini credentials enable Veo', () => {
  expect(computeVideoProviderStatus({ GEMINI_API_KEY: 'key' })).toMatchObject({ ready: true, veo: true, transport: 'gemini', ltx: false, replicate: false });
});
test('Vertex readiness does not require a Developer API key', () => {
  expect(computeVideoProviderStatus(vertex)).toMatchObject({ ready: true, transport: 'vertex' });
});
test('pinned Vertex fails closed even with a working Developer API key', () => {
  expect(hasVideoProvider({ GEMINI_TRANSPORT: 'vertex', GEMINI_API_KEY: 'key' })).toBe(false);
  expect(hasVideoProvider({ VEO_TRANSPORT: 'vertex', GEMINI_API_KEY: 'key' })).toBe(false);
});
test('a malformed or empty configuration is not ready', () => {
  expect(hasVideoProvider({ ...vertex, GCP_VEO_BUCKET: 'https://bad/bucket' })).toBe(false);
  expect(hasVideoProvider({})).toBe(false);
});
test('the snapshot contains names and booleans, never credentials', () => {
  expect(JSON.stringify(computeVideoProviderStatus({ GEMINI_API_KEY: 'sensitive-value' }))).not.toContain('sensitive-value');
});

describe('videoProviderUnavailableMessage', () => {
  test('Georgian is the canonical copy and matches the product spec verbatim', () => {
    expect(videoProviderUnavailableMessage('ka')).toBe(
      'სისტემური ხარვეზი: ვიდეო პროვაიდერი მიუწვდომელია. გთხოვთ, შეავსოთ API ცვლადები.',
    );
  });

  test('falls back to Georgian for an unknown locale', () => {
    expect(videoProviderUnavailableMessage('zz')).toContain('სისტემური ხარვეზი');
  });

  test('localizes en + ru', () => {
    expect(videoProviderUnavailableMessage('en')).toMatch(/video provider is unavailable/i);
    expect(videoProviderUnavailableMessage('ru')).toMatch(/видео-провайдер недоступен/i);
  });
});

describe('videoProviderConnectionFailedMessage', () => {
  test('Georgian is the canonical runtime-failure copy and matches the spec verbatim', () => {
    expect(videoProviderConnectionFailedMessage('ka')).toBe(
      'ვიდეო პროვაიდერთან კავშირი ვერ დამყარდა. ბალანსი დაცულია.',
    );
  });

  test('is distinct from the config-missing "unavailable" message', () => {
    expect(videoProviderConnectionFailedMessage('ka')).not.toBe(videoProviderUnavailableMessage('ka'));
  });

  test('promises balance protection in en + ru', () => {
    expect(videoProviderConnectionFailedMessage('en')).toMatch(/balance is protected/i);
    expect(videoProviderConnectionFailedMessage('ru')).toMatch(/Баланс сохранён/i);
  });

  test('falls back to Georgian for an unknown locale', () => {
    expect(videoProviderConnectionFailedMessage('zz')).toContain('ბალანსი დაცულია');
  });
});

test.each(['', 'typo', 'auto'])('invalid transport %p fails closed even when keys exist', value => {
  expect(hasVideoProvider({ ...vertex, GEMINI_API_KEY: 'key', GEMINI_TRANSPORT: value })).toBe(false);
  expect(hasVideoProvider({ ...vertex, GEMINI_API_KEY: 'key', VEO_TRANSPORT: value })).toBe(false);
});
