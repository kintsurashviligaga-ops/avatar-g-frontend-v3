/** @jest-environment node */
jest.mock('server-only', () => ({}));
import { createHfClient, extractOutputUrls, hfAuthHeaderFromEnv, mapHttpError } from './client';

test('retired Higgsfield cannot build a client or retrieve legacy credentials', () => {
  expect(hfAuthHeaderFromEnv({ HF_CREDENTIALS: 'id:secret' } as NodeJS.ProcessEnv)).toBeNull();
  expect(hfAuthHeaderFromEnv({ HF_API_KEY_ID: 'id', HF_API_KEY_SECRET: 'secret' } as NodeJS.ProcessEnv)).toBeNull();
  const fetchImpl = jest.fn();
  expect(() => createHfClient({ authHeader: 'Key id:secret', fetchImpl })).toThrow(expect.objectContaining({ code: 'provider_deprecated' }));
  expect(fetchImpl).not.toHaveBeenCalled();
});

describe('error mapping (docs/concepts/errors)', () => {
  test.each([
    [400, 'Maximum number of concurrent requests (4) has been reached', 'concurrency'],
    [400, 'Invalid parameters', 'bad_request'],
    [401, 'Invalid credentials', 'auth'],
    [403, 'Insufficient credits', 'credits_exhausted'],
    [404, 'Not found', 'model_unavailable'],
    [422, '[{"loc":["body","duration"]}]', 'validation'],
    [423, 'blocked', 'model_unavailable'],
    [503, 'disabled', 'model_unavailable'],
    [500, 'x', 'server'],
  ])('%s %s → %s', (status, detail, code) => {
    expect(mapHttpError(status, detail)).toBe(code);
  });

});

describe('extractOutputUrls', () => {
  test('status body and webhook payload shapes; https only; de-duplicated', () => {
    expect(extractOutputUrls({ images: [{ url: 'https://a/1.jpg' }, { url: 'https://a/2.jpg' }] })).toEqual(['https://a/1.jpg', 'https://a/2.jpg']);
    expect(extractOutputUrls({ payload: { video: { url: 'https://a/v.mp4', content_type: 'video/mp4' } } })).toEqual(['https://a/v.mp4']);
    expect(extractOutputUrls({ audio: { url: 'https://a/s.mp3' }, audios: [{ url: 'https://a/s.mp3' }] })).toEqual(['https://a/s.mp3']);
    expect(extractOutputUrls({ images: [{ url: 'http://plain/x.jpg' }, { url: 'javascript:alert(1)' }] })).toEqual([]);
    expect(extractOutputUrls(null)).toEqual([]);
  });
});
