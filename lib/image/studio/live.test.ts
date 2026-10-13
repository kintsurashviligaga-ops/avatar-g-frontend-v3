/** @jest-environment node */
jest.mock('server-only', () => ({}));
const mockBucket = jest.fn();
const mockUpload = jest.fn();
const mockMaybeSingle = jest.fn();
const mockEq = jest.fn();
const query = () => ({ select: () => query(), eq: (...args: unknown[]) => { mockEq(...args); return query(); }, maybeSingle: () => mockMaybeSingle() });
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => ({
  from: () => query(), storage: { getBucket: (...a: unknown[]) => mockBucket(...a), from: () => ({ upload: (...a: unknown[]) => mockUpload(...a) }) },
}) }));
jest.mock('../../orchestrator/ledger', () => ({ deductCreditsOnce: jest.fn(), netDebitedForRef: jest.fn(), refundCredits: jest.fn() }));
jest.mock('../../observability/report-error', () => ({ reportError: jest.fn() }));
const mockFetch = jest.fn();
jest.mock('../../web/publicFetch', () => ({ fetchPublicBytes: (...a: unknown[]) => mockFetch(...a) }));
const mockSign = jest.fn();
jest.mock('../../orchestrator/storage-adapter', () => ({
  createSignedAssetUrl: (...a: unknown[]) => mockSign(...a),
  ownStorageHosts: () => new Set(['own.supabase.co']),
  describeSupabaseObjectUrl: (url: string) => {
    const match = /^https:\/\/own.supabase.co\/storage\/v1\/object\/sign\/([^/]+)\/(.+)\?token=x$/.exec(url);
    return match ? { host: 'own.supabase.co', access: 'sign', bucket: match[1], path: match[2] } : null;
  },
}));
jest.mock('../../ai/google/transport', () => ({ googleTransportKind: () => 'vertex', googleTransports: { selectFixed: jest.fn() } }));
jest.mock('../../platform/upstash', () => ({ createUpstashRedis: jest.fn() }));
import { liveImageDeps } from './live';
import { fakeImage } from './testing';
beforeEach(() => {
  jest.clearAllMocks();
  mockBucket.mockResolvedValue({ data: { public: false }, error: null });
  mockSign.mockImplementation(async (bucket, path) => 'https://own.supabase.co/storage/v1/object/sign/' + bucket + '/' + path + '?token=x');
  mockUpload.mockResolvedValue({ error: null });
});
test('strict upload ownership rejects another prefix before signing or download', async () => {
  await expect(liveImageDeps().prepare({ id: 'face', role: 'face', asset: { kind: 'upload', path: 'omni-uploads/other/face.png' } }, 'me')).rejects.toMatchObject({ code: 'not_found' });
  expect(mockSign).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});
test('public bucket is refused; no automatic bucket creation or permission mutation', async () => {
  mockBucket.mockResolvedValue({ data: { public: true }, error: null });
  await expect(liveImageDeps().persistPayload('job', 'me', {} as never)).rejects.toMatchObject({ code: 'storage_error' });
  expect(mockUpload).not.toHaveBeenCalled();
});
test('owned Library row cannot vouch for another user’s private object', async () => {
  const id = '12345678-1234-4234-8234-123456789abc';
  mockMaybeSingle.mockResolvedValue({ data: { user_id: 'me', service_type: 'image', signed_url:
    'https://own.supabase.co/storage/v1/object/sign/renders/image-studio/other/' + id + '/result.png?token=x' }, error: null });
  await expect(liveImageDeps().prepare({ id: 'face', role: 'face', asset: { kind: 'result', id } }, 'me')).rejects.toMatchObject({ code: 'not_found' });
  expect(mockEq).toHaveBeenCalledWith('user_id', 'me');
  expect(mockSign).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});
test('owned reference decodes its bounded bytes and carries the explicit role', async () => {
  const f = await fakeImage();
  mockFetch.mockResolvedValue({ ok: true, bytes: f.png, contentType: 'image/png' });
  const r = await liveImageDeps().prepare({ id: 'face', role: 'face', asset: { kind: 'upload', path: 'omni-uploads/me/face.png' } }, 'me');
  expect(r).toMatchObject({ id: 'face', role: 'face', width: 1024, height: 1024 });
  expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({ maxHops: 0, maxBytes: 12 * 1024 * 1024 });
});
test('storage write failure cannot be returned as a saved image URL', async () => {
  mockUpload.mockResolvedValue({ error: { message: 'disk unavailable' } });
  await expect(liveImageDeps().persistPayload('job', 'me', {} as never)).rejects.toMatchObject({ code: 'storage_error' });
  expect(mockSign).not.toHaveBeenCalled();
});
